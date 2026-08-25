import { describe, expect, it } from 'vitest';
import {
  ENDLESS_BOSS_ROTATION,
  ENDLESS_WAVE_PATTERN,
  createEndlessWave,
  getEndlessBossId,
  getEndlessWaveKind,
  getEndlessWaveMeta,
} from '../src/config/endless';
import { getWaveEnemyCount, getWaveEnemyEntries, getWaveSegments } from '../src/config/waveShape';
import { isBossZombie } from '../src/config/zombies';
import {
  ENDLESS_OVERDRIVE_TIERS,
  resolveEndlessOverdrive,
} from '../src/systems/EndlessModePolicy';

describe('无尽模式战斗导演', () => {
  it('十波章节节奏固定重复，成长与 Boss 节点可预测', () => {
    expect(ENDLESS_WAVE_PATTERN).toEqual([
      'warmup',
      'assault',
      'supply',
      'swarm',
      'elite',
      'supply',
      'swarm',
      'tactical',
      'climax',
      'boss',
    ]);
    for (let wave = 1; wave <= 30; wave += 1) {
      expect(getEndlessWaveKind(wave)).toBe(ENDLESS_WAVE_PATTERN[(wave - 1) % 10]);
      const meta = getEndlessWaveMeta(wave);
      expect(meta.chapter).toBe(Math.floor((wave - 1) / 10) + 1);
      expect(meta.chapterWave).toBe((wave - 1) % 10 + 1);
    }
  });

  it('Boss 按章节轮换，Boss 波只生成一个章节 Boss 并携带章节奖励', () => {
    expect(ENDLESS_BOSS_ROTATION).toHaveLength(4);
    for (let chapter = 1; chapter <= 8; chapter += 1) {
      expect(getEndlessBossId(chapter)).toBe(ENDLESS_BOSS_ROTATION[(chapter - 1) % 4]);
      const wave = createEndlessWave(chapter * 10);
      const meta = wave.endless;
      expect(meta?.kind).toBe('boss');
      expect(meta?.bossId).toBe(getEndlessBossId(chapter));
      expect(isBossZombie(meta?.bossId ?? '')).toBe(true);
      const bosses = getWaveEnemyEntries(wave).filter((entry) => isBossZombie(entry.type));
      expect(bosses).toEqual([{ type: meta?.bossId, count: 1 }]);
      expect(wave.rewards?.some((reward) => reward.type === 'enhancement')).toBe(true);
      expect(wave.rewards?.some((reward) => reward.type === 'resupply')).toBe(true);
    }
  });

  it('每章第 3、6 波保证强化，第 9 波补给，第 10 波章节结算', () => {
    for (const waveNumber of [3, 6, 13, 16]) {
      const rewards = createEndlessWave(waveNumber).rewards ?? [];
      expect(rewards.filter((reward) => reward.type === 'enhancement')).toHaveLength(1);
      expect(rewards.some((reward) => reward.type === 'resupply')).toBe(true);
    }
    const climaxRewards = createEndlessWave(9).rewards ?? [];
    expect(climaxRewards.some((reward) => reward.type === 'resupply')).toBe(true);
    expect(climaxRewards.some((reward) => reward.type === 'medicine')).toBe(true);
    expect(climaxRewards.some((reward) => reward.type === 'enhancement')).toBe(true);
  });

  it('事件波使用段落与同屏上限，后期不会无限堆高活跃实体', () => {
    for (let waveNumber = 1; waveNumber <= 80; waveNumber += 1) {
      const wave = createEndlessWave(waveNumber);
      expect(getWaveEnemyCount(wave)).toBeGreaterThan(0);
      for (const segment of getWaveSegments(wave)) {
        expect(segment.enemies.length).toBeGreaterThan(0);
        if (segment.concurrentCap !== undefined) {
          expect(segment.concurrentCap).toBeGreaterThan(0);
          expect(segment.concurrentCap).toBeLessThanOrEqual(42);
        }
      }
    }

    expect(getWaveSegments(createEndlessWave(4))).toHaveLength(2);
    expect(getWaveSegments(createEndlessWave(8))).toHaveLength(2);
    expect(getWaveSegments(createEndlessWave(9))).toHaveLength(2);
  });

  it('火力过载只在 10/20/35 连杀触发，档位递增且后档持续更久', () => {
    expect(ENDLESS_OVERDRIVE_TIERS.map((tier) => tier.streak)).toEqual([10, 20, 35]);
    expect(resolveEndlessOverdrive(9)).toBeNull();
    expect(resolveEndlessOverdrive(10)?.multiplier).toBe(1.25);
    expect(resolveEndlessOverdrive(20)?.multiplier).toBe(1.5);
    expect(resolveEndlessOverdrive(35)?.multiplier).toBe(1.8);
    expect(resolveEndlessOverdrive(36)).toBeNull();
    for (let index = 1; index < ENDLESS_OVERDRIVE_TIERS.length; index += 1) {
      expect(ENDLESS_OVERDRIVE_TIERS[index].multiplier)
        .toBeGreaterThan(ENDLESS_OVERDRIVE_TIERS[index - 1].multiplier);
      expect(ENDLESS_OVERDRIVE_TIERS[index].durationMs)
        .toBeGreaterThan(ENDLESS_OVERDRIVE_TIERS[index - 1].durationMs);
    }
  });
});
