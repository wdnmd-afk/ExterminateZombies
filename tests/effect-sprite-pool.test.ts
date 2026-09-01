import { describe, expect, it, vi } from 'vitest';

// EffectSpritePool 只用到混合模式与动画事件常量；Node 测试不能加载完整浏览器设备探测。
vi.mock('phaser', () => ({
  default: {
    BlendModes: { ADD: 1, NORMAL: 0 },
    Animations: { Events: { ANIMATION_COMPLETE: 'animationcomplete' } },
    // ObjectPool 把它当作 group 的 classType 传入，运行时不需要真实实现。
    GameObjects: { GameObject: class {} },
  },
}));

import { EffectSpritePool } from '../src/systems/EffectSpritePool';

/**
 * 复刻 Phaser 的真实行为：group.destroy() 之后 children 变为 undefined，
 * 于是再次 getChildren() 会抛 `Cannot read properties of undefined (reading 'entries')`。
 * 场景 shutdown 重复派发时就会撞上这条路径。
 */
function createSceneStub() {
  const group = {
    children: { entries: [] as unknown[] } as { entries: unknown[] } | undefined,
    getChildren(): unknown[] {
      return (this.children as { entries: unknown[] }).entries;
    },
    getFirstDead: () => null,
    add: vi.fn(),
    destroy: vi.fn(function destroy(this: { children: unknown }) {
      this.children = undefined;
    }),
  };

  const scene = {
    add: {
      group: (_config?: unknown) => group,
      sprite: () => ({ setActive: vi.fn(), setVisible: vi.fn() }),
    },
    tweens: { killTweensOf: vi.fn() },
  };

  return { group, scene };
}

describe('特效精灵池销毁', () => {
  it('重复 destroy 不抛异常，底层 group 只销毁一次', () => {
    const { group, scene } = createSceneStub();
    const pool = new EffectSpritePool(scene as never, 0);

    pool.destroy();
    expect(() => pool.destroy()).not.toThrow();
    expect(group.destroy).toHaveBeenCalledOnce();
  });

  // 真实崩溃路径：SceneManager.stop 先销毁 group，之后才派发 shutdown 事件，
  // 于是 destroy() 的首次调用就撞上已失效的 children。
  it('Phaser 先销毁 group 时，首次 destroy 也不抛异常', () => {
    const { group, scene } = createSceneStub();
    const pool = new EffectSpritePool(scene as never, 0);

    group.children = undefined;

    expect(() => pool.destroy()).not.toThrow();
    expect(group.destroy).not.toHaveBeenCalled();
  });
});

describe('特效精灵归还', () => {
  /**
   * 真实崩溃路径：场景 shutdown 时 Phaser 先销毁精灵（scene/anims 置空），
   * 残留区持有方此后才 release 自己那一份，于是 sprite.stop() 抛
   * "Cannot read properties of undefined (reading 'stop')"。
   */
  it('精灵已被 Phaser 销毁时 release 不抛异常', () => {
    const { scene } = createSceneStub();
    const pool = new EffectSpritePool(scene as never, 0);

    const destroyedSprite = {
      scene: undefined,
      anims: undefined,
      stop: () => { throw new Error('不应触及已销毁精灵'); },
    };

    expect(() => pool.release(destroyedSprite as never)).not.toThrow();
    expect(scene.tweens.killTweensOf).not.toHaveBeenCalled();
  });

  it('精灵可用时 release 正常复位状态', () => {
    const { scene } = createSceneStub();
    const pool = new EffectSpritePool(scene as never, 0);

    const sprite = {
      scene,
      anims: {},
      removeAllListeners: vi.fn(),
      stop: vi.fn(),
      setActive: vi.fn(),
      setVisible: vi.fn(),
      clearTint: vi.fn(),
      setAlpha: vi.fn(),
      setScale: vi.fn(),
      setRotation: vi.fn(),
      setBlendMode: vi.fn(),
    };

    pool.release(sprite as never);

    expect(sprite.stop).toHaveBeenCalledOnce();
    expect(sprite.setActive).toHaveBeenCalledWith(false);
    expect(sprite.setVisible).toHaveBeenCalledWith(false);
  });
});
