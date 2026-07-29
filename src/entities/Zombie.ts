import Phaser from 'phaser';
import { DEPTH } from '../constants';
import { ZOMBIES, type ZombieId } from '../config/zombies';
import type { ZombieDef } from '../config/types';
import { angleBetween } from '../utils/math';
import {
  getZombieAnimationKey,
  getZombieVisual,
  type FacingDirection,
  type ZombieVisual,
} from '../systems/GameAssetManager';

/**
 * 僵尸实体。走对象池复用。
 * 正式外观支持四方向行走表和俯视旋转帧条，由 GameAssetManager 统一描述。
 * AI:每帧朝玩家 seek;对邻近僵尸施加分离力避免叠成一点;
 * 若处于粉尘阻挡区则被挡住(速度归零)。
 * Boss(id 含 'boss')复用基础表,靠放大 + 描边区分。
 */
export class Zombie extends Phaser.GameObjects.Container {
  declare body: Phaser.Physics.Arcade.Body;

  def!: ZombieDef;
  health = 0;
  private lastAttackAt = -Infinity;
  private shadow: Phaser.GameObjects.Ellipse;
  private sprite: Phaser.GameObjects.Sprite;
  private typeId: ZombieId = 'walker';
  private visual!: ZombieVisual;
  private baseTint = 0xffffff;
  private baseScale = 1;
  private facing: FacingDirection = 'down';
  /** 本帧是否被残留区阻挡(由 GameScene 在 update 前设置)。 */
  blocked = false;

  constructor(scene: Phaser.Scene) {
    super(scene, 0, 0);
    this.shadow = scene.add.ellipse(0, 14, 24, 10, 0x000000, 0.22);
    this.sprite = scene.add.sprite(0, 0, undefined as unknown as string, 0);
    this.sprite.setOrigin(0.5, 0.62);
    this.add([this.shadow, this.sprite]);
    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.setDepth(DEPTH.zombie);
    this.setActive(false);
    this.setVisible(false);
    this.body.enable = false;
  }

  /** 从池取出后初始化。 */
  spawn(x: number, y: number, typeId: ZombieId): void {
    const def = ZOMBIES[typeId];
    const visual = getZombieVisual(typeId);
    const isBoss = typeId.includes('boss');

    this.def = def;
    this.typeId = typeId;
    this.visual = visual;
    this.health = def.health;
    this.lastAttackAt = -Infinity;
    this.blocked = false;
    this.facing = 'down';
    this.baseTint = visual.tint;
    this.baseScale = visual.scale;

    this.setPosition(x, y);

    this.sprite.setTexture(visual.textureKey);
    this.sprite.setOrigin(0.5, visual.originY);
    this.sprite.setRotation(0);
    this.sprite.setScale(visual.scale);
    this.sprite.setTint(visual.tint);
    this.sprite.play(getZombieAnimationKey(typeId, this.facing));
    const animationFrameRate = this.sprite.anims.currentAnim?.frameRate ?? visual.frameRate;
    this.sprite.anims.timeScale = visual.frameRate / animationFrameRate;

    const shadowScale = def.radius / 14;
    this.shadow.setScale(isBoss ? shadowScale * 1.4 : shadowScale);
    this.shadow.setAlpha(isBoss ? 0.3 : 0.22);

    this.setActive(true);
    this.setVisible(true);
    this.body.enable = true;
    this.body.reset(x, y);
    this.body.setCircle(def.radius, -def.radius, -def.radius);

    // 生成缩放弹入,起点略小。
    this.sprite.setScale(visual.scale * 0.6);
    this.scene.tweens.add({
      targets: this.sprite,
      scaleX: visual.scale,
      scaleY: visual.scale,
      duration: 180,
      ease: 'Back.Out',
    });
  }

  despawn(): void {
    this.setActive(false);
    this.setVisible(false);
    this.body.enable = false;
    this.body.stop();
  }

  /** 追击玩家。separationX/Y 是外部算好的分离分量。 */
  seek(targetX: number, targetY: number, separationX: number, separationY: number): void {
    if (!this.active) return;
    if (this.blocked) {
      this.body.setVelocity(0, 0);
      return;
    }
    const ang = angleBetween(this.x, this.y, targetX, targetY);
    let vx = Math.cos(ang) * this.def.speed + separationX;
    let vy = Math.sin(ang) * this.def.speed + separationY;
    // 限速到 def.speed 附近
    const sp = Math.hypot(vx, vy);
    if (sp > this.def.speed) {
      const k = this.def.speed / sp;
      vx *= k;
      vy *= k;
    }
    this.body.setVelocity(vx, vy);
    this.updateFacing(vx, vy);
  }

  /** 根据速度向量更新四方向动画或俯视精灵旋转。 */
  private updateFacing(vx: number, vy: number): void {
    if (vx === 0 && vy === 0) return;

    if (this.visual.facingMode === 'rotating') {
      // 只旋转精灵，Container 与圆形物理体保持不变，避免碰撞体随美术朝向抖动。
      this.sprite.setRotation(Math.atan2(vy, vx) + this.visual.rotationOffset);
      return;
    }

    const next: FacingDirection = Math.abs(vx) > Math.abs(vy)
      ? (vx < 0 ? 'left' : 'right')
      : (vy < 0 ? 'up' : 'down');
    if (next === this.facing) return;
    this.facing = next;
    this.sprite.play(getZombieAnimationKey(this.typeId, next), true);
  }

  /** 接触玩家时尝试攻击,返回造成的伤害(冷却未到返回 0)。 */
  tryAttack(now: number): number {
    if (now - this.lastAttackAt < this.def.attackRate) return 0;
    this.lastAttackAt = now;
    return this.def.damage;
  }

  /** 扣血,返回是否死亡。 */
  hurt(amount: number): boolean {
    this.health -= amount;
    // 受击闪白
    this.sprite.setTintFill(0xffffff);
    this.scene.tweens.add({
      targets: this.sprite,
      scaleX: this.baseScale * 1.08,
      scaleY: this.baseScale * 0.92,
      duration: 45,
      yoyo: true,
    });
    this.scene.time.delayedCall(50, () => {
      if (this.active) this.sprite.setTint(this.baseTint);
    });
    return this.health <= 0;
  }
}
