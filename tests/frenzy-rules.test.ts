import { describe, expect, it } from 'vitest';
import { FRENZY_DURATION_MS, FRENZY_PRESETS, FRENZY_PRESET_IDS, FRENZY_TARGETS, FRENZY_VERSION, isFrenzyPresetId, type FrenzyRewardId } from '../src/config/frenzy';
import { ENHANCEMENTS } from '../src/config/enhancements';
import { WEAPONS } from '../src/config/weapons';
import { ZOMBIES } from '../src/config/zombies';
import { advanceFrenzy, collectFrenzyReward, createFrenzyRun, defeatFrenzyTarget, finishFrenzy, formatFrenzyTime, frenzyAmmoFree, frenzyDamageMultiplier, getFrenzyScore, normalizeFrenzyRecords, updateFrenzyRecord, type FrenzyRecords } from '../src/systems/FrenzyRules';
import { createInitialState } from '../src/systems/GameState';
import { SAVE_KEYS, SaveManager } from '../src/systems/SaveManager';

function bossRun() {
  const run = createFrenzyRun('shotgun');
  for (const id of ['ammo', 'breach', 'supply'] as const) {
    defeatFrenzyTarget(run, id);
    collectFrenzyReward(run, id);
  }
  return run;
}

describe('狂潮规则与预设', () => {
  it.each(FRENZY_PRESET_IDS)('%s 预设引用真实武器和兼容强化，未解锁也能创建', (id) => {
    const preset = FRENZY_PRESETS[id];
    const state = createInitialState('frenzy', null, preset.weaponId, ['pistol', preset.weaponId], preset.characterId);
    expect(state.player.currentWeaponId).toBe(preset.weaponId);
    expect(state.player.ownedWeapons).toEqual(['pistol', preset.weaponId]);
    for (const enhancementId of preset.enhancements) {
      expect(ENHANCEMENTS[enhancementId]?.weaponId).toBe(WEAPONS[preset.weaponId].id);
    }
  });

  it('目标身份唯一，配置有效且不在中心出生点', () => {
    expect(new Set(FRENZY_TARGETS.map((target) => target.id)).size).toBe(3);
    for (const target of FRENZY_TARGETS) {
      expect(ZOMBIES[target.zombieId]).toBeDefined();
      expect(Math.hypot(target.x - 640, target.y - 360)).toBeGreaterThan(180);
    }
    expect(isFrenzyPresetId('tesla')).toBe(true);
    expect(isFrenzyPresetId('toString')).toBe(false);
  });

  it.each([
    ['ammo', 'breach', 'supply'], ['ammo', 'supply', 'breach'],
    ['breach', 'ammo', 'supply'], ['breach', 'supply', 'ammo'],
    ['supply', 'ammo', 'breach'], ['supply', 'breach', 'ammo'],
  ] as FrenzyRewardId[][])('猎杀顺序 %s → %s → %s 只有三枚拾取后进入首领阶段', (...order) => {
    const run = createFrenzyRun('tesla');
    order.forEach((id, index) => {
      expect(collectFrenzyReward(run, id)).toBe(false);
      expect(defeatFrenzyTarget(run, id)).toBe(true);
      expect(run.phase).toBe('hunting');
      expect(defeatFrenzyTarget(run, id)).toBe(false);
      expect(collectFrenzyReward(run, id)).toBe(true);
      expect(collectFrenzyReward(run, id)).toBe(false);
      expect(run.phase).toBe(index === 2 ? 'boss' : 'hunting');
    });
  });

  it('必须先解锁首领，且只允许一个不可逆终态', () => {
    const run = createFrenzyRun('shotgun');
    expect(finishFrenzy(run, 'won')).toBe(false);
    expect(finishFrenzy(run, 'dead')).toBe(true);
    expect(finishFrenzy(run, 'won')).toBe(false);
    expect(defeatFrenzyTarget(run, 'ammo')).toBe(false);
    expect(collectFrenzyReward(run, 'ammo')).toBe(false);
    advanceFrenzy(run, 1000);
    expect(run.elapsedMs).toBe(0);
  });

  it('暂停与挂起不消耗挑战或奖励时间', () => {
    const run = bossRun();
    advanceFrenzy(run, 60_000, true);
    expect(run.elapsedMs).toBe(0);
    expect(frenzyAmmoFree(run)).toBe(true);
    expect(frenzyDamageMultiplier(run)).toBe(1.5);
    advanceFrenzy(run, 12_000);
    expect(frenzyAmmoFree(run)).toBe(false);
    expect(frenzyDamageMultiplier(run)).toBe(1.5);
    advanceFrenzy(run, 3000);
    expect(frenzyDamageMultiplier(run)).toBe(1);
  });

  it('迟到的大帧直接超时，不补刷时间，不接受超时后的胜利', () => {
    const run = bossRun();
    advanceFrenzy(run, FRENZY_DURATION_MS + 8000);
    expect(run.phase).toBe('timeout');
    expect(run.elapsedMs).toBe(FRENZY_DURATION_MS);
    expect(finishFrenzy(run, 'won')).toBe(false);
    expect(run.ammoUntilMs).toBe(0);
  });

  it('期限前致死锁胜利，后续死亡动画时间不改判', () => {
    const run = bossRun();
    advanceFrenzy(run, FRENZY_DURATION_MS - 1);
    expect(finishFrenzy(run, 'won')).toBe(true);
    advanceFrenzy(run, 5000);
    expect(finishFrenzy(run, 'timeout')).toBe(false);
    expect(finishFrenzy(run, 'dead')).toBe(false);
    expect(run.elapsedMs).toBe(FRENZY_DURATION_MS - 1);
  });

  it('重开状态全新，旧局奖励和目标不会串入', () => {
    const old = bossRun();
    finishFrenzy(old, 'dead');
    const fresh = createFrenzyRun('explosive');
    expect(fresh.phase).toBe('hunting');
    expect(frenzyAmmoFree(old)).toBe(false);
    expect(fresh.targets).toEqual({ ammo: 'alive', breach: 'alive', supply: 'alive' });
    expect(fresh.ammoUntilMs).toBe(0);
  });

  it('非法 delta 不污染时间，显示使用向上取整的剩余秒', () => {
    const run = bossRun();
    for (const delta of [NaN, Infinity, -1]) advanceFrenzy(run, delta);
    expect(run.elapsedMs).toBe(0);
    expect(formatFrenzyTime(299001)).toBe('05:00');
    expect(formatFrenzyTime(1)).toBe('00:01');
    expect(formatFrenzyTime(-10)).toBe('00:00');
  });

  it('击杀/连杀加分封顶，通关和节省时间占主要分数', () => {
    const run = bossRun();
    run.kills = 100000;
    run.bestStreak = 100000;
    advanceFrenzy(run, 100_000);
    expect(getFrenzyScore(run).total).toBe(8000);
    finishFrenzy(run, 'won');
    expect(getFrenzyScore(run)).toEqual({ objectives: 6000, completion: 10000, time: 20000, combat: 2000, total: 38000 });
  });
});

