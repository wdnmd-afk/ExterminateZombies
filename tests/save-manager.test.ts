import { describe, expect, it } from 'vitest';
import { DEFAULT_KEYBINDS } from '../src/config/keybinds';
import {
  DEFAULT_AUDIO_SETTINGS,
  normalizeAudioSettings,
  normalizeBestWave,
  normalizeKeybinds,
  normalizeUnlockedLevels,
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

  it('音量限制在 0 到 1 并补齐默认值', () => {
    expect(normalizeAudioSettings({ masterVolume: 2, effectsVolume: -1 })).toEqual({
      masterVolume: 1,
      effectsVolume: 0,
      musicVolume: DEFAULT_AUDIO_SETTINGS.musicVolume,
    });
  });
});
