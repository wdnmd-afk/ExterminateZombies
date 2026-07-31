import Phaser from 'phaser';
import { DEPTH } from '../constants';
import type { ObstaclePlacement } from '../config/types';
import { getRotatedAabbSize } from '../utils/geometry';
import { OBSTACLE_TEXTURE_KEYS } from '../systems/EnvironmentAssetManager';

/**
 * 静态掩体。挡玩家移动、挡僵尸移动(撞墙滑行)、挡子弹。
 *
 * 三种 kind 分别映射为像素集装箱、废弃卡车和混凝土围墙，显示尺寸严格跟随关卡配置。
 * 物理体为矩形静态体;摆放时用凸形、不围死、留通路,配合直线 seek 让僵尸沿墙滑行。
 */
export class Obstacle extends Phaser.GameObjects.Container {
  declare body: Phaser.Physics.Arcade.StaticBody;

  readonly obstacleWidth: number;
  readonly obstacleHeight: number;

  constructor(scene: Phaser.Scene, placement: ObstaclePlacement) {
    super(scene, placement.x, placement.y);

    this.obstacleWidth = placement.width;
    this.obstacleHeight = placement.height;

    const art = scene.add.image(0, 0, OBSTACLE_TEXTURE_KEYS[placement.kind]);
    art.setDisplaySize(placement.width, placement.height);
    this.add(art);

    if (placement.rotation) {
      this.setRotation(Phaser.Math.DegToRad(placement.rotation));
    }

    scene.add.existing(this);
    scene.physics.add.existing(this, true);
    this.setDepth(DEPTH.prop);

    // Arcade Physics 不支持旋转静态刚体；使用旋转矩形的 AABB，至少保证 90 度路障
    // 不会出现“视觉竖直、碰撞水平”的错误，小角度掩体也有一致的安全边界。
    const bodySize = getRotatedAabbSize(placement.width, placement.height, placement.rotation ?? 0);
    this.body.setSize(bodySize.width, bodySize.height);
    this.body.position.set(placement.x - bodySize.width / 2, placement.y - bodySize.height / 2);
    this.body.updateCenter();
  }
}