describe('狂潮纪录隔离', () => {
  it('只保存正式胜利，失败、调试与重复结算不覆盖', () => {
    const records: FrenzyRecords = {};
    const run = bossRun();
    expect(updateFrenzyRecord(records, FRENZY_VERSION, run)).toBe(false);
    advanceFrenzy(run, 120_000);
    finishFrenzy(run, 'won');
    run.recordEligible = false;
    expect(updateFrenzyRecord(records, FRENZY_VERSION, run)).toBe(false);
    run.recordEligible = true;
    expect(updateFrenzyRecord(records, FRENZY_VERSION, run)).toBe(true);
    expect(updateFrenzyRecord(records, FRENZY_VERSION, run)).toBe(false);
    expect(records[FRENZY_VERSION]?.tesla).toBeUndefined();
    expect(records['hunt-v2']).toBeUndefined();
  });

  it('坏存档过滤，不猜字段，不接受原型属性和非法时间', () => {
    expect(normalizeFrenzyRecords({
      'hunt-v1': { shotgun: { score: 20000, elapsedMs: 1000 }, tesla: { score: '20000', elapsedMs: 2 }, explosive: { score: 20000, elapsedMs: 300000 } },
      constructor: { shotgun: { score: 30000, elapsedMs: 1 } },
    })).toEqual({ 'hunt-v1': { shotgun: { score: 20000, elapsedMs: 1000 } } });
    expect(normalizeFrenzyRecords(null)).toEqual({});
  });

  it('写狂潮纪录不改编队、许可、角色、无尽与关卡进度，清档包含新纪录', () => {
    SaveManager.resetAll('level_1');
    SaveManager.save(SAVE_KEYS.endlessBestWave, 17);
    const before = {
      weapons: SaveManager.getUnlockedWeapons(), loadout: SaveManager.getWeaponLoadout(),
      character: SaveManager.getPreferredCharacterId(), levels: SaveManager.load(SAVE_KEYS.unlockedLevels, []),
    };
    SaveManager.save(SAVE_KEYS.frenzyRecords, { 'hunt-v1': { shotgun: { score: 30000, elapsedMs: 120000 } } });
    expect(SaveManager.getUnlockedWeapons()).toEqual(before.weapons);
    expect(SaveManager.getWeaponLoadout()).toEqual(before.loadout);
    expect(SaveManager.getPreferredCharacterId()).toBe(before.character);
    expect(SaveManager.load(SAVE_KEYS.unlockedLevels, [])).toEqual(before.levels);
    expect(SaveManager.load(SAVE_KEYS.endlessBestWave, 0)).toBe(17);
    expect(SaveManager.load<FrenzyRecords>(SAVE_KEYS.frenzyRecords, {})['hunt-v1']?.shotgun?.score).toBe(30000);
    SaveManager.resetProgress('level_1');
    expect(SaveManager.load(SAVE_KEYS.frenzyRecords, {})).toEqual({});
    SaveManager.save(SAVE_KEYS.frenzyRecords, { 'hunt-v1': { tesla: { score: 30000, elapsedMs: 120000 } } });
    SaveManager.resetAll('level_1');
    expect(SaveManager.load(SAVE_KEYS.frenzyRecords, {})).toEqual({});
  });
});
