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
      SoundManager.playAt('enemyAttack', event.sourceX, event.sourceY);
      zombie.playAbilityWindup(event.targetX, event.targetY, ability.windup);
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
    }
  }

  private spawnWindup(zombie: Zombie, event: ZombieAbilityEvent): void {
    const isDash = event.ability.kind === 'dash';
    if (isDash && zombie.def.id.includes('boss')) {
      this.spawnBossChargeWindup(event);
      return;
    }
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
}
