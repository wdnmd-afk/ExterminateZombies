import Phaser from 'phaser';
import { DEPTH } from '../constants';
import type { Prop } from '../entities/Prop';
import type { Player } from '../entities/Player';
import type { Zombie } from '../entities/Zombie';
import type { EffectDef, LingerDef } from '../config/types';
import { angleBetween, distanceSq } from '../utils/math';
import { SoundManager, type SoundLoopHandle } from './SoundManager';
import type { DamageImpact } from './FeedbackRules';
import { UI_FONT_FAMILY } from '../ui/fonts';
import type { PlayerDamageSource } from './CombatDiagnostics';
import type { EffectSpritePool } from './EffectSpritePool';
import { EFFECT_ASSET_KEYS, getEffectLayout, type EffectAssetKey } from '../config/effectVisuals';

/**
 * 减速区的刷新间隔（毫秒）。
 *
 * 不复用火焰的 `tickRate`：火焰那一跳是**伤害结算**，间隔直接决定总伤害，因此必须
 * 由配置逐项给出；减速只是状态刷新，间隔快慢不改变效果强度，只影响「走出区域后
 * 多久恢复」的手感，因此固定一个值即可，不给配置面增加一个无意义的旋钮。
 */
const SLOW_ZONE_TICK_RATE = 200;

interface LingerZone {
  x: number;
  y: number;
  def: LingerDef;
  expiresAt: number;
  lastTickAt: number;
  visual: Phaser.GameObjects.Arc;
  /**
   * 位图介质层：火焰区是 fire-patch，粉尘/寒雾区是 dust-cloud。
   * `null` 表示素材缺失、本区只有图元表现。
   *
   * 与 `visual` 并存而不是替换它：图元圆同时承担"区域边界"的读数（玩家要能看出
   * 踩进去会掉血、或会被挡住的确切范围），而位图介质的轮廓是撕裂的、边界不精确。
   * 位图存在时把图元压到很低的不透明度当作边界提示，两者叠加。
   */
  zoneSprite: Phaser.GameObjects.Sprite | null;
  soundHandle: SoundLoopHandle | null;
}

interface EnemyBlast {
  x: number;
  y: number;
  radius: number;
  damage: number;
  detonateAt: number;
  visual: Phaser.GameObjects.Arc;
  ring: Phaser.GameObjects.Arc;
  sourceIsActive: () => boolean;
  triggerProps: boolean;
}

interface AreaEffectFactoryOptions {
  scene: Phaser.Scene;
  player: Player;
  getZombies: () => Zombie[];
  getProps: () => Prop[];
  damageZombie: (zombie: Zombie, amount: number, impact?: DamageImpact) => void;
  damagePlayer: (amount: number, source: PlayerDamageSource) => void;
  detonateProp: (prop: Prop, chainSet: Set<Prop>) => void;
  /**
   * 位图特效池。可选：不传时全部走图元路径，行为与接入位图前完全一致。
   *
   * 做成可选是为了让"素材/预载出问题"和"没接池子"退化到同一条已验证的回落路径，
   * 而不是多出一种半亮半黑的中间状态。
   */
  effectSprites?: EffectSpritePool;
}

export interface ActiveAreaEffectCounts {
  lingerZones: number;
  enemyBlasts: number;
}

/** 爆炸的视觉分类。由 `EffectDef.lingering?.kind` 推导，不需要新配置字段。 */
type BlastFlavor = 'highExplosive' | 'fuel' | 'dust';

interface BlastStyle {
  /** 位图相对爆炸直径的尺寸倍率。>1 表示火球画得比杀伤范围大。 */
  spriteScale: number;
  /** 位图染色。undefined 表示用素材原色。 */
  tint?: number;
  /** 余烟朵数与相对直径的尺寸倍率。0 朵表示不出烟。 */
  smokePuffs: number;
  smokeScale: number;
  smokeTint: number;
  /** 图元回落路径的核心闪光色。 */
  flashColor: number;
  sparkColor: number;
  /** 火花数量相对半径的密度系数，越大越密。 */
  sparkDensity: number;
}

