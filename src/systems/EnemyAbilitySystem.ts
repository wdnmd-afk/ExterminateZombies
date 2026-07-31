import Phaser from 'phaser';
import { DEPTH } from '../constants';
import type { EnemyProjectile } from '../entities/EnemyProjectile';
import type { Zombie, ZombieAbilityEvent } from '../entities/Zombie';
import type { ObjectPool } from '../utils/ObjectPool';
import type { AreaEffectFactory } from './AreaEffectFactory';
import { SoundManager } from './SoundManager';

interface EnemyAbilitySystemOptions {
  scene: Phaser.Scene;
  projectilePool: ObjectPool<EnemyProjectile>;
  areaEffects: AreaEffectFactory;
}

/** 将敌方能力事件转换为投射物、危险区和短时战斗反馈。 */
export class EnemyAbilitySystem {
  private readonly scene: Phaser.Scene;
  private readonly projectilePool: ObjectPool<EnemyProjectile>;
  private readonly areaEffects: AreaEffectFactory;

  constructor(options: EnemyAbilitySystemOptions) {
    this.scene = options.scene;
    this.projectilePool = options.projectilePool;
    this.areaEffects = options.areaEffects;
  }

  handle(zombie: Zombie, event: ZombieAbilityEvent): void {
    const { ability } = event;
    if (event.phase === 'windup') {
      SoundManager.play('enemyAttack');
      if (ability.kind === 'shockwave') {
        this.areaEffects.scheduleEnemyBlast(
          event.sourceX,
          event.sourceY,
          ability.radius,
          ability.damage,
          ability.windup,
          () => zombie.active,
        );
      } else if (ability.kind === 'bombard') {
        this.areaEffects.scheduleEnemyBlast(
          event.targetX,
          event.targetY,
          ability.radius,
          ability.damage,
          ability.windup,
          () => zombie.active,
        );
      } else {
        this.spawnWindup(event);
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
    }
  }

  private spawnWindup(event: ZombieAbilityEvent): void {
    const isDash = event.ability.kind === 'dash';
    const x = isDash ? event.sourceX : event.targetX;
    const y = isDash ? event.sourceY : event.targetY;
    const radius = isDash ? 26 : 34;
    const telegraph = this.scene.add.circle(x, y, radius, isDash ? 0xfbc02d : 0x79dce9, 0.16)
      .setDepth(DEPTH.effect);
    telegraph.setStrokeStyle(3, isDash ? 0xffe79b : 0xc6f7ff, 0.95);
    this.scene.tweens.add({
      targets: telegraph,
      alpha: 0,
      scale: isDash ? 1.9 : 1.5,
      duration: event.ability.windup,
      ease: 'Cubic.In',
      onComplete: () => telegraph.destroy(),
    });
  }

  private spawnDashTrail(x: number, y: number): void {
    const flash = this.scene.add.circle(x, y, 18, 0xfbc02d, 0.4).setDepth(DEPTH.effect);
    this.scene.tweens.add({
      targets: flash,
      alpha: 0,
      scale: 2.2,
      duration: 180,
      onComplete: () => flash.destroy(),
    });
  }
}
