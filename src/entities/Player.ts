import Phaser from 'phaser';
import { DEPTH } from '../constants';
import type { InputManager } from '../systems/InputManager';
import { angleBetween } from '../utils/math';
import { GAME_ASSET_KEYS } from '../systems/GameAssetManager';
import type { WeaponId } from '../config/weapons';
import {
  getWeaponGameplayVisual,
  type WeaponGameplayVisual,
} from '../systems/WeaponAssetManager';

const PLAYER_SPEED = 120;      // 像素/秒。整个动能层已统一减半，感染体速度同步下调
const PLAYER_SIZE = 28;        // 逻辑体尺寸(枪管落点、阴影用)
const PLAYER_RADIUS = 16;      // 物理碰撞半径
const PLAYER_SPRITE_SCALE = 1.08; // Kenney 37x43 源图相对逻辑体的显示缩放
const INVULN_MS = 500;         // 受伤后无敌帧,防连扣

/**
 * 玩家实体。Kenney 幸存者源图已经包含朝右的双手持枪姿态。
 * 武器先绘制、人物后绘制，让身体遮住枪托且双手自然覆盖握把，避免长枪穿过头部。
 * 人物按鼠标瞄准角连续旋转；Container、阴影和圆形物理体保持不旋转。
 */
export class Player extends Phaser.GameObjects.Container {
  declare body: Phaser.Physics.Arcade.Body;