/**
 * 三种爆炸的视觉差异表。
 *
 * 为什么靠 `lingering.kind` 推导而不是给 `EffectDef` 加字段：油桶配 `fire` 残留、
 * 面粉桶配 `dust` 残留、地雷与 RPG/M79 不配残留，这三档本来就与玩法语义一一对应。
 * 加一个 `blastFlavor` 字段等于把同一件事写两遍，还得在 validate 里防两者打架。
 *
 * 只有一张 `explosion.png` 素材（通用高爆：白核 + 碎块 + 收成烟球），所以差异化靠
 * 尺寸、染色、余烟量和火花密度做，而不是靠三张图：
 *
 *   地雷 highExplosive — 反步兵雷装药小、杀伤靠破片。火球压到比杀伤圈略小，
 *     火花给到最密，几乎不出烟；读作"一声脆响 + 一片破片"。
 *   油桶 fuel        — 燃料爆燃。火球画到比杀伤圈大 15%（燃料球本就外溢），
 *     染暖橙加强燃料感，出三朵浓黑烟；读作"翻滚火球 + 黑烟柱"。
 *   面粉桶 dust      — 粉尘爆燃的伤害最低(40)但范围最大(130)。火球压暗并染灰白，
 *     出四朵大而淡的白烟；读作"一团炸开的粉"，不该像火。
 */
const BLAST_STYLES: Record<BlastFlavor, BlastStyle> = {
  highExplosive: {
    spriteScale: 0.92,
    smokePuffs: 1,
    smokeScale: 0.5,
    smokeTint: 0x6b6b6b,
    flashColor: 0xffe7a0,
    sparkColor: 0xffd27a,
    sparkDensity: 22,
  },
  fuel: {
    spriteScale: 1.15,
    tint: 0xffb066,
    smokePuffs: 3,
    smokeScale: 0.78,
    smokeTint: 0x3a3128,
    flashColor: 0xffd08a,
    sparkColor: 0xff8c3a,
    sparkDensity: 34,
  },
  dust: {
    spriteScale: 1.05,
    tint: 0xd9cbb2,
    smokePuffs: 4,
    smokeScale: 0.95,
    smokeTint: 0xcfc6b4,
    flashColor: 0xf2e6cf,
    sparkColor: 0xd8c9a8,
    sparkDensity: 44,
  },
};

function resolveBlastFlavor(lingering: LingerDef | undefined): BlastFlavor {
  if (lingering?.kind === 'fire') return 'fuel';
  if (lingering?.kind === 'dust') return 'dust';
  return 'highExplosive';
}

/**
 * 残留区介质对应的位图帧条。
 *
 * `LingerDef.kind` 只有两种取值，所以这里是一个全覆盖的映射而不是带回落的查表：
 * 新增第三种介质时 TypeScript 会在这里报缺分支，而不是静默套用粉尘的贴图。
 */
function resolveZoneTexture(kind: LingerDef['kind']): EffectAssetKey {
  return kind === 'fire' ? EFFECT_ASSET_KEYS.firePatch : EFFECT_ASSET_KEYS.dustCloud;
}

/**
 * 统一处理爆炸、火焰残留区、粉尘阻挡区与连锁引爆。
 */
export class AreaEffectFactory {
  private scene: Phaser.Scene;
  private player: Player;
  private getZombies: () => Zombie[];
  private getProps: () => Prop[];
  private damageZombie: (zombie: Zombie, amount: number, impact?: DamageImpact) => void;
  private damagePlayer: (amount: number, source: PlayerDamageSource) => void;
  private detonateProp: (prop: Prop, chainSet: Set<Prop>) => void;
  private effectSprites: EffectSpritePool | null;
  private lingerZones: LingerZone[] = [];
  private enemyBlasts: EnemyBlast[] = [];

  constructor(options: AreaEffectFactoryOptions) {
    this.scene = options.scene;
    this.player = options.player;
    this.getZombies = options.getZombies;
    this.getProps = options.getProps;
    this.damageZombie = options.damageZombie;
    this.damagePlayer = options.damagePlayer;
    this.detonateProp = options.detonateProp;
    this.effectSprites = options.effectSprites ?? null;
  }

