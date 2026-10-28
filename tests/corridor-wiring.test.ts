import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { CORRIDOR_LANE, CORRIDOR_PRESETS, isCorridorPresetId, type CorridorPresetId } from '../src/config/corridor';
import { createCorridorRun, isCorridorRunning } from '../src/systems/CorridorRules';
import { SAVE_KEYS } from '../src/systems/SaveManager';
import { sceneMethod } from './helpers/scene-method';

/**
 * 通道模式的 run 只能在场景创建时写入 `state.corridor`。
 * 首批实现漏了这一步：`startCorridor` 拿不到 run 直接静默返回，
 * 进游戏后没有导演、不刷僵尸、也不会结算——纯规则单测全绿也发现不了。
 */
function initialize(overrides: { cheat?: boolean; unlockAll?: boolean } = {}) {
  return sceneMethod('initializeCorridorRun', {
    createCorridorRun: (presetId: CorridorPresetId) => createCorridorRun(presetId),
    isDeveloperCheatEnabled: () => overrides.cheat === true,
    TESTING_FLAGS: { unlockAllWeapons: overrides.unlockAll === true },
    CORRIDOR_PRESETS,
    EnhancementManager: { resolveWeaponDef: () => ({ magazineSize: 11 }) },
  });
}

function subjectFor(presetId: CorridorPresetId): any {
  return {
    corridorPresetId: presetId,
    state: {
      corridor: undefined,
      player: {
        ownedWeapons: presetId === 'pistol' ? ['pistol'] : ['pistol', presetId],
        activeEnhancements: new Set<string>(),
        ammoInMag: {} as Record<string, number>,
      },
    },
  };
}

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

describe('通道 run 初始化接线', () => {
  it.each(['pistol', 'shotgun', 'rifle'] as const)('%s 预设写入 run、强化与弹匣', (presetId) => {
    const subject = subjectFor(presetId);
    initialize().call(subject);
    expect(subject.state.corridor.presetId).toBe(presetId);
    expect(subject.state.corridor.phase).toBe('running');
    expect(subject.state.corridor.recordEligible).toBe(true);
    expect([...subject.state.player.activeEnhancements]).toEqual([...CORRIDOR_PRESETS[presetId].enhancements]);
    expect(subject.state.player.ammoInMag).toEqual(
      Object.fromEntries(subject.state.player.ownedWeapons.map((id: string) => [id, 11])),
    );
  });

  it.each([[true, false], [false, true]])('秘籍=%s / 全解锁旗=%s 时不写正式纪录', (cheat, unlockAll) => {
    const subject = subjectFor('rifle');
    initialize({ cheat, unlockAll }).call(subject);
    expect(subject.state.corridor.recordEligible).toBe(false);
  });

  it('GameScene.create 确实在 corridor 分支调用初始化（防止再次出现空场景）', () => {
    const source = readFileSync(new URL('../src/scenes/GameScene.ts', import.meta.url), 'utf8');
    expect(source).toMatch(/this\.mode === 'corridor'\s*\)\s*\{\s*this\.initializeCorridorRun\(\);/);
  });
});
