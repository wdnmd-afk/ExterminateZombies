import Phaser from 'phaser';
import { DEPTH } from '../constants';
import type { ObstacleKind, ObstaclePlacement } from '../config/types';

/**
 * 静态掩体。挡玩家移动、挡僵尸移动(撞墙滑行)、挡子弹。
 *
 * 外观走 canvas 程序化绘制(Graphics),贴合游戏的扁平/海报风,零外部资源。
 * 三种 kind 对应三关设定:集装箱(郊外)、废弃汽车(废车站)、混凝土路障(封锁城区)。
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

    const gfx = scene.add.graphics();
    this.drawByKind(gfx, placement.kind, placement.width, placement.height);
    this.add(gfx);

    if (placement.rotation) {
      this.setRotation(Phaser.Math.DegToRad(placement.rotation));
    }

    scene.add.existing(this);
    scene.physics.add.existing(this, true);
    this.setDepth(DEPTH.prop);

    // 静态体不随容器旋转变形,用未旋转的 AABB 近似;旋转较小的掩体足够贴合。
    // Container 没有 getTopLeft,不能用 updateFromGameObject();手动按中心原点定位静态体。
    this.body.setSize(placement.width, placement.height);
    this.body.position.set(placement.x - placement.width / 2, placement.y - placement.height / 2);
    this.body.updateCenter();
  }

  /** 按种类程序化绘制外观。坐标以容器中心为原点。 */
  private drawByKind(g: Phaser.GameObjects.Graphics, kind: ObstacleKind, w: number, h: number): void {
    const hw = w / 2;
    const hh = h / 2;

    switch (kind) {
      case 'container':
        this.drawContainer(g, hw, hh, w, h);
        break;
      case 'wreck':
        this.drawWreck(g, hw, hh, w, h);
        break;
      case 'barricade':
        this.drawBarricade(g, hw, hh, w, h);
        break;
    }
  }

  /** 集装箱:主体色块 + 深色描边 + 均匀竖向瓦楞纹。 */
  private drawContainer(g: Phaser.GameObjects.Graphics, hw: number, hh: number, w: number, h: number): void {
    // 落地阴影
    g.fillStyle(0x000000, 0.22);
    g.fillRect(-hw + 4, -hh + 6, w, h);
    // 箱体
    g.fillStyle(0xc85a3a, 1);
    g.fillRect(-hw, -hh, w, h);
    // 顶部高光边
    g.fillStyle(0xe07a4c, 1);
    g.fillRect(-hw, -hh, w, Math.max(4, h * 0.14));
    // 瓦楞竖纹
    g.fillStyle(0x0f0e13, 0.16);
    const step = 14;
    for (let x = -hw + step; x < hw; x += step) {
      g.fillRect(x - 1.5, -hh + h * 0.14, 3, h - h * 0.14);
    }
    // 描边
    g.lineStyle(3, 0x0f0e13, 0.9);
    g.strokeRect(-hw, -hh, w, h);
  }

  /** 废弃汽车:车身圆角块 + 车顶舱 + 两块车窗,冷灰蓝色调。 */
  private drawWreck(g: Phaser.GameObjects.Graphics, hw: number, hh: number, w: number, h: number): void {
    g.fillStyle(0x000000, 0.22);
    g.fillRoundedRect(-hw + 4, -hh + 6, w, h, 8);
    // 车身
    g.fillStyle(0x5a6b74, 1);
    g.fillRoundedRect(-hw, -hh, w, h, 10);
    // 车顶座舱(居中略小)
    const cabinW = w * 0.54;
    const cabinH = h * 0.5;
    g.fillStyle(0x3f4c53, 1);
    g.fillRoundedRect(-cabinW / 2, -cabinH / 2, cabinW, cabinH, 6);
    // 车窗高光
    g.fillStyle(0x9fb8c4, 0.5);
    g.fillRoundedRect(-cabinW / 2 + 4, -cabinH / 2 + 4, cabinW - 8, cabinH * 0.4, 3);
    // 锈斑点缀
    g.fillStyle(0x7a4a2a, 0.5);
    g.fillCircle(-hw + w * 0.2, hh - h * 0.22, Math.max(3, h * 0.08));
    g.fillCircle(hw - w * 0.24, -hh + h * 0.26, Math.max(2, h * 0.06));
    g.lineStyle(3, 0x0f0e13, 0.9);
    g.strokeRoundedRect(-hw, -hh, w, h, 10);
  }

  /** 混凝土路障:主体 + 顶部黄黑警示斜纹。 */
  private drawBarricade(g: Phaser.GameObjects.Graphics, hw: number, hh: number, w: number, h: number): void {
    g.fillStyle(0x000000, 0.22);
    g.fillRect(-hw + 4, -hh + 6, w, h);
    // 混凝土主体
    g.fillStyle(0x9a958c, 1);
    g.fillRect(-hw, -hh, w, h);
    // 顶部警示带
    const bandH = Math.max(8, h * 0.32);
    g.fillStyle(0xfbc02d, 1);
    g.fillRect(-hw, -hh, w, bandH);
    // 警示带上的黑色斜纹
    g.fillStyle(0x0f0e13, 0.85);
    const stripe = 12;
    for (let x = -hw - h; x < hw; x += stripe * 2) {
      g.beginPath();
      g.moveTo(x, -hh);
      g.lineTo(x + bandH, -hh);
      g.lineTo(x + bandH - stripe, -hh + bandH);
      g.lineTo(x - stripe, -hh + bandH);
      g.closePath();
      g.fillPath();
    }
    // 混凝土裂纹
    g.lineStyle(2, 0x0f0e13, 0.18);
    g.lineBetween(-hw + w * 0.35, -hh + bandH, -hw + w * 0.28, hh);
    g.lineBetween(hw - w * 0.3, -hh + bandH, hw - w * 0.36, hh);
    g.lineStyle(3, 0x0f0e13, 0.9);
    g.strokeRect(-hw, -hh, w, h);
  }
}
