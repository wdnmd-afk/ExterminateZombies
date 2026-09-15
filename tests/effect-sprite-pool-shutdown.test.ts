import type Phaser from 'phaser';
import { describe, expect, it, vi } from 'vitest';
import { EffectSpritePool } from '../src/systems/EffectSpritePool';

/**
 * EffectSpritePool 只用到 BlendModes 与动画事件常量；
 * Node 环境不能加载完整 Phaser（会做浏览器设备探测）。
 */
vi.mock('phaser', () => ({
  default: {
    BlendModes: { ADD: 1, NORMAL: 0 },
    Animations: { Events: { ANIMATION_COMPLETE: 'animationcomplete' } },
    GameObjects: { GameObject: class {} },
  },
}));

/**
 * 关停期精灵：Phaser 销毁场景内显示对象后，`anims` 与 `scene` 都会被摘掉。
 * 这正是 `AreaEffectFactory.destroy` → `releaseZoneSprite` → `release` 碰到的状态。
 */
function createShutdownSprite() {
  return {
    scene: undefined,
    anims: undefined,
    removeAllListeners: vi.fn(),
    stop: vi.fn(() => { throw new TypeError("Cannot read properties of undefined (reading 'stop')"); }),
    setActive: vi.fn(),
    setVisible: vi.fn(),
    clearTint: vi.fn(),
    setAlpha: vi.fn(),
    setScale: vi.fn(),
    setRotation: vi.fn(),
    setBlendMode: vi.fn(),
  } as unknown as Phaser.GameObjects.Sprite;
}

/** 活着的精灵：常规回收路径，全部复位调用都应发生。 */
function createLiveSprite(scene: unknown) {
  const calls = { stopped: 0 };
  const sprite = {
    scene,
    anims: { isPlaying: true },
    removeAllListeners: vi.fn(),
    stop: vi.fn(() => { calls.stopped += 1; }),
    setActive: vi.fn(),
    setVisible: vi.fn(),
    clearTint: vi.fn(),
    setAlpha: vi.fn(),
    setScale: vi.fn(),
    setRotation: vi.fn(),
    setBlendMode: vi.fn(),
  };
  return { sprite: sprite as unknown as Phaser.GameObjects.Sprite, calls, raw: sprite };
}

function createSceneStub() {
  const scene = {
    add: {
      group: vi.fn(() => ({
        add: vi.fn(),
        getFirstDead: vi.fn(() => null),
        destroy: vi.fn(),
        children: { entries: [] },
        getMatching: vi.fn(() => []),
      })),
      sprite: vi.fn(() => ({
        setActive: vi.fn(),
        setVisible: vi.fn(),
      })),
    },
    tweens: { killTweensOf: vi.fn() },
    textures: { exists: vi.fn(() => false) },
    anims: { exists: vi.fn(() => false) },
  };
  return scene as unknown as Phaser.Scene;
}

describe('EffectSpritePool 关停期回收', () => {
  /**
   * 回归 `docs/execution/2026-09-01-shutdown-effect-pool-defect.md` 的缺陷族。
   *
   * 实测触发路径（2026-09-14，U-15）：无尽模式留下残留区 → ESC → 返回主页
   * → 从主菜单开另一关。异常会中断 `GameScene.handleShutdown`，
   * 使下一关的 GameScene 永不启动，属硬阻断而非静默报错。
   */
  it('精灵已随场景销毁时 release 不抛异常，也不调用 stop', () => {
    const scene = createSceneStub();
    const pool = new EffectSpritePool(scene, 0);
    const sprite = createShutdownSprite();

    expect(() => pool.release(sprite)).not.toThrow();
    expect(sprite.stop).not.toHaveBeenCalled();
  });

  it('正常存活的精灵仍走完整复位流程', () => {
    const scene = createSceneStub();
    const pool = new EffectSpritePool(scene, 0);
    const { sprite, calls, raw } = createLiveSprite(scene);

    pool.release(sprite);

    expect(calls.stopped).toBe(1);
    expect(raw.setActive).toHaveBeenCalledWith(false);
    expect(raw.setVisible).toHaveBeenCalledWith(false);
    expect(raw.clearTint).toHaveBeenCalled();
  });

  it('anims 缺失但场景还在时跳过 stop，其余复位照做', () => {
    const scene = createSceneStub();
    const pool = new EffectSpritePool(scene, 0);
    const { sprite, raw } = createLiveSprite(scene);
    (sprite as unknown as { anims: undefined }).anims = undefined;

    expect(() => pool.release(sprite)).not.toThrow();
    expect(raw.stop).not.toHaveBeenCalled();
    expect(raw.setActive).toHaveBeenCalledWith(false);
  });
});
