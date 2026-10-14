import { describe, expect, it } from 'vitest';
import {
  KILL_STREAK_MILESTONES,
  KILL_STREAK_WINDOW,
  LEVEL_STREAK_SKILL_REFUNDS,
  advanceKillStreak,
  resolveKillStreakColor,
  resolveKillStreakMilestone,
  resolveLevelStreakRefund,
} from '../src/systems/KillStreakRules';

describe('连杀规则', () => {
  it('窗口内连续击杀累加', () => {
    let streak = advanceKillStreak(0, -Infinity, 1000);
    expect(streak).toBe(1);
    streak = advanceKillStreak(streak, 1000, 2000);
    expect(streak).toBe(2);
    streak = advanceKillStreak(streak, 2000, 3500);
    expect(streak).toBe(3);
  });

  it('超出窗口后归零重新计数', () => {
    const streak = advanceKillStreak(7, 1000, 1000 + KILL_STREAK_WINDOW + 1);
    expect(streak).toBe(1);
  });

  it('恰好落在窗口边界仍然累加', () => {
    expect(advanceKillStreak(4, 1000, 1000 + KILL_STREAK_WINDOW)).toBe(5);
  });

  it('里程碑只在恰好达到时返回一次', () => {
    expect(resolveKillStreakMilestone(4)).toBeNull();
    expect(resolveKillStreakMilestone(5)?.label).toBe('RAMPAGE!');
    expect(resolveKillStreakMilestone(6)).toBeNull();
    expect(resolveKillStreakMilestone(10)?.label).toBe('UNSTOPPABLE!');
    expect(resolveKillStreakMilestone(20)?.label).toBe('GODLIKE!');
    expect(resolveKillStreakMilestone(35)?.label).toBe('EXTERMINATION!');
  });

  it('里程碑按 count 升序排列且档位递进', () => {
    const counts = KILL_STREAK_MILESTONES.map((milestone) => milestone.count);
    expect([...counts].sort((a, b) => a - b)).toEqual(counts);
    // 只有 A/S 档配置慢动作，B 档里程碑仅播报，避免密集击杀把战斗拖成连续慢放。
    expect(KILL_STREAK_MILESTONES[0].tier).toBe('B');
    expect(KILL_STREAK_MILESTONES.at(-1)?.tier).toBe('S');
  });

  it('计数颜色随连杀升温，未达首个里程碑保持中性色', () => {
    const neutral = resolveKillStreakColor(1);
    expect(resolveKillStreakColor(4)).toBe(neutral);
    expect(resolveKillStreakColor(5)).toBe(KILL_STREAK_MILESTONES[0].color);
    expect(resolveKillStreakColor(25)).toBe(KILL_STREAK_MILESTONES[2].color);
    expect(resolveKillStreakColor(999)).toBe(KILL_STREAK_MILESTONES.at(-1)?.color);
  });
});

describe('固定关卡连杀奖励', () => {
  it('奖励门槛与里程碑完全对齐，不引入第三套阈值', () => {
    expect(LEVEL_STREAK_SKILL_REFUNDS.map((tier) => tier.streak))
      .toEqual(KILL_STREAK_MILESTONES.map((milestone) => milestone.count));
  });

  it('只在恰好达到门槛时返回，与里程碑同一判定口径', () => {
    expect(resolveLevelStreakRefund(4)).toBeNull();
    expect(resolveLevelStreakRefund(5)?.refundMs).toBe(800);
    expect(resolveLevelStreakRefund(6)).toBeNull();
    expect(resolveLevelStreakRefund(35)?.refundMs).toBe(3500);
  });

  it('退还量随档位递增，且全部为正数', () => {
    const refunds = LEVEL_STREAK_SKILL_REFUNDS.map((tier) => tier.refundMs);
    expect([...refunds].sort((a, b) => a - b)).toEqual(refunds);
    for (const refund of refunds) expect(refund).toBeGreaterThan(0);
  });

  it('累计退还量不超过最短技能冷却，避免单条连杀链把技能变成无冷却', () => {
    // 角色主动冷却区间为 9000-20000ms（`config/characters.ts`）。
    // 累计退还必须低于最短冷却，否则 35 连杀会让相位疾冲全程可用。
    const total = LEVEL_STREAK_SKILL_REFUNDS.reduce((sum, tier) => sum + tier.refundMs, 0);
    expect(total).toBeLessThan(9000);
  });

  it('每档都有播报文案', () => {
    for (const tier of LEVEL_STREAK_SKILL_REFUNDS) {
      expect(tier.label.trim().length).toBeGreaterThan(0);
    }
  });
});
