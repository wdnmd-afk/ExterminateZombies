import Phaser from 'phaser';
import { DEPTH, GAME_HEIGHT, GAME_WIDTH } from '../constants';

/**
 * 敌方远程投射物。使用对象池复用，命中玩家或地形后立即回收。
 * 它不与友方感染体和场景爆炸物交互，避免远程能力意外清空己方敌群。
 */
export class EnemyProjectile extends Phaser.GameObjects.Arc {
  declare body: Phaser.Physics.Arcade.Body;

  damage = 0;
  private startX = 0;
  private startY = 0;
  private maxRange = 0;

  constructor(scene: Phaser.Scene) {
    super(scene, 0, 0, 7, 0, 360, false, 0x9de7f2, 1);
    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.setDepth(DEPTH.effect);
    this.setActive(false);
    this.setVisible(false);
    this.body.enable = false;
  }

  fire(
    x: number,
    y: number,
    targetX: number,
    targetY: number,
    speed: number,
    damage: number,
    range: number,
    radius: number,
  ): void {
    this.setPosition(x, y);
    this.setRadius(radius);
    this.startX = x;
    this.startY = y;
    this.maxRange = range;
    this.damage = damage;
    this.setActive(true);
    this.setVisible(true);
    this.body.enable = true;
    this.body.reset(x, y);
    this.body.setCircle(radius, -radius, -radius);
    this.scene.physics.moveTo(this, targetX, targetY, speed);
  }

  despawn(): void {
    this.setActive(false);
    this.setVisible(false);
    this.body.enable = false;
    this.body.stop();
  }

  tick(): void {
    if (!this.active) return;
    const dx = this.x - this.startX;
    const dy = this.y - this.startY;
    if (
      dx * dx + dy * dy >= this.maxRange * this.maxRange
      || this.x < -24 || this.x > GAME_WIDTH + 24
      || this.y < -24 || this.y > GAME_HEIGHT + 24
    ) {
      this.despawn();
    }
  }
}
