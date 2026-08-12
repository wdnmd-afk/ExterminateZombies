import { describe, expect, it, vi } from 'vitest';
import { SlowMotionManager } from '../src/systems/SlowMotionManager';

function createSceneStub() {
  return {
    physics: { world: { timeScale: 1 } },
    anims: { globalTimeScale: 1 },
    time: {
      now: 0,
      delayedCall: vi.fn(() => ({ remove: vi.fn() })),
    },
  };
}

describe('慢动作生命周期', () => {
  it('场景关闭时 Arcade World 已销毁也能安全复位动画与内部状态', () => {
    const scene = createSceneStub();
    const manager = new SlowMotionManager(scene as never);
    expect(manager.requestByTier('A', 0)).toBe(true);
    expect(scene.anims.globalTimeScale).toBeLessThan(1);

    (scene.physics as { world: { timeScale: number } | null }).world = null;
    expect(() => manager.reset()).not.toThrow();
    expect(scene.anims.globalTimeScale).toBe(1);
  });
});
