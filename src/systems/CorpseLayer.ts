import Phaser from 'phaser';
import { DEPTH } from '../constants';

/** 尸体残影的视觉快照。由 Zombie 在死亡结算时提供。 */
export interface CorpseSnapshot {
  textureKey: string;
  frameName: string | number;
  scale: number;
  rotation: number;
  originY: number;
  tint: number;
}

/** 同屏残影上限。超出时立刻回收最早的一具，防止高密度战斗堆图。 */
const MAX_CORPSES = 24;

const SLIDE_DURATION = 260;
const LINGER_DURATION = 1500;
const FADE_DURATION = 420;

/**
 * 尸体残影层。
 *
 * 必须与 Zombie 实体完全解耦：`WaveManager.hasAliveEnemies` 用活跃僵尸数判断本波是否清空，
 * 若为了播放尸体表现而延长 Zombie 的 active 生命周期，会直接卡住波次推进。
 * 因此 Zombie 在死亡结算时立即回池，这里只拿一份视觉快照在独立池化 Sprite 上演出。
 */
export class CorpseLayer {
  private readonly scene: Phaser.Scene;
  private readonly pool: Phaser.GameObjects.Sprite[] = [];
  /** 按加入顺序记录，超上限时回收队首。 */
  private readonly active: Phaser.GameObjects.Sprite[] = [];

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  /** 当前存活的残影数量。供性能压测读取活跃对象统计。 */
  get activeCount(): number {
    return this.active.length;
  }

  /**
   * 生成一具残影并沿击退方向滑出。
   * `knockbackAngle` 为空时只做原地淡出，避免没有明确来源时尸体乱飞。
   */
  spawn(
    x: number,
    y: number,
    snapshot: CorpseSnapshot,
    knockbackAngle: number | null,
    knockbackDistance: number,
  ): void {
    if (this.active.length >= MAX_CORPSES) this.recycleOldest();

    const sprite = this.acquire();
    sprite.setTexture(snapshot.textureKey, snapshot.frameName);
    sprite.setOrigin(0.5, snapshot.originY);
    sprite.setPosition(x, y);
    sprite.setScale(snapshot.scale);
    sprite.setRotation(snapshot.rotation);
    // 残影统一压暗，和活着的感染体区分开，避免玩家误判成还能动的目标。
    sprite.setTint(Phaser.Display.Color.ValueToColor(snapshot.tint).darken(45).color);
    sprite.setAlpha(0.85);
    sprite.setActive(true);
    sprite.setVisible(true);
    this.active.push(sprite);

    this.scene.tweens.killTweensOf(sprite);

    if (knockbackAngle !== null && knockbackDistance > 0) {
      this.scene.tweens.add({
        targets: sprite,
        x: x + Math.cos(knockbackAngle) * knockbackDistance,
        y: y + Math.sin(knockbackAngle) * knockbackDistance,
        // 躺倒感：沿击退方向轻微翻转，不做整圈旋转以免看起来像还在活动。
        rotation: snapshot.rotation + Phaser.Math.FloatBetween(-0.5, 0.5),
        duration: SLIDE_DURATION,
        ease: 'Cubic.Out',
      });
    }

    this.scene.tweens.add({
      targets: sprite,
      alpha: 0,
      scale: snapshot.scale * 0.92,
      delay: LINGER_DURATION,
      duration: FADE_DURATION,
      ease: 'Sine.In',
      onComplete: () => this.release(sprite),
    });
  }

  destroy(): void {
    for (const sprite of [...this.active, ...this.pool]) {
      this.scene.tweens.killTweensOf(sprite);
      sprite.destroy();
    }
    this.active.length = 0;
    this.pool.length = 0;
  }

  private acquire(): Phaser.GameObjects.Sprite {
    const pooled = this.pool.pop();
    if (pooled) return pooled;

    const sprite = this.scene.add.sprite(0, 0, undefined as unknown as string, 0);
    sprite.setDepth(DEPTH.corpse);
    return sprite;
  }

  private recycleOldest(): void {
    const oldest = this.active[0];
    if (!oldest) return;
    this.scene.tweens.killTweensOf(oldest);
    this.release(oldest);
  }

  private release(sprite: Phaser.GameObjects.Sprite): void {
    const index = this.active.indexOf(sprite);
    if (index >= 0) this.active.splice(index, 1);
    sprite.setActive(false);
    sprite.setVisible(false);
    this.pool.push(sprite);
  }
}
