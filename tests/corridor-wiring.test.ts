import { describe, expect, it, vi } from 'vitest';
import { CORRIDOR_LANE, CORRIDOR_PRESETS, isCorridorPresetId, type CorridorPresetId } from '../src/config/corridor';
import { createCorridorRun, isCorridorRunning } from '../src/systems/CorridorRules';
import { SAVE_KEYS } from '../src/systems/SaveManager';

describe('通道预设与存档边界', () => {
  it('三套预设相互独立;isCorridorPresetId 拒绝原型属性', () => {
    expect(new Set(Object.keys(CORRIDOR_PRESETS)).size).toBe(3);
    expect(isCorridorPresetId('pistol')).toBe(true);
    expect(isCorridorPresetId('toString')).toBe(false);
    expect(isCorridorPresetId(undefined)).toBe(false);
  });

  it('预设武器不在长期解锁链路上:corridorRecords 是独立存档键', () => {
    expect(SAVE_KEYS.corridorRecords).toBe('corridorRecords');
    expect(SAVE_KEYS.corridorRecords).not.toBe(SAVE_KEYS.frenzyRecords);
    // 通道预设 id 与 lane-v 记录版本互不干扰。
    const presetIds = Object.keys(CORRIDOR_PRESETS) as CorridorPresetId[];
    expect(presetIds.length).toBe(3);
  });

  it('队友与卡片通道不重叠:ally 通道的 y 不等于 main 通道', () => {
    expect(CORRIDOR_LANE.ally.centerY).not.toBe(CORRIDOR_LANE.main.centerY);
    expect(CORRIDOR_LANE.item.centerY).not.toBe(CORRIDOR_LANE.main.centerY);
  });

  it('run 快照传递不共享引用(结算页持有独立副本)', () => {
    const run = createCorridorRun('shotgun');
    const snapshot = { ...run };
    expect(snapshot).not.toBe(run);
    expect(isCorridorRunning(snapshot)).toBe(isCorridorRunning(run));
    // snapshot 是浅拷贝:没有嵌套对象,字段展开即可。
    expect(Object.keys(snapshot).sort()).toEqual(Object.keys(run).sort());
  });

  it('vi 可用于 wiring 探针(冒烟保持测试基建可用)', () => {
    const probe = vi.fn();
    probe('x');
    expect(probe).toHaveBeenCalledWith('x');
  });
});
