import Phaser from 'phaser';
import { DEPTH, GAME_WIDTH, GAME_HEIGHT } from '../constants';
import { ENVIRONMENT_TEXTURE_KEYS } from '../systems/EnvironmentAssetManager';

export class EnemyProjectile extends Phaser.GameObjects.Image {
  declare body: Phaser.Physics.Arcade.Body;
  damage = 0;
  private startX = 0;
  private startY = 0;
  private maxRange = 0;

  constructor(scene: Phaser.Scene) {
    super(scene, 0, 0, ENVIRONMENT_TEXTURE_KEYS.bulletEnemy);
    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.setDepth(DEPTH.effect);
    this.setBlendMode(Phaser.BlendModes.ADD);
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
    this.setRotation(Phaser.Math.Angle.Between(x, y, targetX, targetY));
    this.setDisplaySize(radius * 4.8, radius * 2.4);
    this.startX = x;
    this.startY = y;
    this.maxRange = range;
    this.damage = damage;
    this.setActive(true);
    this.setVisible(true);
    this.body.enable = true;
    this.body.reset(x, y);
    this.body.setCircle(radius);
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
