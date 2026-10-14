import { describe, expect, it } from 'vitest';
import {
  CORRIDOR_BREACH_X,
  CORRIDOR_CARD_CULL_X,
  CORRIDOR_CARDS,
  CORRIDOR_COLUMN,
  CORRIDOR_ENEMY_CAP,
  CORRIDOR_ITEM_CARD_POOL,
  CORRIDOR_LANE,
  CORRIDOR_MAX_BONUS_PROJECTILES,
  CORRIDOR_PHASES,
  CORRIDOR_PRESETS,
  CORRIDOR_PRESET_IDS,
  CORRIDOR_WEAPON_REWARD_POOL,
  getCorridorHealthScaling,
  isCorridorPresetId,
  isCorridorZombieKind,
} from '../src/config/corridor';
import { ENHANCEMENTS } from '../src/config/enhancements';
import { WEAPONS } from '../src/config/weapons';
import { ZOMBIES, isNormalZombieId, type NormalZombieId } from '../src/config/zombies';
import {
  addCorridorAlly,
  addCorridorBonusProjectile,
  addCorridorCardScore,
  addCorridorDamageStack,
  advanceCorridor,
  createCorridorRun,
  finishCorridor,
  getCorridorSurvivalBonus,
  isCorridorRunning,
  normalizeCorridorRecords,
  resolveCorridorPhase,
  resolveCorridorVolleyBonus,
  updateCorridorRecord,
  type CorridorRecords,
} from '../src/systems/CorridorRules';
import { createInitialState } from '../src/systems/GameState';

describe('通道配置与预设', () => {
  it.each(CORRIDOR_PRESET_IDS)('%s 预设引用真实武器和兼容强化，测试解锁旗不注入编队', (id) => {
    const preset = CORRIDOR_PRESETS[id];
    const loadout: Array<typeof preset.weaponId | 'pistol'> = preset.weaponId === 'pistol'
      ? ['pistol']
      : ['pistol', preset.weaponId];
    const state = createInitialState('corridor', null, preset.weaponId, loadout, preset.characterId);
    // 手枪预设的两格会 normalize 成一格，其余预设保持「手枪+主武器」两格。
    expect(state.player.currentWeaponId).toBe(preset.weaponId);
    expect(state.player.ownedWeapons).toEqual(loadout);
    for (const enhancementId of preset.enhancements) {
      expect(ENHANCEMENTS[enhancementId]?.weaponId).toBe(WEAPONS[preset.weaponId].id);
    }
    expect(isCorridorPresetId('pistol')).toBe(true);
    expect(isCorridorPresetId('constructor')).toBe(false);
  });

  it('通道几何在画布内，突破线严格在玩家柱位左侧', () => {
    expect(CORRIDOR_LANE.item.top).toBe(0);
    expect(CORRIDOR_LANE.ally.bottom).toBe(720);
    expect(CORRIDOR_LANE.item.bottom).toBe(CORRIDOR_LANE.main.top);
    expect(CORRIDOR_LANE.main.bottom).toBe(CORRIDOR_LANE.ally.top);
    expect(CORRIDOR_BREACH_X).toBeLessThan(CORRIDOR_COLUMN.minX);
    expect(CORRIDOR_COLUMN.minX).toBeLessThanOrEqual(CORRIDOR_COLUMN.spawnX);
    expect(CORRIDOR_COLUMN.spawnX).toBeLessThanOrEqual(CORRIDOR_COLUMN.maxX);
    expect(CORRIDOR_CARD_CULL_X).toBeLessThan(0);
    expect(CORRIDOR_ENEMY_CAP).toBeGreaterThan(0);
  });

  it('五类卡片定义有效，弹药类型在武器库内有供给', () => {
    for (const [kind, def] of Object.entries(CORRIDOR_CARDS)) {
      expect(def.kind).toBe(kind);
      expect(def.hp).toBeGreaterThan(0);
      expect(def.driftSpeed).toBeGreaterThan(0);
      expect(def.scoreBonus).toBeGreaterThan(0);
      expect(def.title.length).toBeGreaterThan(0);
      expect(def.subtitle.length).toBeGreaterThan(0);
    }
    for (const weaponId of CORRIDOR_WEAPON_REWARD_POOL) {
      const weapon = WEAPONS[weaponId];
      expect(weapon).toBeDefined();
      expect(weapon.infiniteAmmo).toBe(false);
    }
    for (const kind of CORRIDOR_ITEM_CARD_POOL) {
      expect(kind).not.toBe('ally');
      expect(CORRIDOR_CARDS[kind]).toBeDefined();
    }
  });

  it('阶段表权重和为 1、间隔单调递减、敌人 kinds 全部是普通感染体', () => {
    let lastInterval = Number.POSITIVE_INFINITY;
    let lastFromMs = -1;
    for (const phase of CORRIDOR_PHASES) {
      const total = Object.values(phase.weights).reduce((sum, weight) => sum + weight, 0);
      expect(total).toBeCloseTo(1, 5);
      expect(phase.intervalMs).toBeLessThan(lastInterval);
      expect(phase.fromMs).toBeGreaterThan(lastFromMs);
      expect(phase.batchSize).toBeGreaterThanOrEqual(1);
      lastInterval = phase.intervalMs;
      lastFromMs = phase.fromMs;
      for (const kind of Object.keys(phase.weights)) {
        expect(isCorridorZombieKind(kind)).toBe(true);
        expect(isNormalZombieId(kind as NormalZombieId)).toBe(true);
        // 远程型会朝玩家发射越通道弹道,通道模式禁用(lurker/rotting/oddity 不在表里)。
        const def = ZOMBIES[kind as keyof typeof ZOMBIES] as { ability?: { kind: string } };
        expect(def.ability?.kind ?? null).not.toBe('ranged');
      }
    }
  });

  it('血量缩放封顶 2 倍且早期不缩放', () => {
    expect(getCorridorHealthScaling(0)).toBe(1);
    expect(getCorridorHealthScaling(-5)).toBe(1);
    expect(getCorridorHealthScaling(90_000)).toBe(1);
    expect(getCorridorHealthScaling(180_000)).toBeCloseTo(1.2, 5);
    expect(getCorridorHealthScaling(3_600_000)).toBe(2);
  });
});

