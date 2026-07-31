import Phaser from 'phaser';
import { DEPTH, GAME_WIDTH, GAME_HEIGHT } from '../constants';
import type { EffectDef } from '../config/types';
import { ProjectileImpact } from '../systems/ProjectileImpact';
import { ENVIRONMENT_TEXTURE_KEYS } from '../systems/EnvironmentAssetManager';

export class Bullet extends Phaser.GameObjects.Image {
  declare body: Phaser.Physics.Arcade.Body;

  damage = 0;
  penetration = 0;
  private startX = 0;
  private startY = 0;
  private maxRange = 0;
  private readonly impact = new ProjectileImpact();
  readonly hitSet = new Set<Phaser.GameObjects.GameObject>();

  constructor(scene: Phaser.Scene) {
    super(scene, 0, 0, ENVIRONMENT_TEXTURE_KEYS.bulletFriendly);
    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.setDepth(DEPTH.bullet);
    this.setActive(false);
    this.setVisible(false);
    this.body.enable = false;
  }

  fire(
    x: number,
    y: number,
    angleRad: number,
    speed: number,
    damage: number,
    penetration: number,
    range: number,
    color: number,
    radius: number,
    impactEffect?: EffectDef,
  ): void {
    this.setPosition(x, y);
    this.setRotation(angleRad);
    this.startX = x;
    this.startY = y;
    this.maxRange = range;
    this.damage = damage;
    this.penetration = penetration;
    this.impact.reset(impactEffect);
    this.hitSet.clear();

    const isExplosive = Boolean(impactEffect);
    const textureKey = isExplosive
      ? ENVIRONMENT_TEXTURE_KEYS.bulletExplosive
      : ENVIRONMENT_TEXTURE_KEYS.bulletFriendly;
    this.setTexture(textureKey);
    if (isExplosive) {
      this.setTint(0xffa45f);
      this.setBlendMode(Phaser.BlendModes.NORMAL);
      this.setDisplaySize(radius * 4.5, radius * 1.9);
    } else {
      this.setTintFill(color);
      this.setBlendMode(Phaser.BlendModes.ADD);
      this.setDisplaySize(Math.max(22, radius * 5), Math.max(9, radius * 2));
    }
    this.setOrigin(0.5, 0.5);

    this.setActive(true);
    this.setVisible(true);
    this.body.enable = true;
    this.body.reset(x, y);
    this.body.setCircle(radius);
    this.scene.physics.velocityFromRotation(angleRad, speed, this.body.velocity);
  }

  consumeImpactEffect(): EffectDef | null {
    return this.impact.consume();
  }

  despawn(): void {
    this.setActive(false);
    this.setVisible(false);
    this.body.enable = false;
    this.body.stop();
  }

  tick(): boolean {
    if (!this.active) return false;
    const dx = this.x - this.startX;
    const dy = this.y - this.startY;
    if (dx * dx + dy * dy >= this.maxRange * this.maxRange) {
      return true;
    }
    if (this.x < -20 || this.x > GAME_WIDTH + 20 || this.y < -20 || this.y > GAME_HEIGHT + 20) {
      return true;
    }
    return false;
  }
}
