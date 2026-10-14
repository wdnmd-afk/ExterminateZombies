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

  constructor(
    scene: Phaser.Scene,
    factory: (scene: Phaser.Scene) => T,
    initialSize = 0,
  ) {
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
   * 取一个空闲对象;没有则新建。调用方负责随后 reset 其状态。
   *
   * group 已被 Phaser 销毁时抛出而不是静默返回:调用方紧接着就会 spawn 并使用
   * 返回值,给它一个游离对象只会把崩溃推迟到更难定位的地方。正常游玩不会走到
   * 这里 —— 只有场景 shutdown 之后仍在生成实体才会,那本身就是调用时序错误。
   */
  acquire(): T {
    if (!this.alive) {
      throw new Error('ObjectPool.acquire: group 已销毁,场景可能已 shutdown');
    }
    let obj = this.group.getFirstDead(false) as T | null;
    if (!obj) {
      obj = this.factory(this.scene);
      this.group.add(obj);
    }
    return obj;
  }

  /**
   * Phaser 销毁 Group 后会把内部 children 置为 undefined，而场景的 shutdown 事件
   * 可能晚于这次销毁派发（SceneManager.stop → Systems.shutdown → emit）。此时遍历
   * 会抛 "Cannot read properties of undefined"。判定放在池子层，
   * 这样所有调用方无需各自维护销毁标记。
   */
  private get alive(): boolean {
    return !this.destroyed && this.group.children !== undefined;
  }

  /** 当前存活(active)的对象列表。group 已销毁时返回空数组。 */
  getActive(): T[] {
    if (!this.alive) return [];
    return this.group.getMatching('active', true) as T[];
  }

  /** 对每个存活对象执行回调。group 已销毁时为空操作。 */
  forEachActive(fn: (obj: T) => void): void {
    if (!this.alive) return;
    (this.group.getChildren() as T[]).forEach((child) => {
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
