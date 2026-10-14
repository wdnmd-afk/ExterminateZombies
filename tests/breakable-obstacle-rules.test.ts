import { describe, expect, it } from 'vitest';
import {
  applyBreakableObstacleDamage,
  resolveBreakableObstacleStage,
  resolveCollapseDamage,
} from '../src/systems/BreakableObstacleRules';

const BASE_STATE = {
  health: 260,
  maxHealth: 260,
  crackedHealthRatio: 0.55,
};

describe('危墙结构规则', () => {
  it('按耐久比例解析完整、裂损与坍塌三态', () => {
    expect(resolveBreakableObstacleStage(BASE_STATE)).toBe('intact');
    expect(resolveBreakableObstacleStage({ ...BASE_STATE, health: 143 })).toBe('cracked');
    expect(resolveBreakableObstacleStage({ ...BASE_STATE, health: 0 })).toBe('collapsed');
  });

  it('跨过裂损阈值时只报告一次 crackedNow', () => {
    const first = applyBreakableObstacleDamage(BASE_STATE, 120);
    expect(first.stage).toBe('cracked');
    expect(first.crackedNow).toBe(true);
    expect(first.collapsedNow).toBe(false);

    const second = applyBreakableObstacleDamage(first, 10);
    expect(second.stage).toBe('cracked');
    expect(second.crackedNow).toBe(false);
  });

  it('坍塌只在首次降到零耐久时报告', () => {
    const collapsed = applyBreakableObstacleDamage(BASE_STATE, 300);
    expect(collapsed.health).toBe(0);
    expect(collapsed.collapsedNow).toBe(true);

    const repeated = applyBreakableObstacleDamage(collapsed, 300);
    expect(repeated.health).toBe(0);
    expect(repeated.damaged).toBe(false);
    expect(repeated.collapsedNow).toBe(false);
  });

  it('非正数与非有限伤害不会改变墙体状态', () => {
    for (const amount of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      const result = applyBreakableObstacleDamage(BASE_STATE, amount);
      expect(result.health).toBe(BASE_STATE.health);
      expect(result.damaged).toBe(false);
      expect(result.stage).toBe('intact');
    }
  });

  it('坍塌对普通感染体结算完整伤害，对 Boss 按配置衰减', () => {
    expect(resolveCollapseDamage(220, false, 0.25)).toBe(220);
    expect(resolveCollapseDamage(220, true, 0.25)).toBe(55);
    expect(resolveCollapseDamage(220, true, 2)).toBe(220);
    expect(resolveCollapseDamage(220, true, -1)).toBe(0);
  });
});