  explode(x: number, y: number, effect: EffectDef, chainSet = new Set<Prop>()): void {
    const radiusSq = effect.radius * effect.radius;

    SoundManager.playAt(effect.lingering?.kind === 'dust' ? 'dustBurst' : 'explosion', x, y);
    this.spawnFlash(x, y, effect.radius, resolveBlastFlavor(effect.lingering));

    for (const zombie of this.getZombies()) {
      if (distanceSq(x, y, zombie.x, zombie.y) <= radiusSq) {
        // 击退方向由爆心指向目标，形成向外炸开的观感。
        this.damageZombie(zombie, effect.damage, {
          angle: angleBetween(x, y, zombie.x, zombie.y),
          kind: 'explosion',
        });
      }
    }

    if (distanceSq(x, y, this.player.x, this.player.y) <= radiusSq) {
      this.damagePlayer(effect.damage, 'environment');
    }

    for (const prop of this.getProps()) {
      if (!prop.active || !prop.def.chainable || chainSet.has(prop)) continue;
      const triggerRadius = prop.def.radius ?? 16;
      const combined = effect.radius + triggerRadius;
      if (distanceSq(x, y, prop.x, prop.y) <= combined * combined) {
        chainSet.add(prop);
        this.detonateProp(prop, chainSet);
      }
    }

    if (effect.lingering) {
      this.spawnLingerZone(x, y, effect.lingering);
    }
  }

  /** Spawn a non-explosive residual zone, used by short-range flame projectiles. */
  linger(x: number, y: number, def: LingerDef): void {
    this.spawnLingerZone(x, y, def);
  }

  /**
   * 以玩家为中心的自身冲击波（角色主动技能用）。
   *
   * 不复用 `explode`：那条路径会把爆心伤害同时结算到玩家身上。玩家自己按下去的
   * 脱身技能如果把自己也炸掉一截血，就与「被围住时按它」的用途直接矛盾。
   * 因此这里只对感染体结算，并保留可连锁场景物的引爆——那部分是玩家想要的战术收益。
   *
   * 击退在这里显式施加而不是交给 `damageZombie`：范围伤害本身不带击退，
   * 而"推开一圈"正是这个技能的核心手感。Boss 由 `applyKnockback` 内部排除。
   */
  playerPulse(
    x: number,
    y: number,
    radius: number,
    damage: number,
    knockback: number,
  ): void {
    const radiusSq = radius * radius;
    SoundManager.playAt('explosion', x, y);
    // 走高爆样式：压制脉冲是一次冲击波，不是燃料燃烧也不是粉尘扬起。
    this.spawnFlash(x, y, radius, 'highExplosive');

    for (const zombie of this.getZombies()) {
      if (distanceSq(x, y, zombie.x, zombie.y) > radiusSq) continue;
      const angle = angleBetween(x, y, zombie.x, zombie.y);
      // 先击退再结算伤害，顺序与子弹命中一致：致死时尸体沿推开方向飞出。
      if (knockback > 0) zombie.applyKnockback(angle, knockback);
      this.damageZombie(zombie, damage, { angle, kind: 'explosion' });
    }

    const chainSet = new Set<Prop>();
    for (const prop of this.getProps()) {
      if (!prop.active || !prop.def.chainable || chainSet.has(prop)) continue;
      const triggerRadius = prop.def.radius ?? 16;
      const combined = radius + triggerRadius;
      if (distanceSq(x, y, prop.x, prop.y) <= combined * combined) {
        chainSet.add(prop);
        this.detonateProp(prop, chainSet);
      }
    }
  }

  update(now: number): void {
    this.updateEnemyBlasts(now);
    for (let i = this.lingerZones.length - 1; i >= 0; i--) {
      const zone = this.lingerZones[i];
      if (now >= zone.expiresAt) {
        SoundManager.stopLoop(zone.soundHandle);
        this.releaseZoneSprite(zone);
        zone.visual.destroy();
        this.lingerZones.splice(i, 1);
        continue;
      }

      if (zone.def.kind === 'fire') {
        const tickRate = zone.def.tickRate ?? 300;
        if (now - zone.lastTickAt < tickRate) continue;
        zone.lastTickAt = now;
        this.applyFireTick(zone);
        continue;
      }

      // 减速区：每 SLOW_ZONE_TICK_RATE 刷新一次区内敌人的减速，而不是一次性
      // 按 duration 施加。区域存活 5 秒不等于「碰一下就被减速 5 秒」——
      // 按短时效果反复刷新，敌人走出区域后自然在一跳内恢复。
      if (zone.def.slowFactor !== undefined && zone.def.slowFactor > 0) {
        if (now - zone.lastTickAt < SLOW_ZONE_TICK_RATE) continue;
        zone.lastTickAt = now;
        this.applySlowTick(zone);
      }
    }
  }

