import { describe, expect, it } from 'vitest';
import { DEFAULT_KEYBINDS } from '../src/config/keybinds';
import {
  createDefaultWeaponLoadout,
  normalizeWeaponLoadout,
} from '../src/config/loadout';
import {
  DEFAULT_AUDIO_SETTINGS,
  normalizeAudioSettings,
  normalizeAccessibilitySettings,
  DEFAULT_ACCESSIBILITY_SETTINGS,
  normalizeBestWave,
  normalizeKeybinds,
  normalizeUnlockedLevels,
  normalizePreferredStarterWeapon,
  normalizeUnlockedWeapons,
} from '../src/systems/SaveManager';

describe('存档数据归一化', () => {
  it('旧键位只覆盖合法字符串并补齐新增动作', () => {
    const result = normalizeKeybinds({ moveUp: 'UP', fire: 12, reload: '' });
    expect(result.moveUp).toBe('UP');
    expect(result.fire).toBe(DEFAULT_KEYBINDS.fire);
    expect(result.reload).toBe(DEFAULT_KEYBINDS.reload);
  });

  it('已下线的动作不会从旧存档带回来', () => {
    // pause 已改成固定的 ESC 暂停菜单键，不再属于可重绑定动作。
    const result = normalizeKeybinds({ pause: 'P', moveUp: 'UP' });
    expect(Object.keys(result)).not.toContain('pause');
    expect(Object.keys(result).sort()).toEqual(Object.keys(DEFAULT_KEYBINDS).sort());
    expect(result.moveUp).toBe('UP');
  });

  it('关卡列表去重并过滤非字符串值', () => {
    expect(normalizeUnlockedLevels(['level_1', 'level_1', 2, null, 'level_2']))
      .toEqual(['level_1', 'level_2']);
  });

  it('无尽纪录转换为非负整数', () => {
    expect(normalizeBestWave(8.9)).toBe(8);
    expect(normalizeBestWave(-3)).toBe(0);
    expect(normalizeBestWave('9')).toBe(0);
  });

  it('武器许可只保留真实 ID、按配置顺序去重并强制包含手枪', () => {
    expect(normalizeUnlockedWeapons(['shotgun', 'missing', 'shotgun', 3]))
      .toEqual(['pistol', 'shotgun']);
  });

  it('偏好主武器只接受真实武器 ID', () => {
    expect(normalizePreferredStarterWeapon('barrett')).toBe('barrett');
    expect(normalizePreferredStarterWeapon('missing')).toBe('pistol');
  });

  it('出战编队强制手枪首槽、过滤未解锁项并限制为五把', () => {
    const unlocked = ['pistol', 'smg', 'rifle', 'shotgun', 'ak47', 'barrett'] as const;
    expect(normalizeWeaponLoadout(
      ['barrett', 'm79', 'missing', 'pistol', 'smg', 'smg', 'rifle', 'shotgun', 'ak47'],
      unlocked,
    )).toEqual(['pistol', 'barrett', 'smg', 'rifle', 'shotgun']);
  });

  it('旧存档默认编队优先保留原主武器再按许可补位', () => {
    expect(createDefaultWeaponLoadout(
      ['pistol', 'smg', 'rifle', 'shotgun', 'barrett'],
      'barrett',
    )).toEqual(['pistol', 'barrett', 'smg', 'rifle', 'shotgun']);
  });

  it('音量限制在 0 到 1 并补齐默认值', () => {
    expect(normalizeAudioSettings({ masterVolume: 2, effectsVolume: -1 })).toEqual({
      enabled: DEFAULT_AUDIO_SETTINGS.enabled,
      masterVolume: 1,
      effectsVolume: 0,
      musicVolume: DEFAULT_AUDIO_SETTINGS.musicVolume,
    });
  });

  it('辅助设置只接受四档与布尔血液开关', () => {
    expect(normalizeAccessibilitySettings({ shake: 'invalid', flash: 'low', blood: 'yes', slowMotion: 'off' }))
      .toEqual({ ...DEFAULT_ACCESSIBILITY_SETTINGS, flash: 'low', slowMotion: 'off' });
  });
});