describe('通道规则状态机', () => {
  it('创建即 running,advance 只在 running 时推进,非法 delta 不污染', () => {
    const run = createCorridorRun('pistol');
    expect(run.phase).toBe('running');
    expect(isCorridorRunning(run)).toBe(true);
    advanceCorridor(run, 1200);
    expect(run.elapsedMs).toBe(1200);
    for (const delta of [NaN, Infinity, -1, 0]) advanceCorridor(run, delta);
    expect(run.elapsedMs).toBe(1200);
    finishCorridor(run, 'breached');
    expect(isCorridorRunning(run)).toBe(false);
    advanceCorridor(run, 5000);
    expect(run.elapsedMs).toBe(1200);
  });

  it('终态幂等:breached 后死亡改判无效', () => {
    const run = createCorridorRun('shotgun');
    expect(finishCorridor(run, 'breached')).toBe(true);
    expect(finishCorridor(run, 'dead')).toBe(false);
    expect(finishCorridor(run, 'breached')).toBe(false);
    expect(run.phase).toBe('breached');
  });

  it('叠加上限:弹道 3 层、火力 2 层、队友 3 名,终态后一律拒绝', () => {
    const run = createCorridorRun('rifle');
    for (let index = 0; index < CORRIDOR_MAX_BONUS_PROJECTILES; index += 1) {
      expect(addCorridorBonusProjectile(run)).toBe(true);
    }
    expect(addCorridorBonusProjectile(run)).toBe(false);
    for (let index = 0; index < 2; index += 1) {
      expect(addCorridorDamageStack(run)).toBe(true);
    }
    expect(addCorridorDamageStack(run)).toBe(false);
    for (let index = 0; index < 3; index += 1) expect(addCorridorAlly(run)).toBe(true);
    expect(addCorridorAlly(run)).toBe(false);
    finishCorridor(run, 'dead');
    expect(addCorridorBonusProjectile(run)).toBe(false);
    expect(addCorridorCardScore(run, 'ally')).toBe(false);
  });

  it('齐射加成换算:extraBursts + 幂次伤害,终态归零', () => {
    const run = createCorridorRun('pistol');
    expect(resolveCorridorVolleyBonus(run)).toEqual({ extraBursts: 0, damageFactor: 1 });
    addCorridorBonusProjectile(run);
    addCorridorBonusProjectile(run);
    addCorridorDamageStack(run);
    addCorridorDamageStack(run);
    const bonus = resolveCorridorVolleyBonus(run);
    expect(bonus.extraBursts).toBe(2);
    expect(bonus.damageFactor).toBeCloseTo(1.5625, 5);
    finishCorridor(run, 'breached');
    expect(resolveCorridorVolleyBonus(run)).toEqual({ extraBursts: 0, damageFactor: 1 });
    expect(resolveCorridorVolleyBonus(null)).toEqual({ extraBursts: 0, damageFactor: 1 });
  });

  it('卡片分与存活奖励', () => {
    const run = createCorridorRun('pistol');
    addCorridorCardScore(run, 'weapon');
    addCorridorCardScore(run, 'ally');
    expect(run.cardKills).toBe(2);
    expect(run.cardScore).toBe(CORRIDOR_CARDS.weapon.scoreBonus + CORRIDOR_CARDS.ally.scoreBonus);
    advanceCorridor(run, 61_400);
    expect(getCorridorSurvivalBonus(run)).toBe(61 * 2);
  });
});

describe('阶段解析与纪录', () => {
  it('阶段按时间解析,早期归第 0 阶段', () => {
    expect(resolveCorridorPhase(0).index).toBe(0);
    expect(resolveCorridorPhase(29_999).index).toBe(0);
    expect(resolveCorridorPhase(30_000).name).toBe('渗透');
    expect(resolveCorridorPhase(400_000).name).toBe('狂潮');
    expect(resolveCorridorPhase(400_000).index).toBe(CORRIDOR_PHASES.length - 1);
  });

  it('breached 与 dead 都记分,好分不回退,坏存档被过滤', () => {
    const records: CorridorRecords = {};
    const breached = createCorridorRun('pistol');
    advanceCorridor(breached, 90_000);
    expect(updateCorridorRecord(records, 'lane-v1', breached, 5_000)).toBe(true);
    expect(updateCorridorRecord(records, 'lane-v1', breached, 4_999)).toBe(false);
    const faster = createCorridorRun('pistol');
    advanceCorridor(faster, 80_000);
    expect(updateCorridorRecord(records, 'lane-v1', faster, 5_000)).toBe(true);
    const dead = createCorridorRun('shotgun');
    dead.recordEligible = false;
    expect(updateCorridorRecord(records, 'lane-v1', dead, 9_999)).toBe(false);
    expect(normalizeCorridorRecords({
      'lane-v1': { pistol: { score: 2, elapsedMs: 3 }, rifle: { score: 'x', elapsedMs: 1 } },
      constructor: { pistol: { score: 9, elapsedMs: 1 } },
      'hunt-v1': { pistol: { score: 5, elapsedMs: 1 } },
    })).toEqual({ 'lane-v1': { pistol: { score: 2, elapsedMs: 3 } } });
    expect(normalizeCorridorRecords(null)).toEqual({});
  });
});
