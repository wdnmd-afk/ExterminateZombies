import Phaser from 'phaser';
import { DEPTH } from '../constants';
import type { Prop } from '../entities/Prop';
import type { Player } from '../entities/Player';
import type { Zombie } from '../entities/Zombie';
import type { EffectDef, LingerDef } from '../config/types';
import { distanceSq } from '../utils/math';

interface LingerZone {
  x: number;
  y: number;
  def: LingerDef;
  expiresAt: number;
  lastTickAt: number;
  visual: Phaser.GameObjects.Arc;
}

interface AreaEffectFactoryOptions {
  scene: Phaser.Scene;
  player: Player;
  getZombies: () => Zombie[];
  getProps: () => Prop[];
  damageZombie: (zombie: Zombie, amount: number) => void;
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
  private damageZombie: (zombie: Zombie, amount: number) => void;
  private damagePlayer: (amount: number) => void;
  private detonateProp: (prop: Prop, chainSet: Set<Prop>) => void;
  private lingerZones: LingerZone[] = [];

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

    this.spawnFlash(x, y, effect.radius);

    for (const zombie of this.getZombies()) {
      if (distanceSq(x, y, zombie.x, zombie.y) <= radiusSq) {
        this.damageZombie(zombie, effect.damage);
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
    for (let i = this.lingerZones.length - 1; i >= 0; i--) {
      const zone = this.lingerZones[i];
      if (now >= zone.expiresAt) {
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

  /** 判断某个点是否位于会阻挡僵尸的粉尘区。 */
  isEnemyBlocked(x: number, y: number): boolean {
    return this.lingerZones.some((zone) => {
      if (!zone.def.blocksEnemies) return false;
      return distanceSq(x, y, zone.x, zone.y) <= zone.def.radius * zone.def.radius;
    });
  }

  destroy(): void {
    for (const zone of this.lingerZones) {
      zone.visual.destroy();
    }
    this.lingerZones = [];
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
    });
  }

  private applyFireTick(zone: LingerZone): void {
    const radiusSq = zone.def.radius * zone.def.radius;
    const damage = zone.def.tickDamage ?? 1;

    for (const zombie of this.getZombies()) {
      if (distanceSq(zone.x, zone.y, zombie.x, zombie.y) <= radiusSq) {
        this.damageZombie(zombie, damage);
      }
    }

    if (distanceSq(zone.x, zone.y, this.player.x, this.player.y) <= radiusSq) {
      this.damagePlayer(damage);
    }
  }
}
