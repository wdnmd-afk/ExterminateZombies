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

  /** 取一个空闲对象;没有则新建。调用方负责随后 reset 其状态。 */
  acquire(): T {
    let obj = this.group.getFirstDead(false) as T | null;
    if (!obj) {
      obj = this.factory(this.scene);
      this.group.add(obj);
    }
    return obj;
  }

  /** 当前存活(active)的对象列表。 */
  getActive(): T[] {
    return this.group.getMatching('active', true) as T[];
  }

  /** 对每个存活对象执行回调。 */
  forEachActive(fn: (obj: T) => void): void {
    (this.group.getChildren() as T[]).forEach((child) => {
      if (child.active) fn(child);
    });
  }

  get phaserGroup(): Phaser.GameObjects.Group {
    return this.group;
  }
}