  private lastHurtAt = -Infinity;
  private sprite: Phaser.GameObjects.Image;
  private weaponSprite: Phaser.GameObjects.Image;
  /** 瞄准角(弧度)。容器本体不旋转，由此角驱动人物、枪管与枪口。 */
  private aimAngle = 0;
  private weaponId: WeaponId = 'pistol';
  private weaponVisual: WeaponGameplayVisual = getWeaponGameplayVisual('pistol');

  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y);

    const shadow = scene.add.ellipse(0, 14, PLAYER_SIZE, 11, 0x000000, 0.28);
    this.sprite = scene.add.image(0, 0, GAME_ASSET_KEYS.player);
    this.sprite.setScale(PLAYER_SPRITE_SCALE);
    this.weaponSprite = scene.add.image(0, 0, this.weaponVisual.textureKey, this.weaponVisual.frame);
    this.applyWeaponVisual(this.weaponVisual);
    this.add([shadow, this.weaponSprite, this.sprite]);

    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.body.setCircle(PLAYER_RADIUS, -PLAYER_RADIUS, -PLAYER_RADIUS);
    this.body.setCollideWorldBounds(true);
    this.setDepth(DEPTH.player);
  }

  /** 枪口世界坐标与人物右手持枪位置保持一致。 */
  getMuzzle(): { x: number; y: number; angle: number } {
    const len = this.weaponVisual.muzzleDistance;
    const sideX = -Math.sin(this.aimAngle) * this.weaponVisual.sideOffset;
    const sideY = Math.cos(this.aimAngle) * this.weaponVisual.sideOffset;
    const forwardX = Math.cos(this.aimAngle) * this.weaponVisual.forwardOffset;
    const forwardY = Math.sin(this.aimAngle) * this.weaponVisual.forwardOffset;
    return {
      x: this.x + Math.cos(this.aimAngle) * len + sideX + forwardX,
      y: this.y + Math.sin(this.aimAngle) * len + sideY + forwardY,
      angle: this.aimAngle,
    };
  }

  /** 将当前真实枪械贴图、锚点和缩放应用到玩家手部覆盖层。 */
  setWeaponVisual(weaponId: WeaponId): void {
    if (weaponId === this.weaponId) return;
    this.weaponId = weaponId;
    this.weaponVisual = getWeaponGameplayVisual(weaponId);
    this.applyWeaponVisual(this.weaponVisual);
  }

  /**
   * 本帧是否处于移动状态，供武器计算移动射击散射惩罚。
   * 读物理速度而不是输入：`GameScene` 在 `player.update` 之后才调 `WeaponManager.update`，
   * 此时速度已是本帧最终值，且撞墙被挡停时也能正确判定为"未移动"。
   */
  isMoving(): boolean {
    return this.body.velocity.lengthSq() > 0;
  }

  update(input: InputManager, speedMultiplier = 1): void {
    // —— 移动:合成方向向量并归一化,避免斜向更快 ——
    let vx = 0;
    let vy = 0;
    if (input.isDown('moveUp')) vy -= 1;
    if (input.isDown('moveDown')) vy += 1;
    if (input.isDown('moveLeft')) vx -= 1;
    if (input.isDown('moveRight')) vx += 1;
    const isMoving = vx !== 0 || vy !== 0;
    if (isMoving) {
      const inv = 1 / Math.hypot(vx, vy);
      this.body.setVelocity(vx * inv * PLAYER_SPEED * speedMultiplier, vy * inv * PLAYER_SPEED * speedMultiplier);
    } else {
      this.body.setVelocity(0, 0);
    }

    // —— 瞄准:人物、右手枪管和枪口共同跟随鼠标，容器与物理体保持不转。 ——
    const p = input.getPointerWorld();
    this.aimAngle = angleBetween(this.x, this.y, p.x, p.y);
    const sideX = -Math.sin(this.aimAngle) * this.weaponVisual.sideOffset;
    const sideY = Math.cos(this.aimAngle) * this.weaponVisual.sideOffset;
    const forwardX = Math.cos(this.aimAngle) * this.weaponVisual.forwardOffset;
    const forwardY = Math.sin(this.aimAngle) * this.weaponVisual.forwardOffset;
    this.weaponSprite
      .setPosition(sideX + forwardX, sideY + forwardY)
      .setRotation(this.aimAngle);
    this.sprite.setFlipX(false).setRotation(this.aimAngle);
  }

  playFireFeedback(accentColor: number): void {
    this.scene.tweens.killTweensOf(this.weaponSprite);
    const baseScale = this.weaponVisual.scale;
    this.weaponSprite.setTint(accentColor);
    this.scene.tweens.add({
      targets: this.weaponSprite,
      scaleX: baseScale * 1.12,
      scaleY: baseScale * 0.92,
      duration: 35,
      yoyo: true,
      onComplete: () => {
        this.weaponSprite.setScale(baseScale);
        this.weaponSprite.clearTint();
      },
    });
    this.scene.tweens.add({
      targets: this.sprite,
      scaleX: PLAYER_SPRITE_SCALE * 0.94,
      scaleY: PLAYER_SPRITE_SCALE * 1.05,
      duration: 35,
      yoyo: true,
    });
  }

  private applyWeaponVisual(visual: WeaponGameplayVisual): void {
    this.scene.tweens.killTweensOf(this.weaponSprite);
    this.weaponSprite
      .clearTint()
      .setTexture(visual.textureKey, visual.frame)
      .setOrigin(visual.originX, visual.originY)
      .setScale(visual.scale);
  }

  /** 把无敌帧时间点后移 `offset` 毫秒，供战场解除冻结时调用（说明见 GameScene.shiftBattleTimers）。 */
  shiftTimers(offset: number): void {
    this.lastHurtAt += offset;
  }

  /** 尝试受伤;处于无敌帧内则忽略。返回是否实际扣血。 */
  takeDamage(_amount: number, now: number): boolean {
    if (now - this.lastHurtAt < INVULN_MS) return false;
    this.lastHurtAt = now;
    // 受击闪红只作用于人物，武器保留原色以免影响枪型辨识。
    this.sprite.setTint(0xff5555);
    this.scene.tweens.add({
      targets: this.sprite,
      alpha: 0.35,
      duration: 60,
      yoyo: true,
      onComplete: () => {
        this.sprite.clearTint();
        this.sprite.setAlpha(1);
      },
    });
    this.scene.tweens.add({
      targets: this.sprite,
      scaleX: PLAYER_SPRITE_SCALE * 1.08,
      scaleY: PLAYER_SPRITE_SCALE * 0.92,
      duration: 55,
      yoyo: true,
    });
    return true;
  }
}
