import Phaser from 'phaser';

/**
 * 基于 Phaser.GameObjects.Group 的对象池封装。
 * 子弹、掉落物这类高频创建/销毁的对象复用实例,避免每帧 new 造成 GC 抖动。
 *
 * 约定:被池管理的对象实现 spawn/despawn 语义 —— 用 setActive+setVisible 表示存活,
 * 回收时 setActive(false)+setVisible(false),下次 getFirstDead 复用。
 */
export class ObjectPool<T extends Phaser.GameObjects.GameObject> {
  private group: Phaser.GameObjects.Group;
  private destroyed = false;
  /**
   * 历史同时存活峰值。
   *
   * 存在理由：审计缺口 B（`2026-09-09-combat-baseline-audit.md` §6.2）指出本池是唯一
   * 没有硬上限的显示资源，但同一份审计也给出了不能立刻加上限的理由——
   * 「当前无实测数据证明会失控，不建议先改数值，应先观测峰值再决定上限值」。
   * 凭空写一个 maxSize 常量既可能截断正常表现，也可能高到根本没有约束力。
   *
   * 因此这里同时提供观测与可选硬上限：峰值通过 `GameScene.getPerformanceStats()` 暴露，
   * 受限池达到容量时由 `tryAcquire` 返回 null，让表现层按自己的降级策略处理。
   */
  private peakActive = 0;
  /** 达到上限后拒绝新取用的次数。为 0 说明上限从未被触及。 */
  private capHits = 0;

  constructor(
    scene: Phaser.Scene,
    factory: (scene: Phaser.Scene) => T,
    initialSize = 0,
    /**
     * 总容量硬上限。`null` 表示不限制；设定后取用方必须用 `tryAcquire`
     * 处理容量耗尽，避免通用池擅自决定如何抢占仍存活的业务对象。
     */
    private readonly maxSize: number | null = null,
  ) {
    if (!Number.isInteger(initialSize) || initialSize < 0) {
      throw new Error('Object pool initialSize must be a non-negative integer.');
    }
    if (this.maxSize !== null) {
      if (!Number.isInteger(this.maxSize) || this.maxSize < 1) {
        throw new Error('Object pool maxSize must be a positive integer or null.');
      }
      if (initialSize > this.maxSize) {
        throw new Error('Object pool initialSize cannot exceed maxSize.');
      }
    }
    this.group = scene.add.group({
      classType: Phaser.GameObjects.GameObject,
      runChildUpdate: false,
    });
    // 预热:预先创建一批 dead 实例,减少运行时首次分配。
    for (let i = 0; i < initialSize; i++) {
      const obj = factory(scene);
      obj.setActive(false);
      this.group.add(obj);
    }
    this.factory = factory;
    this.scene = scene;
  }

  private factory: (scene: Phaser.Scene) => T;
  private scene: Phaser.Scene;

  /**
   * 取一个空闲对象；没有则新建。该入口用于未设置上限、不能丢弃的玩法对象。
   * 受限视觉池应调用 `tryAcquire`，把达到上限当作可观测降级处理。
   */
  acquire(): T {
    const obj = this.tryAcquire();
    if (!obj) {
      throw new Error('Object pool capacity reached; capped pools must use tryAcquire().');
    }
    return obj;
  }

  /**
   * 尝试取一个对象。达到硬上限时返回 null，不抢占仍存活的对象。
   *
   * 不能在通用池里直接复用 active 对象：粒子的旧 Tween、特效的动画完成事件、
   * 残留区域持有的精灵引用都可能在稍后回调。抢占后这些旧回调会错误回收新效果。
   */
  tryAcquire(): T | null {
    if (this.destroyed) throw new Error('Cannot acquire from a destroyed object pool.');
    let obj = this.group.getFirstDead(false) as T | null;
    if (!obj) {
      const capacity = this.group.children.entries.length;
      if (this.maxSize !== null && capacity >= this.maxSize) {
        this.capHits += 1;
        return null;
      }
      obj = this.factory(this.scene);
      this.group.add(obj);
    }
    // 峰值要把「正在取的这一个」算进去：调用方通常还没 setActive(true)，
    // 此刻直接读 getActive() 会少算 1。但 factory 是否返回 active 实例由调用方决定
    // （`Bullet` 等在构造里就是 active），因此不能无条件 +1，否则那些池的读数会虚高。
    const active = this.getActive();
    const alreadyCounted = active.includes(obj);
    this.peakActive = Math.max(this.peakActive, active.length + (alreadyCounted ? 0 : 1));
    return obj;
  }

  /** 观测读数：同时存活峰值、当前总容量与上限命中次数。 */
  getUsage(): { peakActive: number; capacity: number; capHits: number; maxSize: number | null } {
    return {
      peakActive: this.peakActive,
      capacity: this.destroyed || !this.group.children?.entries
        ? 0
        : this.group.children.entries.length,
      capHits: this.capHits,
      maxSize: this.maxSize,
    };
  }

  /** 当前存活(active)的对象列表。 */
  getActive(): T[] {
    if (this.destroyed || !this.group.children?.entries) return [];
    return this.group.getMatching('active', true) as T[];
  }

  /** 对每个存活对象执行回调。 */
  forEachActive(fn: (obj: T) => void): void {
    if (this.destroyed || !this.group.children?.entries) return;
    (this.group.children.entries as T[]).forEach((child) => {
      if (child.active) fn(child);
    });
  }

  /** 场景 shutdown 可能先销毁 Group；池自身清理必须可重复且不再访问已销毁 children。 */
  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    if (!this.group.children?.entries) return;
    this.group.destroy(true);
  }

  get phaserGroup(): Phaser.GameObjects.Group {
    return this.group;
  }
}
