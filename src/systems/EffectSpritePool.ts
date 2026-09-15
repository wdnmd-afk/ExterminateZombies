import Phaser from 'phaser';
import { ObjectPool } from '../utils/ObjectPool';
import {
  getEffectAnimationKey,
  getEffectLayout,
  resolveEffectOrigin,
  type EffectAssetKey,
} from '../config/effectVisuals';

export interface EffectSpawnOptions {
  x: number;
  y: number;
  /** 朝向弧度。0 表示贴图原始朝向（向右），与生图管线的基准方向一致。 */
  rotation?: number;
  /**
   * 沿贴图宽度方向的显示尺寸（逻辑像素）。高度按贴图比例等比推导。
   * 只给宽度不给高度是刻意的：非等比缩放会让同一套像素素材在不同武器上有不同的
   * 像素颗粒度，切枪时能看出颗粒跳变（与 `WEAPON_TOPDOWN_SCALE` 统一缩放同理）。
   */
  width: number;
  /**
   * `add` 用于火焰、枪焰、爆炸这类自发光素材：它们在深色地面上必须提亮而不是压暗，
   * NORMAL 混合会让键控出的硬边变成一块贴在地上的暗色补丁。
   * `normal` 用于烟：ADD 会把灰烟也变成提亮，烟就再也读不出"遮挡"的语义。
   */
  blend?: 'add' | 'normal';
  tint?: number;
  alpha?: number;
  depth: number;
}

/**
 * 特效精灵池。
 *
 * 存在理由是复用而不是抽象：加特林 45ms 一发、霰弹一次三束齐射，枪口焰是全场创建频率
 * 最高的显示对象。改造前每一枪 `add.circle` + `add.rectangle` 后 `destroy()`，
 * 在持续开火下等于每秒二十几次分配与回收；池化后稳态零分配。
 *
 * 同时也是"素材缺失时不炸"的唯一收口点：`spawn` 在纹理或动画不存在时返回 null，
 * 调用方据此回落到图元表现。没有这道闸门，一次预载失败会让屏幕上出现 Phaser 的
 * 绿色缺失纹理方块，比没有特效糟糕得多。
 */
export class EffectSpritePool {
  private scene: Phaser.Scene;
  private pool: ObjectPool<Phaser.GameObjects.Sprite>;

  constructor(scene: Phaser.Scene, initialSize = 12) {
    this.scene = scene;
    this.pool = new ObjectPool(
      scene,
      (owner) => {
        const sprite = owner.add.sprite(0, 0, '__DEFAULT');
        sprite.setActive(false);
        sprite.setVisible(false);
        return sprite;
      },
      initialSize,
    );
  }

  /** 纹理与动画是否都已就绪。调用方用它决定走位图路径还是图元回落路径。 */
  has(textureKey: EffectAssetKey): boolean {
    return this.scene.textures.exists(textureKey)
      && this.scene.anims.exists(getEffectAnimationKey(textureKey));
  }

  /**
   * 取一个精灵并开始播放。
   *
   * `repeat: 'once'` 的素材播完自动回收，调用方不需要持有引用；
   * `repeat: 'loop'` 的素材（喷口火舌、地面燃烧区）必须由调用方持有并在结束时 `release`。
   */
  spawn(textureKey: EffectAssetKey, options: EffectSpawnOptions): Phaser.GameObjects.Sprite | null {
    if (!this.has(textureKey)) return null;
    const layout = getEffectLayout(textureKey);
    const origin = resolveEffectOrigin(layout.anchor);
    const sprite = this.pool.acquire();

    this.scene.tweens.killTweensOf(sprite);
    sprite.setTexture(textureKey, '0');
    sprite.setOrigin(origin.x, origin.y);
    sprite.setPosition(options.x, options.y);
    sprite.setRotation(options.rotation ?? 0);
    sprite.setScale(options.width / layout.frameWidth);
    sprite.setAlpha(options.alpha ?? 1);
    sprite.setDepth(options.depth);
    sprite.setBlendMode(
      options.blend === 'add' ? Phaser.BlendModes.ADD : Phaser.BlendModes.NORMAL,
    );
    if (options.tint === undefined) sprite.clearTint();
    else sprite.setTint(options.tint);
    sprite.setActive(true);
    sprite.setVisible(true);

    const animationKey = getEffectAnimationKey(textureKey);
    if (layout.repeat === 'once') {
      // 用动画完成事件回收而不是 delayedCall：慢动作会缩放 anims 的时间尺度，
      // 定时器不会跟着缩放，两者脱钩时枪焰会在慢镜头里提前消失。
      sprite.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => this.release(sprite));
    }
    sprite.play({ key: animationKey, startFrame: 0 }, true);
    return sprite;
  }

  /**
   * 归还精灵。对 `once` 素材是自动调用，对 `loop` 素材由持有方调用。
   *
   * 关停期必须能安全调用。Phaser 在场景 shutdown 时会先销毁场景内的显示对象，
   * 业务层的池清理跑在那之后（`GameScene.handleShutdown` → `AreaEffectFactory.destroy`
   * → `releaseZoneSprite` → 这里）。此时精灵的 `anims` 组件已经不存在，
   * 直接 `sprite.stop()` 会抛 `Cannot read properties of undefined (reading 'stop')`，
   * 而这个异常会**中断整个 handleShutdown**，导致下一个场景再也起不来。
   *
   * 实测触发路径是纯玩家操作：无尽模式留下燃烧/粉尘残留区 → ESC 暂停 → 返回主页
   * → 从主菜单开另一关。挂起的战局被顶掉时走 shutdown，卡在这里，新关卡永不启动。
   * 这条路径回答了 `docs/execution/2026-09-01-shutdown-effect-pool-defect.md` §4
   * 留下的问题：真实玩法确实受影响，不是只有测试探针会碰到。
   *
   * 防御放在这一个收口点，而不是每个调用方各判一次——与该文档 §5 的结论一致。
   */
  release(sprite: Phaser.GameObjects.Sprite): void {
    // `scene.sys` 在场景销毁后为 undefined；此时 tween 管理器也已不可用。
    if (!sprite || !sprite.scene) return;
    this.scene.tweens.killTweensOf(sprite);
    sprite.removeAllListeners(Phaser.Animations.Events.ANIMATION_COMPLETE);
    // `anims` 组件随场景销毁一起消失，stop() 只在它还在时才有意义。
    if (sprite.anims) sprite.stop();
    sprite.setActive(false);
    sprite.setVisible(false);
    sprite.clearTint();
    sprite.setAlpha(1);
    sprite.setScale(1);
    sprite.setRotation(0);
    sprite.setBlendMode(Phaser.BlendModes.NORMAL);
  }

  /** 当前存活的特效精灵数，供诊断探针读取。 */
  getActiveCount(): number {
    let count = 0;
    this.pool.forEachActive(() => {
      count += 1;
    });
    return count;
  }

  destroy(): void {
    this.pool.forEachActive((sprite) => this.release(sprite));
    this.pool.destroy();
  }
}
