import Phaser from 'phaser';
import { DEPTH } from '../constants';
import type { InputManager } from '../systems/InputManager';
import { angleBetween } from '../utils/math';
import { GAME_ASSET_KEYS, PLAYER_WALK_ANIMATION } from '../systems/GameAssetManager';

const PLAYER_SPEED = 240;      // 像素/秒
const PLAYER_SIZE = 28;        // 逻辑体尺寸(枪管落点、阴影用)
const PLAYER_RADIUS = 16;      // 物理碰撞半径
const PLAYER_SPRITE_SCALE = 0.92; // 48px 源图相对逻辑体的显示缩放
const INVULN_MS = 500;         // 受伤后无敌帧,防连扣

/**
 * 玩家实体。正式外观:Ghostbyte 俯视持枪行走精灵(单向 12 帧)。
 * 精灵始终保持直立、按瞄准方向左右翻转;移动时播放行走动画,静止停在首帧。
 * 容器自身旋转朝向鼠标,只用于驱动枪管落点(getMuzzle),不旋转精灵本体。
 */
export class Player extends Phaser.GameObjects.Container {
  declare body: Phaser.Physics.Arcade.Body;

  private lastHurtAt = -Infinity;
  private sprite: Phaser.GameObjects.Sprite;
  private barrel: Phaser.GameObjects.Rectangle;
  private moving = false;
  /** 瞄准角(弧度)。容器本体不旋转,由此角驱动枪管与枪口。 */
  private aimAngle = 0;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y);

    const shadow = scene.add.ellipse(0, 14, PLAYER_SIZE, 11, 0x000000, 0.28);
    // 枪管:置于容器中心、原点在左端,靠自身 rotation 指向鼠标(容器本体不旋转)。
    this.barrel = scene.add.rectangle(0, 2, PLAYER_SIZE / 2 + 8, 5, 0xdddddd, 0.9);
    this.barrel.setOrigin(0, 0.5);
    this.sprite = scene.add.sprite(0, 0, GAME_ASSET_KEYS.player, 0);
    this.sprite.setScale(PLAYER_SPRITE_SCALE);
    this.add([shadow, this.barrel, this.sprite]);

    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.body.setCircle(PLAYER_RADIUS, -PLAYER_RADIUS, -PLAYER_RADIUS);
    this.body.setCollideWorldBounds(true);
    this.setDepth(DEPTH.player);
  }

  /** 枪口世界坐标(子弹生成点)。用瞄准角而非容器旋转,精灵本体保持直立。 */
  getMuzzle(): { x: number; y: number; angle: number } {
    const len = PLAYER_SIZE / 2 + 16;
    return {
      x: this.x + Math.cos(this.aimAngle) * len,
      y: this.y + Math.sin(this.aimAngle) * len,
      angle: this.aimAngle,
    };
  }

  update(input: InputManager): void {
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
      this.body.setVelocity(vx * inv * PLAYER_SPEED, vy * inv * PLAYER_SPEED);
    } else {
      this.body.setVelocity(0, 0);
    }

    // —— 瞄准:记录朝向角。只驱动枪管指针,精灵本体不旋转。 ——
    const p = input.getPointerWorld();
    this.aimAngle = angleBetween(this.x, this.y, p.x, p.y);
    this.barrel.setRotation(this.aimAngle);

    // 精灵按瞄准方向左右翻转,保持直立可读。
    const facingLeft = Math.cos(this.aimAngle) < 0;
    this.sprite.setFlipX(facingLeft);

    // 移动播行走动画,静止停在首帧。
    if (isMoving && !this.moving) {
      this.sprite.play(PLAYER_WALK_ANIMATION);
      this.moving = true;
    } else if (!isMoving && this.moving) {
      this.sprite.stop();
      this.sprite.setFrame(0);
      this.moving = false;
    }
  }

  playFireFeedback(accentColor: number): void {
    this.barrel.fillColor = accentColor;
    this.scene.tweens.add({
      targets: this.barrel,
      scaleX: 1.55,
      duration: 35,
      yoyo: true,
      onComplete: () => {
        this.barrel.fillColor = 0xdddddd;
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

  /** 尝试受伤;处于无敌帧内则忽略。返回是否实际扣血。 */
  takeDamage(_amount: number, now: number): boolean {
    if (now - this.lastHurtAt < INVULN_MS) return false;
    this.lastHurtAt = now;
    // 受击闪红反馈
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
