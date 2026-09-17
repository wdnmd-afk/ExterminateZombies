import type Phaser from 'phaser';
import { describe, expect, it, vi } from 'vitest';
import { ObjectPool } from '../src/utils/ObjectPool';

/** ObjectPool 只用到 GameObjects.Group 的少数方法；Node 环境不能加载完整 Phaser。 */
vi.mock('phaser', () => ({
  default: { GameObjects: { GameObject: class {} } },
}));

/**
 * 池的类型参数受 `Phaser.GameObjects.GameObject` 约束，替身不可能实现它的全部成员，
 * 因此对外用真实类型、内部按需 cast（与 `effect-sprite-pool-shutdown.test.ts` 同一手法）。
 * 用例只依赖 `active` / `setActive`，这两个成员真实 GameObject 上就有。
 */
type PoolObject = Phaser.GameObjects.GameObject;

interface FakeObject {
  active: boolean;
  setActive(value: boolean): FakeObject;
}

/**
 * 最小 Group 替身，保留两条被 ObjectPool 依赖的真实语义：
 * 1. `children.entries.length` 是池的当前总容量
 * 2. `getFirstDead` 返回第一个 `active === false` 的成员
 */
function createFakeScene() {
  const entries: FakeObject[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const group = {
    children: { entries },
    add(obj: FakeObject) { entries.push(obj); return group; },
    getFirstDead() { return entries.find((entry) => !entry.active) ?? null; },
    getMatching(_key: string, value: boolean) {
      return entries.filter((entry) => entry.active === value);
    },
    destroy: vi.fn(),
  };
  return {
    scene: { add: { group: () => group } } as unknown as Phaser.Scene,
    entries,
  };
}

/**
 * 新建实例一律 `active = false`。真实调用方（Bullet / Zombie / 特效精灵）都是这样，
 * 而峰值统计只数 active 成员，工厂若返回 active=true 会让预热实例虚计入峰值。
 */
const factory = (): PoolObject => {
  const obj: FakeObject = {
    active: false,
    setActive(value: boolean) { obj.active = value; return obj; },
  };
  return obj as unknown as PoolObject;
};

/**
 * 审计缺口 B：`utils/ObjectPool.ts` 无 `maxSize`，是唯一没有硬上限的显示资源
 * （`2026-09-09-combat-baseline-audit.md` §6.2）。
 *
 * 同一份审计明确要求「先观测峰值再决定上限值」。本轮给通用池补齐观测能力与
 * 可选上限，并由特效/粒子池用首轮样本启用具体上限；其它玩法池仍保持默认不限制。
 */
describe('对象池用量观测', () => {
  it('默认无上限，maxSize 为 null', () => {
    const { scene } = createFakeScene();
    const pool = new ObjectPool<PoolObject>(scene, factory);
    expect(pool.getUsage().maxSize).toBeNull();
  });

  /**
   * 取用后立刻激活，与真实调用方一致（Bullet/Zombie/特效精灵都是 acquire 后马上 spawn）。
   * 连续 acquire 而不激活会一直拿回同一个 dead 对象，那不是任何调用方的实际用法。
   */
  const acquireActive = (pool: ObjectPool<PoolObject>): PoolObject => {
    const obj = pool.acquire();
    obj.setActive(true);
    return obj;
  };

  it('峰值记录同时存活的最大数量', () => {
    const { scene } = createFakeScene();
    const pool = new ObjectPool<PoolObject>(scene, factory);
    const held = [acquireActive(pool), acquireActive(pool), acquireActive(pool)];
    expect(held.length).toBe(3);
    expect(pool.getUsage().peakActive).toBe(3);
  });

  it('回收后峰值不回落', () => {
    // 峰值是高水位线：回落就无法回答「这一局最多同时有多少」。
    const { scene } = createFakeScene();
    const pool = new ObjectPool<PoolObject>(scene, factory);
    const a = acquireActive(pool);
    const b = acquireActive(pool);
    expect(pool.getUsage().peakActive).toBe(2);
    a.setActive(false);
    b.setActive(false);
    expect(pool.getUsage().peakActive).toBe(2);
  });

  it('预热实例不计入峰值', () => {
    // 预热出来的是 dead 实例，把它们算进峰值会让读数虚高，反推的上限也就偏大。
    const { scene } = createFakeScene();
    const pool = new ObjectPool<PoolObject>(scene, factory, 8);
    expect(pool.getUsage().peakActive).toBe(0);
    expect(pool.getUsage().capacity).toBe(8);
  });

  it('未设上限时 capHits 恒为 0', () => {
    const { scene } = createFakeScene();
    const pool = new ObjectPool<PoolObject>(scene, factory);
    for (let i = 0; i < 50; i++) pool.acquire().setActive(true);
    expect(pool.getUsage().capHits).toBe(0);
    expect(pool.getUsage().capacity).toBe(50);
  });
});

describe('对象池可选硬上限', () => {
  it('达到上限后不再新建，容量停在上限', () => {
    const { scene } = createFakeScene();
    const pool = new ObjectPool<PoolObject>(scene, factory, 0, 3);
    for (let i = 0; i < 10; i++) pool.tryAcquire()?.setActive(true);
    expect(pool.getUsage().capacity).toBe(3);
    expect(pool.getUsage().capHits).toBe(7);
  });

  it('超限时拒绝新对象并累加 capHits，不抢占 active 对象', () => {
    const { scene } = createFakeScene();
    const pool = new ObjectPool<PoolObject>(scene, factory, 0, 2);
    const first = pool.tryAcquire();
    expect(first).not.toBeNull();
    if (!first) return;
    first.setActive(true);
    const second = pool.tryAcquire();
    expect(second).not.toBeNull();
    if (!second) return;
    second.setActive(true);
    // 池已满：第三次取用必须失败，旧对象仍由原 Tween/动画/持有方管理。
    expect(pool.tryAcquire()).toBeNull();
    expect(first.active).toBe(true);
    expect(second.active).toBe(true);
    expect(pool.getUsage().capHits).toBe(1);
  });

  it('上限内存在空闲对象时优先复用空闲而不算 capHits', () => {
    const { scene } = createFakeScene();
    const pool = new ObjectPool<PoolObject>(scene, factory, 0, 2);
    const obj = pool.tryAcquire();
    expect(obj).not.toBeNull();
    if (!obj) return;
    obj.setActive(true);
    obj.setActive(false);
    expect(pool.tryAcquire()).toBe(obj);
    expect(pool.getUsage().capHits).toBe(0);
  });

  it('拒绝无效上限与超过上限的预热容量', () => {
    const { scene } = createFakeScene();
    expect(() => new ObjectPool<PoolObject>(scene, factory, 0, 0)).toThrow();
    expect(() => new ObjectPool<PoolObject>(scene, factory, 4, 3)).toThrow();
  });

  it('销毁后容量读数归零且不抛错', () => {
    const { scene } = createFakeScene();
    const pool = new ObjectPool<PoolObject>(scene, factory, 4);
    pool.destroy();
    expect(pool.getUsage().capacity).toBe(0);
  });
});
