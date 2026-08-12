import { describe, expect, it } from 'vitest';
import {
  KILL_STREAK_MILESTONES,
  KILL_STREAK_WINDOW,
  advanceKillStreak,
  resolveKillStreakColor,
  resolveKillStreakMilestone,
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
