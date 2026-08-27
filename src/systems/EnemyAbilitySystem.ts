import Phaser from 'phaser';
import { createBossAbilityAlert } from '../config/combatAlerts';
import { isBossZombie, isNormalZombieId } from '../config/zombies';
import type { NormalZombieId } from '../config/zombies';
import type {
  BarrageZombieAbility,
  SummonZombieAbility,
  VolleyZombieAbility,
} from '../config/types';
import { DEPTH, EVENTS, GAME_HEIGHT, GAME_WIDTH } from '../constants';
import type { EnemyProjectile } from '../entities/EnemyProjectile';
import type { Zombie, ZombieAbilityEvent } from '../entities/Zombie';
import type { ObjectPool } from '../utils/ObjectPool';
import type { AreaEffectFactory } from './AreaEffectFactory';
import { SoundManager } from './SoundManager';

interface EnemyAbilitySystemOptions {
  scene: Phaser.Scene;
  projectilePool: ObjectPool<EnemyProjectile>;
  areaEffects: AreaEffectFactory;
  /**
   * 召唤技能的生成入口。缺省时 `summon` 静默跳过——这样"没接线"与"配置里没有召唤"
   * 退化到同一条已验证路径，而不是抛错打断战斗。
   */
  spawnZombieAt?: (typeId: NormalZombieId, x: number, y: number) => Zombie;
}

/** 一只 Boss 当前存活的召唤物账本。`token` 用于识别对象池复用后的同一实例。 */
interface SummonRecord {
  token: number;
  minions: Zombie[];
}

/** 将敌方能力事件转换为投射物、危险区和短时战斗反馈。 */
export class EnemyAbilitySystem {
  private readonly scene: Phaser.Scene;
  private readonly projectilePool: ObjectPool<EnemyProjectile>;
  private readonly areaEffects: AreaEffectFactory;
  private readonly spawnZombieAt: ((typeId: NormalZombieId, x: number, y: number) => Zombie) | null;
  /**
   * 召唤物账本。用 WeakMap 而不是 Map：Boss 实体由对象池长期持有，
   * 但账本不该成为让已回池实例无法回收的额外引用。
   */
  private readonly summonRecords = new WeakMap<Zombie, SummonRecord>();

  constructor(options: EnemyAbilitySystemOptions) {
    this.scene = options.scene;
    this.projectilePool = options.projectilePool;
    this.areaEffects = options.areaEffects;
    this.spawnZombieAt = options.spawnZombieAt ?? null;
  }

  handle(zombie: Zombie, event: ZombieAbilityEvent): void {
    const { ability } = event;
    if (event.phase === 'windup') {
      SoundManager.playAt('enemyAttack', event.sourceX, event.sourceY);
      zombie.playAbilityWindup(event.targetX, event.targetY, ability.windup);
      if (isBossZombie(zombie.def.id)) {
        this.scene.events.emit(
          EVENTS.combatAlert,
          createBossAbilityAlert(zombie.def.name, ability),
        );
      }
      if (ability.kind === 'shockwave') {
        this.areaEffects.scheduleEnemyBlast(
          event.sourceX,
          event.sourceY,
          ability.radius,
          ability.damage,
          ability.windup,
          () => zombie.isCombatActive(),
          ability.triggerProps ?? false,
        );
      } else if (ability.kind === 'bombard') {
        this.areaEffects.scheduleEnemyBlast(
          event.targetX,
          event.targetY,
          ability.radius,
          ability.damage,
          ability.windup,
          () => zombie.isCombatActive(),
        );
      } else if (ability.kind === 'barrage') {
        this.scheduleBarrage(zombie, event, ability);
      } else {
        this.spawnWindup(zombie, event);
      }
      return;
    }

    if (ability.kind === 'ranged') {
      const projectile = this.projectilePool.acquire();
      projectile.fire(
        event.sourceX,
        event.sourceY,
        event.targetX,
        event.targetY,
        ability.projectileSpeed,
        ability.damage,
        ability.projectileRange,
        ability.projectileRadius,
      );
      this.spawnDashTrail(event.sourceX, event.sourceY);
    } else if (ability.kind === 'dash') {
      this.spawnDashTrail(event.sourceX, event.sourceY, zombie.def.id.includes('boss'));
    } else if (ability.kind === 'volley') {
      this.fireVolley(event, ability);
    } else if (ability.kind === 'summon') {
      this.resolveSummon(zombie, ability);
    }
    this.scheduleRecoveryCue(zombie, ability);
  }

