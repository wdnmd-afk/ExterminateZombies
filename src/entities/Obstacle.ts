import Phaser from 'phaser';
import { DEPTH } from '../constants';
import type { ObstaclePlacement } from '../config/types';
import { buildRotatedRectTiles } from '../utils/geometry';
import { OBSTACLE_TEXTURE_KEYS } from '../systems/EnvironmentAssetManager';

/**
 * 静态掩体。挡玩家移动、挡僵尸移动(撞墙滑行)、挡子弹。
 *
 * 三种 kind 分别映射为像素集装箱、废弃卡车和混凝土围墙，显示尺寸严格跟随关卡配置。
 * 摆放时用凸形、不围死、留通路，配合直线 seek 让僵尸沿墙滑行。
 *
 * --------------------------------------------------------------------------------
 * 碰撞由**一串轴对齐碰撞砖**表达，而不是本容器自己带一个刚体。
 *
 * 原因：Arcade Physics 的静态刚体不能旋转。旧实现取整个旋转矩形的包围盒当刚体，
 * 于是斜放的掩体占位显著大于贴图——45 度时包围盒面积是矩形本身的 2.38 倍，碰撞区最远
 * 探出贴图轮廓 55px，玩家和子弹会在离墙半个身位的空地上被挡住（2026-08-24 用户两次
 * 实机截图报的都是这个）。
 *
 * 现在把旋转矩形按扫描线分带铺成一串轴对齐砖（`buildRotatedRectTiles`）：
 * 每一带取矩形在该带内的真实上下界，端头跟着矩形收成尖角，最大探出降到 4~6px，
 * 且并集仍完整覆盖矩形，不会开出让子弹或僵尸穿过的缝。
 *
 * 因此本容器只负责**视觉**，不进物理系统；碰撞砖是独立的静态刚体，由 `GameScene`
 * 加进 `obstacleGroup`。子弹反弹读的是被命中那块砖的边界，比旧的整体包围盒更贴近
 * 真实墙面——虽然仍是轴对齐的阶梯近似，斜墙上的反射法线并不精确（遗留项）。
 */
export class Obstacle extends Phaser.GameObjects.Container {
  readonly obstacleWidth: number;
  readonly obstacleHeight: number;

  /**
   * 本掩体的碰撞砖。调用方必须把它们加进静态碰撞组，否则这个掩体只是一张图。
   *
   * 用 `Rectangle` 而不是 `Zone`：`Zone` 不能在调试渲染里看到，而这一层的正确性
   * 完全靠肉眼比对「砖的范围」和「贴图的范围」来验收（`physics.arcade.debug`）。
   * 砖本身 `setVisible(false)`，不进画面。
   */
  readonly collisionTiles: Phaser.GameObjects.Rectangle[];

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
    this.setDepth(DEPTH.prop);

    this.collisionTiles = buildRotatedRectTiles(
      placement.x,
      placement.y,
      placement.width,
      placement.height,
      placement.rotation ?? 0,
    ).map((tile) => {
      const body = scene.add.rectangle(tile.x, tile.y, tile.width, tile.height);
      body.setVisible(false);
      scene.physics.add.existing(body, true);
      return body;
    });
  }

  /** 砖不是本容器的子对象，销毁时必须一并带走，否则场景里会留下看不见的墙。 */
  override destroy(fromScene?: boolean): void {
    for (const tile of this.collisionTiles) {
      tile.destroy(fromScene);
    }
    this.collisionTiles.length = 0;
    super.destroy(fromScene);
  }
}