  /**
   * 把区域效果与敌方爆发的时间点整体后移 `offset` 毫秒，供战场解除冻结时调用。
   * 场景时钟在冻结期间仍跟随真实时间前进，不平移的话恢复瞬间残留区会直接过期，
   * 已经读条的敌方轰炸也会立刻结算成无法躲避的命中。
   */
  shiftTimers(offset: number): void {
    for (const zone of this.lingerZones) {
      zone.expiresAt += offset;
      zone.lastTickAt += offset;
    }
    for (const blast of this.enemyBlasts) {
      blast.detonateAt += offset;
    }
  }

  /** 敌方范围技能：预警期间不造成伤害，爆发只伤害玩家，不误伤敌群。 */
  scheduleEnemyBlast(
    x: number,
    y: number,
    radius: number,
    damage: number,
    windup: number,
    sourceIsActive: () => boolean,
    triggerProps = false,
  ): void {
    const visual = this.scene.add.circle(x, y, radius, 0xe75b45, 0.16).setDepth(DEPTH.effect);
    visual.setStrokeStyle(3, 0xffc4a8, 0.9);
    const ring = this.scene.add.circle(x, y, Math.max(14, radius * 0.22), 0xe75b45, 0).setDepth(DEPTH.effect);
    ring.setStrokeStyle(3, 0xffd0bb, 0.95);
    this.scene.tweens.add({
      targets: ring,
      scale: radius / Math.max(14, radius * 0.22),
      duration: windup,
      ease: 'Linear',
    });
    this.enemyBlasts.push({
      x,
      y,
      radius,
      damage,
      detonateAt: this.scene.time.now + windup,
      visual,
      ring,
      sourceIsActive,
      triggerProps,
    });
  }

  /** 判断某个点是否位于会阻挡僵尸的粉尘区。 */
  isEnemyBlocked(x: number, y: number): boolean {
    return this.lingerZones.some((zone) => {
      if (!zone.def.blocksEnemies) return false;
      return distanceSq(x, y, zone.x, zone.y) <= zone.def.radius * zone.def.radius;
    });
  }

  /** 只暴露数量，不把可变的区域效果对象交给诊断探针。 */
  getActiveCounts(): ActiveAreaEffectCounts {
    return {
      lingerZones: this.lingerZones.length,
      enemyBlasts: this.enemyBlasts.length,
    };
  }

  destroy(): void {
    for (const zone of this.lingerZones) {
      SoundManager.stopLoop(zone.soundHandle);
      this.releaseZoneSprite(zone);
      zone.visual.destroy();
    }
    this.lingerZones = [];
    for (const blast of this.enemyBlasts) {
      blast.visual.destroy();
      blast.ring.destroy();
    }
    this.enemyBlasts = [];
  }

  private updateEnemyBlasts(now: number): void {
    for (let index = this.enemyBlasts.length - 1; index >= 0; index--) {
      const blast = this.enemyBlasts[index];
      if (!blast.sourceIsActive()) {
        blast.visual.destroy();
        blast.ring.destroy();
        this.enemyBlasts.splice(index, 1);
        continue;
      }
      if (now < blast.detonateAt) continue;

      if (distanceSq(blast.x, blast.y, this.player.x, this.player.y) <= blast.radius * blast.radius) {
        this.damagePlayer(blast.damage, 'enemyBlast');
      }
      if (blast.triggerProps) {
        const chainSet = new Set<Prop>();
        for (const prop of this.getProps()) {
          if (!prop.active || !prop.def.chainable || chainSet.has(prop)) continue;
          const triggerRadius = prop.def.radius ?? 16;
          const combinedRadius = blast.radius + triggerRadius;
          if (distanceSq(blast.x, blast.y, prop.x, prop.y) > combinedRadius * combinedRadius) continue;
          chainSet.add(prop);
          this.detonateProp(prop, chainSet);
        }
      }
      // 敌方范围技能统一按高爆表现：它不是燃料也不是粉尘，且已有独立的红色预警圈。
      SoundManager.playAt('explosion', blast.x, blast.y);
      this.spawnFlash(blast.x, blast.y, blast.radius, 'highExplosive');
      blast.visual.destroy();
      blast.ring.destroy();
      this.enemyBlasts.splice(index, 1);
    }
  }