  /**
   * 多重齐射。复用普通远程弹丸，只是按角度循环生成。
   *
   * `spreadAngle >= 360` 走整圈均分（步长 360/N），小于 360 时把 N 发铺在扇形两端之间
   * （步长 spreadAngle/(N-1)）。两条公式必须分开：整圈若也用 N-1 做分母，
   * 首尾两发会重叠在同一角度上，14 发环射实际只有 13 个缺口。
   */
  private fireVolley(event: ZombieAbilityEvent, ability: VolleyZombieAbility): void {
    const count = Math.max(1, Math.floor(ability.projectileCount));
    const baseAngle = Phaser.Math.Angle.Between(
      event.sourceX,
      event.sourceY,
      event.targetX,
      event.targetY,
    );
    const fullCircle = ability.spreadAngle >= 360;
    const stepDegrees = fullCircle
      ? 360 / count
      : (count > 1 ? ability.spreadAngle / (count - 1) : 0);
    const startDegrees = fullCircle ? 0 : -ability.spreadAngle / 2;

    for (let index = 0; index < count; index++) {
      const angle = baseAngle + Phaser.Math.DegToRad(startDegrees + stepDegrees * index);
      const projectile = this.projectilePool.acquire();
      projectile.fire(
        event.sourceX,
        event.sourceY,
        event.sourceX + Math.cos(angle) * ability.projectileRange,
        event.sourceY + Math.sin(angle) * ability.projectileRange,
        ability.projectileSpeed,
        ability.damage,
        ability.projectileRange,
        ability.projectileRadius,
      );
    }
    this.spawnDashTrail(event.sourceX, event.sourceY, true);
  }

  /**
   * 饱和轰炸。首个爆点压在玩家当前位置，其余在 `spread` 半径内散开，
   * 按 `stagger` 逐个引爆。
   *
   * 全部在前摇阶段一次排队：`scheduleEnemyBlast` 的 windup 参数同时驱动预警环的
   * 扩张时长，所以第 i 个爆点传 `windup + i * stagger` 就自动得到"越晚炸的圈涨得越慢"。
   * 玩家因此能同时看到全部落点和它们的先后顺序，而不是被一串没有预告的爆炸追着跑。
   */
  private scheduleBarrage(
    zombie: Zombie,
    event: ZombieAbilityEvent,
    ability: BarrageZombieAbility,
  ): void {
    const count = Math.max(1, Math.floor(ability.blastCount));
    for (let index = 0; index < count; index++) {
      const distance = index === 0 ? 0 : Phaser.Math.FloatBetween(ability.spread * 0.35, ability.spread);
      const angle = Phaser.Math.FloatBetween(0, Math.PI * 2);
      this.areaEffects.scheduleEnemyBlast(
        Phaser.Math.Clamp(event.targetX + Math.cos(angle) * distance, 0, GAME_WIDTH),
        Phaser.Math.Clamp(event.targetY + Math.sin(angle) * distance, 0, GAME_HEIGHT),
        ability.radius,
        ability.damage,
        ability.windup + index * ability.stagger,
        () => zombie.isCombatActive(),
      );
    }
  }

  /**
   * 召唤杂兵。`maxAlive` 是同时存活硬上限，超出时这次技能只是空放。
   *
   * 只统计**本只 Boss 自己召出来的**存活数，不统计场上全部敌人：Boss 波本身就带护卫，
   * 按全场统计会让召唤在整场战斗里一次都放不出来。
   */
  private resolveSummon(zombie: Zombie, ability: SummonZombieAbility): void {
    if (!this.spawnZombieAt || ability.summonTypes.length === 0) return;
    const token = zombie.getLifecycleToken();
    const record = this.summonRecords.get(zombie);
    // 对象池复用后 token 变化，上一条命的账本必须整份丢弃。
    const minions = record && record.token === token
      ? record.minions.filter((minion) => minion.isCombatActive())
      : [];
    const allowed = Math.min(
      Math.floor(ability.count),
      Math.floor(ability.maxAlive) - minions.length,
    );
    if (allowed <= 0) {
      this.summonRecords.set(zombie, { token, minions });
      return;
    }

    const angleOffset = Phaser.Math.FloatBetween(0, Math.PI * 2);
    for (let index = 0; index < allowed; index++) {
      const typeId = ability.summonTypes[index % ability.summonTypes.length];
      // 配置层只保证 summonTypes 是字符串，收窄失败就跳过这一只：
      // Boot 阶段的 validate.ts 已经会为同一个错误报错，战斗中不该再抛。
      if (!isNormalZombieId(typeId)) continue;
      const angle = angleOffset + (Math.PI * 2 * index) / allowed;
      const x = Phaser.Math.Clamp(
        zombie.x + Math.cos(angle) * ability.spawnRadius,
        24,
        GAME_WIDTH - 24,
      );
      const y = Phaser.Math.Clamp(
        zombie.y + Math.sin(angle) * ability.spawnRadius,
        24,
        GAME_HEIGHT - 24,
      );
      minions.push(this.spawnZombieAt(typeId, x, y));
      this.spawnSummonBurst(x, y);
    }
    this.summonRecords.set(zombie, { token, minions });
  }

  /** 召唤落点的一次性提示。位置就是杂兵出现的地方，玩家得来得及转身。 */
  private spawnSummonBurst(x: number, y: number): void {
    const burst = this.scene.add.circle(x, y, 30, 0x8f4fbf, 0.22).setDepth(DEPTH.effect);
    burst.setStrokeStyle(3, 0xd7a8ff, 0.95);
    this.scene.tweens.add({
      targets: burst,
      alpha: 0,
      scale: 0.4,
      duration: 320,
      ease: 'Cubic.Out',
      onComplete: () => burst.destroy(),
    });
  }

