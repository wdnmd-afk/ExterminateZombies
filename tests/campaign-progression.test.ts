import type Phaser from 'phaser';
import { describe, expect, it, vi } from 'vitest';
import { LEVELS } from '../src/config/levels';
import { getWaveEnemyEntries } from '../src/config/waveShape';
import { EVENTS, SCENES } from '../src/constants';
import { createInitialState } from '../src/systems/GameState';
import { SAVE_KEYS, SaveManager } from '../src/systems/SaveManager';
import { WaveManager } from '../src/systems/WaveManager';
import { sceneMethod } from './helpers/scene-method';

vi.mock('phaser', () => ({ default: { Math: { Between: (minimum: number) => minimum } } }));

describe('战役排程与解锁业务模拟（非自然战斗试玩）', () => {
  it.each(LEVELS)('$id 挂起回主页保留当前关卡，分页仍可定位', (level) => {
    const suspend = sceneMethod('suspendToMainMenu', { SCENES });
    const context = {
      gameEnded: false, state: {}, mode: 'level', levelId: level.id,
      recordEndlessBest: vi.fn(), scene: { sleep: vi.fn(), run: vi.fn() },
    };
    suspend.call(context);
    expect(context.scene.run).toHaveBeenCalledWith(SCENES.mainMenu, { selectedLevelId: level.id });
    expect(context.scene.sleep.mock.calls).toEqual([[SCENES.hud], []]);
  });

  it.each(['endless', 'frenzy'])('%s 挂起不借用战役页码', (mode) => {
    const suspend = sceneMethod('suspendToMainMenu', { SCENES });
    const context = {
      gameEnded: false, state: {}, mode, levelId: 'level_20',
      recordEndlessBest: vi.fn(), scene: { sleep: vi.fn(), run: vi.fn() },
    };
    suspend.call(context);
    expect(context.scene.run).toHaveBeenCalledWith(SCENES.mainMenu, { selectedLevelId: undefined });
  });

  it.each(LEVELS)('$id 全部生成、不突破并发门禁、奖励等待后只完成一次', (level) => {
    const spawned = new Map<string, number>();
    const cleared: number[] = [];
    let active = 0;
    const complete = vi.fn();
    const manager = new WaveManager({
      scene: { time: { now: 0 } } as Phaser.Scene,
      mode: 'level', levelId: level.id,
      spawnZombie: (type) => {
        const cap = manager.getProgressSnapshot().concurrentCap;
        if (cap !== null) expect(active).toBeLessThan(cap);
        active++;
        spawned.set(type, (spawned.get(type) ?? 0) + 1);
      },
      hasAliveEnemies: () => active > 0,
      getActiveEnemyCount: () => active,
      onWaveStarted: vi.fn(),
      onWaveCleared: (index, wave) => {
        cleared.push(index);
        return Boolean(wave.rewards?.some((reward) => reward.type === 'enhancement'));
      },
      onComplete: complete,
    });
    manager.start(0);
    for (let now = 0; now < 2_000_000 && !complete.mock.calls.length; now += 100) {
      manager.update(now);
      if (now % 700 === 0) active = Math.max(0, active - 1);
      if (manager.getProgressSnapshot().state === 'waiting_reward') {
        const count = [...spawned.values()].reduce((sum, value) => sum + value, 0);
        manager.update(now + 10_000);
        expect([...spawned.values()].reduce((sum, value) => sum + value, 0)).toBe(count);
        manager.continueAfterReward(now);
      }
    }
    manager.update(3_000_000);
    expect(complete).toHaveBeenCalledTimes(1);
    const expected = new Map<string, number>();
    for (const enemy of level.waves.flatMap(getWaveEnemyEntries)) expected.set(enemy.type, (expected.get(enemy.type) ?? 0) + enemy.count);
    if (level.boss) expected.set(level.boss.type, 1);
    expect(spawned).toEqual(expected);
    expect(cleared).toEqual(Array.from({ length: level.waves.length + (level.boss ? 1 : 0) }, (_, index) => index + 1));
  });

  it('真实结算方法逐关解锁至 30，重放不重复写入，最终关没有不存在的下一关', () => {
    const initialUnlocked = SaveManager.load<string[]>(SAVE_KEYS.unlockedLevels, ['level_1']);
    const clear = sceneMethod('handleLevelClear', { LEVELS, SaveManager, SAVE_KEYS, EVENTS, SCENES, SoundManager: { play: vi.fn() } });
    try {
      SaveManager.save(SAVE_KEYS.unlockedLevels, ['level_1']);
      for (const [index, level] of LEVELS.entries()) {
        const start = vi.fn();
        const context = {
          mode: 'level', levelId: level.id, pauseReason: null, gameEnded: false,
          state: createInitialState('level', level.id), medicineManager: { clearOnDeath: vi.fn() },
          destroyMedicineUseProgress: vi.fn(), buildCombatDiagnostics: vi.fn(),
          events: { emit: vi.fn() }, scene: { start }, starterWeaponId: 'pistol',
        };
        clear.call(context);
        clear.call(context);
        expect(start).toHaveBeenCalledTimes(1);
        expect(start.mock.calls[0][1].nextLevelId).toBe(LEVELS[index + 1]?.id ?? null);
        expect(SaveManager.load(SAVE_KEYS.unlockedLevels, [])).toEqual(LEVELS.slice(0, Math.min(30, index + 2)).map((entry) => entry.id));
      }
    } finally {
      SaveManager.save(SAVE_KEYS.unlockedLevels, initialUnlocked);
    }
  });
});
