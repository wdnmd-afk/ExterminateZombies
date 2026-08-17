import { describe, expect, it, vi } from 'vitest';
import { resumePhysicsAfterPause } from '../src/systems/SceneLifecycleRules';

describe('场景暂停生命周期规则', () => {
  it('Arcade World 已销毁时不会调用 resume 或平移战斗计时', () => {
    const shiftBattleTimers = vi.fn();

    expect(() => resumePhysicsAfterPause(null, 250, 100, shiftBattleTimers)).not.toThrow();
    expect(shiftBattleTimers).not.toHaveBeenCalled();
  });

  it('正常唤醒会恢复物理并平移冻结期间的战斗计时', () => {
    const world = { resume: vi.fn() };
    const shiftBattleTimers = vi.fn();

    expect(resumePhysicsAfterPause(world, 250, 100, shiftBattleTimers)).toBe(true);
    expect(world.resume).toHaveBeenCalledOnce();
    expect(shiftBattleTimers).toHaveBeenCalledWith(150);
  });
});

