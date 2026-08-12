import Phaser from 'phaser';
import { DEPTH } from '../constants';
import type { Prop } from '../entities/Prop';
import type { Player } from '../entities/Player';
import type { Zombie } from '../entities/Zombie';
import type { EffectDef, LingerDef } from '../config/types';
import { angleBetween, distanceSq } from '../utils/math';
import { SoundManager, type SoundLoopHandle } from './SoundManager';
import type { DamageImpact } from './FeedbackRules';

interface LingerZone {
  x: number;
  y: number;
  def: LingerDef;
  expiresAt: number;
  lastTickAt: number;
  visual: Phaser.GameObjects.Arc;
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
  damagePlayer: (amount: number) => void;
  detonateProp: (prop: Prop, chainSet: Set<Prop>) => void;
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
  private damagePlayer: (amount: number) => void;
  private detonateProp: (prop: Prop, chainSet: Set<Prop>) => void;
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
  }

  explode(x: number, y: number, effect: EffectDef, chainSet = new Set<Prop>()): void {
    const radiusSq = effect.radius * effect.radius;

    SoundManager.playAt(effect.lingering?.kind === 'dust' ? 'dustBurst' : 'explosion', x, y);
    this.spawnFlash(x, y, effect.radius);

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
      this.damagePlayer(effect.damage);
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

  update(now: number): void {
    this.updateEnemyBlasts(now);
    for (let i = this.lingerZones.length - 1; i >= 0; i--) {
      const zone = this.lingerZones[i];
      if (now >= zone.expiresAt) {
        SoundManager.stopLoop(zone.soundHandle);
        zone.visual.destroy();
        this.lingerZones.splice(i, 1);
        continue;
      }

      if (zone.def.kind === 'fire') {
        const tickRate = zone.def.tickRate ?? 300;
        if (now - zone.lastTickAt < tickRate) continue;
        zone.lastTickAt = now;
        this.applyFireTick(zone);
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

  destroy(): void {
    for (const zone of this.lingerZones) {
      SoundManager.stopLoop(zone.soundHandle);
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
        this.damagePlayer(blast.damage);
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
      SoundManager.playAt('explosion', blast.x, blast.y);
      this.spawnFlash(blast.x, blast.y, blast.radius);
      blast.visual.destroy();
      blast.ring.destroy();
      this.enemyBlasts.splice(index, 1);
    }
  }

  private spawnFlash(x: number, y: number, radius: number): void {
    const flash = this.scene.add.circle(x, y, Math.max(18, radius * 0.35), 0xffe7a0, 0.85);
    flash.setDepth(DEPTH.effect);
    const shockwave = this.scene.add.circle(x, y, Math.max(12, radius * 0.18), 0xffffff, 0);
    shockwave.setDepth(DEPTH.effect);
    shockwave.setStrokeStyle(4, 0xfff2ba, 0.9);

    this.scene.tweens.add({
      targets: flash,
      alpha: 0,
      scale: 2.4,
      duration: 220,
      onComplete: () => flash.destroy(),
    });
    this.scene.tweens.add({
      targets: shockwave,
      alpha: 0,
      scale: 2.8,
      duration: 260,
      onComplete: () => shockwave.destroy(),
    });

    const shards = Math.max(4, Math.ceil(radius / 28));
    for (let i = 0; i < shards; i++) {
      const angle = Phaser.Math.FloatBetween(0, Math.PI * 2);
      const distance = Phaser.Math.Between(Math.floor(radius * 0.4), radius);
      const spark = this.scene.add.circle(x, y, Phaser.Math.Between(2, 4), 0xffd27a, 0.95);
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
        fontFamily: 'Impact, "Arial Black", sans-serif',
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

  private spawnLingerZone(x: number, y: number, def: LingerDef): void {
    const visual = this.scene.add.circle(x, y, def.radius, def.color, 0.26);
    visual.setDepth(DEPTH.lingerZone);
    visual.setStrokeStyle(2, 0x111111, 0.15);

    this.lingerZones.push({
      x,
      y,
      def,
      expiresAt: this.scene.time.now + def.duration,
      lastTickAt: -Infinity,
      visual,
      soundHandle: def.kind === 'fire' ? SoundManager.startLoopAt('fire', x, y) : null,
    });
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

    if (distanceSq(zone.x, zone.y, this.player.x, this.player.y) <= radiusSq) {
      this.damagePlayer(damage);
    }
  }
}
