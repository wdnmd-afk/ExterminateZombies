import { describe, expect, it } from 'vitest';
import { AUDIO_ASSET_KEYS, AUDIO_EVENT_DEFS, MUSIC_DEFS } from '../src/config/audio';
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

  it('爽感反馈使用语义独立事件，后续替换素材不改战斗调用链', () => {
    expect(AUDIO_EVENT_DEFS.critical.priority).toBe(2);
    expect(AUDIO_EVENT_DEFS.execute.priority).toBe(2);
    expect(AUDIO_EVENT_DEFS.pierce.priority).toBe(2);
    expect(AUDIO_EVENT_DEFS.streak.priority).toBe(2);
    expect(AUDIO_EVENT_DEFS.heartbeat.priority).toBe(1);

    expect(AUDIO_EVENT_DEFS.critical.variants).toEqual([AUDIO_ASSET_KEYS.criticalStinger01]);
    expect(AUDIO_EVENT_DEFS.execute.variants).toEqual([AUDIO_ASSET_KEYS.executeStinger01]);
    expect(AUDIO_EVENT_DEFS.pierce.variants).toEqual([AUDIO_ASSET_KEYS.pierceStinger01]);
    expect(AUDIO_EVENT_DEFS.streak.variants).toEqual([AUDIO_ASSET_KEYS.streakStinger01]);
    expect(AUDIO_EVENT_DEFS.heartbeat.variants).toEqual([AUDIO_ASSET_KEYS.heartbeatThump01]);
  });

  it('Boss 战使用独立音乐资源，不复用普通战斗循环', () => {
    expect(MUSIC_DEFS.boss.asset).toBe(AUDIO_ASSET_KEYS.bossMusic);
    expect(MUSIC_DEFS.boss.asset).not.toBe(MUSIC_DEFS.battle.asset);
  });
});
