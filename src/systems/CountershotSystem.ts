import Phaser from 'phaser';
import type { CountershotZombieAbility } from '../config/types';
import { EVENTS } from '../constants';
import type { Bullet } from '../entities/Bullet';
import { CountershotProjectile } from '../entities/CountershotProjectile';
import type { Player } from '../entities/Player';
import type { Zombie } from '../entities/Zombie';
import { ObjectPool } from '../utils/ObjectPool';
import { distanceSq } from '../utils/math';
import type { AreaEffectFactory } from './AreaEffectFactory';
import { SoundManager } from './SoundManager';

interface CountershotSystemOptions {
  scene: Phaser.Scene;
  player: Player;
  bullets: Phaser.GameObjects.Group;
  zombies: Phaser.GameObjects.Group;
  obstacles: Phaser.Physics.Arcade.StaticGroup;
  areaEffects: AreaEffectFactory;
  isRunning: () => boolean;
}

export class CountershotSystem {
  private readonly pool: ObjectPool<CountershotProjectile>;
  private readonly colliders: Phaser.Physics.Arcade.Collider[] = [];

  constructor(private readonly options: CountershotSystemOptions) {
    const { scene, player, bullets, zombies, obstacles, isRunning } = options;
    this.pool = new ObjectPool(scene, (owner) => new CountershotProjectile(owner), 2);
    const group = this.pool.phaserGroup;
    this.colliders.push(
      scene.physics.add.overlap(bullets, group, (bulletObject, projectileObject) => {
        const bullet = bulletObject as Bullet;
        const projectile = projectileObject as CountershotProjectile;
        if (!bullet.active || !projectile.reflect()) return;
        // 这是一次反打而不是爆炸弹命中；先消费原弹，不能额外炸伤贴身反打的玩家。
        bullet.consumeImpactEffect();
        bullet.despawn();
        SoundManager.playAt('critical', projectile.x, projectile.y);
        scene.events.emit(EVENTS.combatAlert, {
          key: 'countershot-reflected', title: '炮弹反打',
          subtitle: '返弹命中原 Boss 可打开破绽', tone: 'status', priority: 20, duration: 1200,
        });
      }, isRunning),
      scene.physics.add.overlap(group, player, (projectileObject) => {
        const projectile = projectileObject as CountershotProjectile;
        if (projectile.flight.side === 'hostile') this.detonate(projectile);
      }, isRunning),
      scene.physics.add.overlap(group, zombies, (projectileObject, zombieObject) => {
        const projectile = projectileObject as CountershotProjectile;
        if (projectile.flight.side === 'returned' && (zombieObject as Zombie).isCombatActive()) {
          this.detonate(projectile);
        }
      }, isRunning),
      scene.physics.add.overlap(group, obstacles, (projectileObject) => {
        this.detonate(projectileObject as CountershotProjectile);
      }, isRunning),
    );
  }

  fire(source: Zombie, targetX: number, targetY: number, ability: CountershotZombieAbility): void {
    this.pool.acquire().fire(source, targetX, targetY, ability);
  }

  update(): void {
    this.pool.forEachActive((projectile) => {
      if (projectile.hasExpired()) this.detonate(projectile);
    });
  }

  getActiveCount(): number {
    return this.pool.getActive().length;
  }

  private detonate(projectile: CountershotProjectile): void {
    if (!projectile.active) return;
    const side = projectile.flight.consume();
    if (!side) return;
    const { x, y, ability } = projectile;
    const source = projectile.getCurrentSource();
    // 先让弹体离场，再进入可能触发击杀、抽卡、危墙与连锁的回调。
    projectile.despawn();
    if (side === 'returned') {
      if (source && distanceSq(x, y, source.x, source.y) <= ability.blastRadius ** 2) {
        source.exposeWeakness(this.options.scene.time.now, ability.exposureDuration, ability.exposureMultiplier);
      }
      this.options.areaEffects.playerPulse(x, y, ability.blastRadius, ability.returnDamage, 55);
    } else {
      this.options.areaEffects.scheduleEnemyBlast(
        x, y, ability.blastRadius, ability.damage, 0, () => true, false, ability.structureDamage,
      );
    }
  }

  destroy(): void {
    for (const collider of this.colliders) {
      if (collider.world) collider.destroy();
    }
    this.colliders.length = 0;
    this.pool.destroy();
  }
}