  /**
   * 爆炸的一次性表现。
   *
   * 位图路径与图元路径不是二选一的独立实现：位图只替换"火球"这一层，冲击环、
   * 飞散火花和 BOOM/KRAK 字样在两条路径下都保留。原因是那三样承担的是**可读性**
   * （范围、方向、量级），而位图承担的是**质感**——把可读性也交给一张 4 帧素材，
   * 半径 170 的 RPG 和半径 70 的地雷会因为同一张图缩放而失去量级差。
   */
  private spawnFlash(x: number, y: number, radius: number, flavor: BlastFlavor): void {
    const style = BLAST_STYLES[flavor];
    const usedBitmap = this.spawnBlastSprite(x, y, radius, style);

    // 位图自带白热核心，再叠图元闪光会在火球中心糊出一块过曝的纯色斑。
    if (!usedBitmap) {
      const flash = this.scene.add.circle(x, y, Math.max(18, radius * 0.35), style.flashColor, 0.85);
      flash.setDepth(DEPTH.effect);
      this.scene.tweens.add({
        targets: flash,
        alpha: 0,
        scale: 2.4,
        duration: 220,
        onComplete: () => flash.destroy(),
      });
    }

    const shockwave = this.scene.add.circle(x, y, Math.max(12, radius * 0.18), 0xffffff, 0);
    shockwave.setDepth(DEPTH.effect);
    shockwave.setStrokeStyle(4, 0xfff2ba, 0.9);

    this.scene.tweens.add({
      targets: shockwave,
      alpha: 0,
      scale: 2.8,
      duration: 260,
      onComplete: () => shockwave.destroy(),
    });

    // 火花密度按爆炸类型分档：地雷靠破片杀伤，破片就该最密；粉尘最"散"但不该发亮。
    const shards = Math.max(4, Math.ceil(radius / 28 * (style.sparkDensity / 22)));
    for (let i = 0; i < shards; i++) {
      const angle = Phaser.Math.FloatBetween(0, Math.PI * 2);
      const distance = Phaser.Math.Between(Math.floor(radius * 0.4), radius);
      const spark = this.scene.add.circle(x, y, Phaser.Math.Between(2, 4), style.sparkColor, 0.95);
      spark.setDepth(DEPTH.effect);
      this.scene.tweens.add({
        targets: spark,
        x: x + Math.cos(angle) * distance,
        y: y + Math.sin(angle) * distance,
        alpha: 0,
        scale: 0.4,
        duration: Phaser.Math.Between(180, 280),
        onComplete: () => spark.destroy(),
      });
    }

    if (radius >= 70) {
      const text = this.scene.add.text(x, y - radius * 0.16, radius >= 100 ? 'BOOM!' : 'KRAK!', {
        fontFamily: UI_FONT_FAMILY,
        fontSize: radius >= 100 ? '38px' : '28px',
        color: '#fff6d5',
        stroke: '#0f0e13',
        strokeThickness: 6,
      }).setOrigin(0.5).setDepth(DEPTH.effect);
      text.setRotation(Phaser.Math.FloatBetween(-0.12, 0.12));
      this.scene.tweens.add({
        targets: text,
        y: text.y - 24,
        alpha: 0,
        scale: 1.15,
        duration: 420,
        onComplete: () => text.destroy(),
      });
    }
  }