  private spawnWindup(zombie: Zombie, event: ZombieAbilityEvent): void {
    const kind = event.ability.kind;
    const isDash = kind === 'dash';
    if (isDash && zombie.def.id.includes('boss')) {
      this.spawnBossChargeWindup(event);
      return;
    }
    // 齐射与召唤都是"从自己身上发出"的技能，预警必须画在 Boss 脚下而不是玩家脚下，
    // 否则 360° 环射的预告会出现在弹幕最稀疏的位置。
    const sourceAnchored = isDash || kind === 'volley' || kind === 'summon';
    const x = sourceAnchored ? event.sourceX : event.targetX;
    const y = sourceAnchored ? event.sourceY : event.targetY;
    const color = isDash ? 0xfbc02d : (kind === 'summon' ? 0xb066e0 : 0x79dce9);
    const stroke = isDash ? 0xffe79b : (kind === 'summon' ? 0xe3c2ff : 0xc6f7ff);
    const radius = isDash ? 26 : (sourceAnchored ? zombie.def.radius + 12 : 34);
    const telegraph = this.scene.add.circle(x, y, radius, color, 0.16)
      .setDepth(DEPTH.effect);
    telegraph.setStrokeStyle(3, stroke, 0.95);
    this.scene.tweens.add({
      targets: telegraph,
      alpha: 0,
      scale: isDash ? 1.9 : (sourceAnchored ? 2.6 : 1.5),
      duration: event.ability.windup,
      ease: 'Cubic.In',
      onComplete: () => telegraph.destroy(),
    });
  }

  /** Boss 冲锋必须同时表达方向和距离，单个脚下圆无法告诉玩家往哪一侧闪避。 */
  private spawnBossChargeWindup(event: ZombieAbilityEvent): void {
    if (event.ability.kind !== 'dash') return;
    const angle = Phaser.Math.Angle.Between(event.sourceX, event.sourceY, event.targetX, event.targetY);
    const dashDistance = event.ability.dashSpeed * event.ability.dashDuration / 1000;
    const lane = this.scene.add.rectangle(
      event.sourceX,
      event.sourceY,
      dashDistance,
      24,
      0xf5bd3d,
      0.2,
    ).setOrigin(0, 0.5).setRotation(angle).setDepth(DEPTH.effect);
    lane.setStrokeStyle(2, 0xffed9b, 0.95);
    const endpoint = this.scene.add.circle(
      event.sourceX + Math.cos(angle) * dashDistance,
      event.sourceY + Math.sin(angle) * dashDistance,
      18,
      0xf5bd3d,
      0.14,
    ).setDepth(DEPTH.effect);
    endpoint.setStrokeStyle(3, 0xffed9b, 0.95);

    this.scene.tweens.add({
      targets: [lane, endpoint],
      alpha: 0.72,
      duration: Math.max(80, event.ability.windup / 4),
      yoyo: true,
      repeat: 1,
      onComplete: () => {
        lane.destroy();
        endpoint.destroy();
      },
    });
  }

  private spawnDashTrail(x: number, y: number, boss = false): void {
    const flash = this.scene.add.circle(x, y, boss ? 30 : 18, 0xfbc02d, boss ? 0.56 : 0.4).setDepth(DEPTH.effect);
    this.scene.tweens.add({
      targets: flash,
      alpha: 0,
      scale: 2.2,
      duration: 180,
      onComplete: () => flash.destroy(),
    });
  }

  /** 有额外受伤倍率的恢复期用绿色双环提示，与黄色危险前摇明确区分。 */
  private scheduleRecoveryCue(zombie: Zombie, ability: ZombieAbilityEvent['ability']): void {
    if ((ability.recoveryDamageMultiplier ?? 1) <= 1) return;
    const delay = ability.kind === 'dash' ? ability.dashDuration : 0;
    const lifecycleToken = zombie.getLifecycleToken();
    this.scene.time.delayedCall(delay, () => {
      const recovery = zombie.getRecoveryStatus(this.scene.time.now);
      if (!zombie.isCombatActive()
        || zombie.getLifecycleToken() !== lifecycleToken
        || !recovery.active
        || recovery.damageMultiplier !== ability.recoveryDamageMultiplier) return;
      const ring = this.scene.add.circle(
        zombie.x,
        zombie.y,
        zombie.def.radius + 8,
        0x8de6c3,
        0.08,
      ).setDepth(DEPTH.effect);
      ring.setStrokeStyle(4, 0xb8ffe4, 0.95);
      const inner = this.scene.add.circle(
        zombie.x,
        zombie.y,
        Math.max(12, zombie.def.radius - 5),
        0x8de6c3,
        0,
      ).setDepth(DEPTH.effect);
      inner.setStrokeStyle(2, 0xe0fff3, 0.85);
      this.scene.tweens.add({
        targets: [ring, inner],
        alpha: 0,
        scale: 1.45,
        duration: ability.recovery,
        ease: 'Cubic.Out',
        onComplete: () => {
          ring.destroy();
          inner.destroy();
        },
      });
    });
  }
}
