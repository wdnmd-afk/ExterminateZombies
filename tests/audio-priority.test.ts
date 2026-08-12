import { describe, expect, it } from 'vitest';
import { AUDIO_EVENT_DEFS } from '../src/config/audio';
import type { AudioEventDef } from '../src/config/audio';

describe('音效优先级配置', () => {
  it('受伤与 Boss 预警为最高优先级，枪声为第二级，UI 为最低级', () => {
    expect(AUDIO_EVENT_DEFS.hurt.priority).toBe(1);
    expect(AUDIO_EVENT_DEFS.bossWave.priority).toBe(1);
    expect(AUDIO_EVENT_DEFS.pistol.priority).toBe(2);
    expect(AUDIO_EVENT_DEFS.smg.priority).toBe(2);
    expect(AUDIO_EVENT_DEFS.uiMove.priority).toBe(4);
  });

  it('所有音效都有合法优先级（未声明项由 SoundManager 按 3 级兼容）', () => {
    for (const definition of Object.values(AUDIO_EVENT_DEFS) as AudioEventDef[]) {
      if (definition.priority !== undefined) {
        expect(definition.priority).toBeGreaterThanOrEqual(1);
        expect(definition.priority).toBeLessThanOrEqual(4);
      }
    }
  });
});