  /**
   * 位图火球。返回是否真的播了位图，调用方据此决定要不要补图元闪光。
   *
   * 走 ADD 混合：火球是自发光物，NORMAL 会让键控出的硬边在深色地面上变成一块暗补丁
   * （与 `EffectSpawnOptions.blend` 的注释同一条理由）。粉尘是唯一例外——它不发光，
   * 用 ADD 会把灰白粉末也提亮成火，所以粉尘走 NORMAL。
   */
  private spawnBlastSprite(x: number, y: number, radius: number, style: BlastStyle): boolean {
    if (!this.effectSprites) return false;
    const sprite = this.effectSprites.spawn(EFFECT_ASSET_KEYS.explosion, {
      x,
      y,
      width: radius * 2 * style.spriteScale,
      blend: style.tint === BLAST_STYLES.dust.tint ? 'normal' : 'add',
      tint: style.tint,
      depth: DEPTH.effect,
    });
    if (!sprite) return false;
    this.spawnBlastSmoke(x, y, radius, style);
    return true;
  }

  /**
   * 爆炸余烟。位图缺失时静默跳过，不回落图元。
   *
   * 不给余烟做图元回落是刻意的：图元只能画实心圆，而烟的语义完全依赖"撕裂、半透、
   * 有洞"。一个半透明灰圆读起来像地面污渍而不是烟，不如不画。
   */
  private spawnBlastSmoke(x: number, y: number, radius: number, style: BlastStyle): void {
    if (!this.effectSprites || style.smokePuffs <= 0) return;
    for (let i = 0; i < style.smokePuffs; i++) {
      // 首朵压在爆心，其余在半径内散开，避免三朵烟叠成一坨。
      const spread = i === 0 ? 0 : radius * 0.42;
      const angle = Phaser.Math.FloatBetween(0, Math.PI * 2);
      const smoke = this.effectSprites.spawn(EFFECT_ASSET_KEYS.smokePuff, {
        x: x + Math.cos(angle) * spread,
        y: y + Math.sin(angle) * spread,
        width: radius * 2 * style.smokeScale,
        blend: 'normal',
        tint: style.smokeTint,
        alpha: 0.85,
        depth: DEPTH.effect,
      });
      // 烟比火球慢半拍升起：位图本身只有 4 帧，靠一点位移补足"往上飘"的读数。
      if (smoke) {
        this.scene.tweens.add({
          targets: smoke,
          y: smoke.y - radius * 0.18,
          duration: 460,
        });
      }
    }
  }

  private spawnLingerZone(x: number, y: number, def: LingerDef): void {
    if (def.stackMode === 'refresh-nearby') {
      const refreshDistance = def.refreshDistance ?? def.radius;
      const existing = this.lingerZones.find((zone) => zone.def.kind === def.kind
        && zone.def.color === def.color
        && zone.def.stackMode === 'refresh-nearby'
        && distanceSq(x, y, zone.x, zone.y) <= refreshDistance * refreshDistance);
      if (existing) {
        const radiusChanged = existing.def.radius !== def.radius;
        existing.expiresAt = this.scene.time.now + def.duration;
        existing.def = { ...def };
        // 刷新匹配只看 kind 与 color，半径仍可能变（强化卡会改 setConeLinger 的半径）。
        // 图元圆和位图都要跟着改，否则显示范围与实际伤害范围脱钩。
        if (radiusChanged) {
          existing.visual.setRadius(def.radius);
          if (existing.zoneSprite) {
            const layout = getEffectLayout(resolveZoneTexture(def.kind));
            existing.zoneSprite.setScale((def.radius * 2) / layout.frameWidth);
          }
        }
        return;
      }
    }

    // 接位图后图元圆退化为"边界提示"：位图介质的轮廓是撕裂的，但踩进去掉血
    // （火焰）或被挡住（粉尘）的范围是精确的圆，玩家必须能看出后者。
    // 所以不透明度从 0.26 压到 0.1，保留边界读数又不跟介质配色打架。
    const zoneSprite = this.spawnZoneSprite(x, y, def);
    const visual = this.scene.add.circle(x, y, def.radius, def.color, zoneSprite ? 0.1 : 0.26);
    visual.setDepth(DEPTH.lingerZone);
    visual.setStrokeStyle(2, 0x111111, 0.15);

    this.lingerZones.push({
      x,
      y,
      def,
      expiresAt: this.scene.time.now + def.duration,
      lastTickAt: -Infinity,
      visual,
      zoneSprite,
      soundHandle: def.kind === 'fire' && def.playLoop !== false
        ? SoundManager.startLoopAt('fire', x, y)
        : null,
    });
  }

