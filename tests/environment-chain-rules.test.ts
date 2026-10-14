import { describe, expect, it } from 'vitest';
import { LEVELS } from '../src/config/levels';
import { ITEMS } from '../src/config/items';
import { P2_VERTICAL_SLICE } from '../src/config/verticalSlice';
import {
  findEnvironmentChainPairs,
  hasEnvironmentChainOpportunity,
} from '../src/config/environmentChain';

describe('环境连锁判定', () => {
  it('判定式与 AreaEffectFactory 一致：A 爆炸半径 + B 碰撞半径', () => {
    const oilBlast = ITEMS.barrel_oil.effect.radius;
    const oilRadius = ITEMS.barrel_oil.radius;
    // 恰好等于阈值时算连锁（与 `distanceSq <= combined * combined` 的闭区间一致）。
    const atThreshold = findEnvironmentChainPairs([
      { type: 'barrel_oil', x: 0, y: 0 },
      { type: 'barrel_oil', x: oilBlast + oilRadius, y: 0 },
    ]);
    expect(atThreshold.length).toBeGreaterThan(0);
    expect(atThreshold[0].threshold).toBe(oilBlast + oilRadius);

    // 超出一像素即不连锁。
    expect(findEnvironmentChainPairs([
      { type: 'barrel_oil', x: 0, y: 0 },
      { type: 'barrel_oil', x: oilBlast + oilRadius + 1, y: 0 },
    ])).toEqual([]);
  });

  it('非 chainable 的场景物不算连锁机会', () => {
    // 粉尘罐 chainable 为 false，且爆炸半径为 0。
    expect(hasEnvironmentChainOpportunity([
      { type: 'dust_canister', x: 0, y: 0 },
      { type: 'dust_canister', x: 10, y: 0 },
    ])).toBe(false);
  });

  it('单个场景物不构成连锁', () => {
    expect(hasEnvironmentChainOpportunity([{ type: 'barrel_oil', x: 0, y: 0 }])).toBe(false);
  });

  it('方向敏感：两个方向各判一次', () => {
    // 面粉桶爆炸半径 100 > 油桶 90，因此存在只有一个方向成立的间距。
    const flourBlast = ITEMS.barrel_flour.effect.radius;
    const oilBlast = ITEMS.barrel_oil.effect.radius;
    expect(flourBlast).toBeGreaterThan(oilBlast);
    const gap = oilBlast + ITEMS.barrel_flour.radius + 1;
    const pairs = findEnvironmentChainPairs([
      { type: 'barrel_oil', x: 0, y: 0 },
      { type: 'barrel_flour', x: gap, y: 0 },
    ]);
    // 面粉桶能炸到油桶，油桶炸不到面粉桶。
    expect(pairs).toHaveLength(1);
    expect(pairs[0].fromIndex).toBe(1);
    expect(pairs[0].toIndex).toBe(0);
  });
});

describe('固定关卡的环境连锁机会', () => {
  it('冻结切片至少提供一次可主动利用的环境连锁', () => {
    const slice = LEVELS.find((level) => level.id === P2_VERTICAL_SLICE.levelId);
    expect(slice).toBeDefined();
    if (!slice) return;
    const pairs = findEnvironmentChainPairs(slice.props);
    expect(pairs.length, '切片缺少环境连锁机会，环境沦为一次性摆设').toBeGreaterThan(0);
  });

  it('每关都摆了 chainable 场景物，为后续按模板补连锁留出基础', () => {
    // 本轮只保证切片有真正的连锁对；其余九关先锁「有可连锁物」这条下界，
    // 具体摆位调整属于 R3 按模板扩展的批次（`2026-09-09-combat-fun-roadmap.md` §6）。
    for (const level of LEVELS) {
      const chainable = level.props.filter((prop) => {
        const def = ITEMS[prop.type as keyof typeof ITEMS];
        return def?.chainable === true;
      });
      expect(chainable.length, `${level.id} 没有任何可连锁场景物`).toBeGreaterThan(0);
    }
  });
});
