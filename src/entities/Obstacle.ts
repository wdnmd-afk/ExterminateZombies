import Phaser from 'phaser';
import { DEPTH } from '../constants';
import type { BreakableObstacleDef, ObstaclePlacement } from '../config/types';
import { buildRotatedRectTiles } from '../utils/geometry';
import { OBSTACLE_TEXTURE_KEYS } from '../systems/EnvironmentAssetManager';
import {
  applyBreakableObstacleDamage,
  type BreakableObstacleDamageResult,
  type BreakableObstacleStage,
} from '../systems/BreakableObstacleRules';

export type ObstacleCollisionTile = Phaser.GameObjects.Rectangle & {
  body: Phaser.Physics.Arcade.StaticBody;
  /** 碰撞组里保存的是砖；显式 owner 才能准确找到对应障碍，禁止按坐标猜。 */
  ownerObstacle: Obstacle;
};

export interface BreakableObstacleSnapshot {
  id: string;
  health: number;
  maxHealth: number;
  stage: BreakableObstacleStage;
  /** 坍塌后必须为 0，供浏览器客观验收确认逻辑通路确实打开。 */
  collisionTileCount: number;
}

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
  readonly breakable: BreakableObstacleDef | null;
  private health = 0;
  private stage: BreakableObstacleStage = 'intact';
  private readonly art: Phaser.GameObjects.Image;
  private readonly stateGraphics: Phaser.GameObjects.Graphics | null;

  /**
   * 本掩体的碰撞砖。调用方必须把它们加进静态碰撞组，否则这个掩体只是一张图。
   *
   * 用 `Rectangle` 而不是 `Zone`：`Zone` 不能在调试渲染里看到，而这一层的正确性
   * 完全靠肉眼比对「砖的范围」和「贴图的范围」来验收（`physics.arcade.debug`）。
   * 砖本身 `setVisible(false)`，不进画面。
   */
  readonly collisionTiles: ObstacleCollisionTile[];

  constructor(scene: Phaser.Scene, placement: ObstaclePlacement) {
    super(scene, placement.x, placement.y);

    this.obstacleWidth = placement.width;
    this.obstacleHeight = placement.height;
    this.breakable = placement.breakable ?? null;
    this.health = this.breakable?.health ?? 0;

    this.art = scene.add.image(0, 0, OBSTACLE_TEXTURE_KEYS[placement.kind]);
    this.art.setDisplaySize(placement.width, placement.height);
    this.stateGraphics = this.breakable ? scene.add.graphics() : null;
    this.add(this.art);
    if (this.stateGraphics) this.add(this.stateGraphics);
    if (this.stateGraphics) this.paintBreakableState();

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
      const collisionTile = body as ObstacleCollisionTile;
      collisionTile.ownerObstacle = this;
      return collisionTile;
    });
  }

  get isBreakable(): boolean {
    return this.breakable !== null;
  }

  get isCollapsed(): boolean {
    return this.stage === 'collapsed';
  }

  getBreakableSnapshot(): BreakableObstacleSnapshot | null {
    if (!this.breakable) return null;
    return {
      id: this.breakable.id,
      health: this.health,
      maxHealth: this.breakable.health,
      stage: this.stage,
      collisionTileCount: this.collisionTiles.length,
    };
  }

  /**
   * 结算结构伤害并更新裂损/坍塌视觉。
   * 返回 null 表示该障碍不可破坏；坍塌副作用由 GameScene 统一编排。
   */
  applyDamage(amount: number): BreakableObstacleDamageResult | null {
    if (!this.breakable) return null;
    const result = applyBreakableObstacleDamage({
      health: this.health,
      maxHealth: this.breakable.health,
      crackedHealthRatio: this.breakable.crackedHealthRatio,
    }, amount);
    if (!result.damaged) return result;

    this.health = result.health;
    this.stage = result.stage;
    this.scene.tweens.killTweensOf(this.art);
    if (result.collapsedNow) {
      // 坍塌态固定使用低透明废墟；受击 yoyo 会在结束时把 alpha 恢复成 1，因此这里不再启动它。
      this.paintBreakableState();
    } else {
      if (result.crackedNow) this.paintBreakableState();
      this.scene.tweens.add({
        targets: this.art,
        alpha: 0.42,
        duration: 45,
        yoyo: true,
      });
    }
    return result;
  }

  /** 爆炸圆是否碰到当前仍有效的任一碰撞砖。 */
  intersectsCircle(x: number, y: number, radius: number): boolean {
    if (this.isCollapsed || radius < 0) return false;
    return this.collisionTiles.some((tile) => {
      const left = tile.x - tile.width / 2;
      const right = tile.x + tile.width / 2;
      const top = tile.y - tile.height / 2;
      const bottom = tile.y + tile.height / 2;
      const closestX = Phaser.Math.Clamp(x, left, right);
      const closestY = Phaser.Math.Clamp(y, top, bottom);
      const dx = x - closestX;
      const dy = y - closestY;
      return dx * dx + dy * dy <= radius * radius;
    });
  }

  /** 坍塌后移除所有物理砖，视觉保留为低矮废墟带。 */
  collapseCollision(): void {
    if (!this.isCollapsed) return;
    this.destroyCollisionTiles();
    this.paintBreakableState();
  }

  private paintBreakableState(): void {
    if (!this.breakable || !this.stateGraphics) return;
    const graphics = this.stateGraphics;
    graphics.clear();

    const halfWidth = this.obstacleWidth / 2;
    const halfHeight = this.obstacleHeight / 2;
    if (this.stage === 'collapsed') {
      this.art
        .setTint(0x756d63)
        .setAlpha(0.48)
        .setDisplaySize(this.obstacleWidth * 1.04, Math.max(8, this.obstacleHeight * 0.3));
      graphics.fillStyle(0x6f6254, 0.92);
      for (let index = 0; index < 7; index += 1) {
        const x = -halfWidth + 12 + index * Math.max(12, (this.obstacleWidth - 24) / 6);
        const y = index % 2 === 0 ? -3 : 4;
        graphics.fillRect(x - 6, y - 3, 12, 6);
      }
      return;
    }

    this.art
      .setAlpha(1)
      .setDisplaySize(this.obstacleWidth, this.obstacleHeight)
      .setTint(this.stage === 'cracked' ? 0xc7a37a : 0xffffff);

    // 两端黄色角标让危墙不依赖颜色也能识别；中间裂纹只在进入裂损态后出现。
    graphics.lineStyle(3, 0xf5bd3d, 0.9);
    const marker = Math.min(14, halfHeight * 0.8);
    graphics.lineBetween(-halfWidth + 3, -halfHeight + marker, -halfWidth + 3, -halfHeight + 3);
    graphics.lineBetween(-halfWidth + 3, -halfHeight + 3, -halfWidth + marker, -halfHeight + 3);
    graphics.lineBetween(halfWidth - 3, halfHeight - marker, halfWidth - 3, halfHeight - 3);
    graphics.lineBetween(halfWidth - marker, halfHeight - 3, halfWidth - 3, halfHeight - 3);

    if (this.stage !== 'cracked') return;
    graphics.lineStyle(3, 0x241b17, 0.95);
    graphics.beginPath();
    graphics.moveTo(-halfWidth * 0.42, -halfHeight);
    graphics.lineTo(-halfWidth * 0.18, -halfHeight * 0.15);
    graphics.lineTo(-halfWidth * 0.32, halfHeight * 0.35);
    graphics.lineTo(0, halfHeight);
    graphics.moveTo(-halfWidth * 0.18, -halfHeight * 0.15);
    graphics.lineTo(halfWidth * 0.28, -halfHeight * 0.42);
    graphics.lineTo(halfWidth * 0.4, halfHeight * 0.2);
    graphics.strokePath();
  }

  private destroyCollisionTiles(): void {
    for (const tile of this.collisionTiles) {
      if (tile.body) tile.body.enable = false;
      tile.destroy();
    }
    this.collisionTiles.length = 0;
  }

  /** 砖不是本容器的子对象，销毁时必须一并带走，否则场景里会留下看不见的墙。 */
  override destroy(fromScene?: boolean): void {
    this.destroyCollisionTiles();
    super.destroy(fromScene);
  }
}