  /**
   * 残留区的位图介质层：火焰区取 fire-patch，粉尘/寒雾区取 dust-cloud。
   *
   * 两者在 `effectVisuals` 里都登记为 `repeat: 'loop'`，所以**必须由持有方显式
   * release**（见 `EffectSpritePool.spawn` 的注释）——区域到期、被清理或场景销毁
   * 三条路径都要归还，否则精灵留在池外，长局下池子会被逐渐抽空。
   *
   * 混合模式按"介质会不会自发光"分：火焰走 ADD，粉尘走 NORMAL。
   * 粉尘用 ADD 会把灰白粉末提亮成一团光，而它的语义恰恰是**遮挡**——
   * 阻挡僵尸的区域必须看起来不透光，否则玩家读不出"躲进去能断视线"。
   *
   * 粉尘染 `def.color` 而火焰不染：dust-cloud 是严格中性灰白的一张图，
   * 靠染色同时表达面粉粉尘（0xdddddd）与冷冻寒雾（0x8fdcec）；
   * fire-patch 本身已有完整的橙红配色，再染色只会脏掉。
   */
  private spawnZoneSprite(x: number, y: number, def: LingerDef): Phaser.GameObjects.Sprite | null {
    if (!this.effectSprites) return null;
    const isFire = def.kind === 'fire';
    return this.effectSprites.spawn(resolveZoneTexture(def.kind), {
      x,
      y,
      width: def.radius * 2,
      blend: isFire ? 'add' : 'normal',
      tint: isFire ? undefined : def.color,
      // 粉尘不给满不透明：区域内的僵尸必须仍能被看到轮廓，否则玩家在自己扔的
      // 粉尘里完全失去目标读数，阻挡从战术收益变成自我致盲。
      alpha: isFire ? 1 : 0.82,
      depth: DEPTH.lingerZone,
    });
  }

  /** 归还区域占用的位图精灵。三条清理路径共用，避免漏掉任一条。 */
  private releaseZoneSprite(zone: LingerZone): void {
    if (!zone.zoneSprite || !this.effectSprites) return;
    this.effectSprites.release(zone.zoneSprite);
    zone.zoneSprite = null;
  }

  /**
   * 减速区每跳刷新区内敌人的减速。
   *
   * 施加时长取 `SLOW_ZONE_TICK_RATE` 的两倍余量而不是区域剩余时长：`Zombie.applySlow`
   * 是刷新式而非叠乘式（见该方法注释），给两跳余量既保证连续站在区内不会出现
   * 「减速断档」，也保证走出区域后最多两跳就恢复原速。
   */
  private applySlowTick(zone: LingerZone): void {
    const multiplier = zone.def.slowFactor;
    if (multiplier === undefined || multiplier <= 0) return;

    const radiusSq = zone.def.radius * zone.def.radius;
    for (const zombie of this.getZombies()) {
      if (distanceSq(zone.x, zone.y, zombie.x, zombie.y) <= radiusSq) {
        zombie.applySlow(multiplier, SLOW_ZONE_TICK_RATE * 2);
      }
    }
  }

  private applyFireTick(zone: LingerZone): void {
    const radiusSq = zone.def.radius * zone.def.radius;
    const damage = zone.def.tickDamage ?? 1;

    for (const zombie of this.getZombies()) {
      if (distanceSq(zone.x, zone.y, zombie.x, zombie.y) <= radiusSq) {
        // 火焰每跳伤害很低且频繁，用普通样式，避免刷出成片强调数字。
        this.damageZombie(zombie, damage, {
          angle: angleBetween(zone.x, zone.y, zombie.x, zombie.y),
          kind: 'normal',
        });
      }
    }

    if (zone.def.damagesPlayer !== false
      && distanceSq(zone.x, zone.y, this.player.x, this.player.y) <= radiusSq) {
      this.damagePlayer(damage, 'fire');
    }
  }
}
