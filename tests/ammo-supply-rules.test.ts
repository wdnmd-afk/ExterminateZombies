import { describe, expect, it } from 'vitest';
import type { AmmoSupplySnapshot } from '../src/systems/AmmoSupplyRules';
import {
  getAmmoTypeSupplyStates,
  resolveAdaptiveAmmoOpportunity,
} from '../src/systems/AmmoSupplyRules';

function snapshot(overrides: Partial<AmmoSupplySnapshot> = {}): AmmoSupplySnapshot {
  return {
    currentWeaponId: 'pistol',
    ownedWeapons: ['pistol'],
    ammoInMag: { pistol: 7 },
    ammoReserve: { light: 0, heavy: 0, shell: 0, explosive: 0 },
    ...overrides,
  };
}

describe('自适应弹药补给', () => {
  it('只有无限弹手枪时不生成无效补给', () => {
    const result = resolveAdaptiveAmmoOpportunity(snapshot(), 1, 10, () => 0);
    expect(result.ammoType).toBeNull();
    expect(result.amount).toBe(0);
    expect(result.nextLowAmmoMisses).toBe(0);
  });

  it('只持有 SPAS-12 时只会选择霰弹', () => {
    const result = resolveAdaptiveAmmoOpportunity(snapshot({
      currentWeaponId: 'shotgun',
      ownedWeapons: ['shotgun', 'pistol'],
      ammoInMag: { shotgun: 0, pistol: 7 },
    }), 0, 0, () => 0);
    expect(result.ammoType).toBe('shell');
    expect(result.amount).toBe(6);
    expect(result.forced).toBe(true);
  });

  it('多类武器按真实库存计算缺口权重', () => {
    const multiWeaponSnapshot = snapshot({
      currentWeaponId: 'shotgun',
      ownedWeapons: ['shotgun', 'rifle', 'pistol'],
      ammoInMag: { shotgun: 0, rifle: 30, pistol: 7 },
      ammoReserve: { light: 0, heavy: 30, shell: 0, explosive: 0 },
    });
    const states = getAmmoTypeSupplyStates(multiWeaponSnapshot);
    expect(states.find((state) => state.ammoType === 'shell')?.weight).toBeGreaterThan(0);
    expect(states.find((state) => state.ammoType === 'heavy')?.weight).toBe(0);
    expect(resolveAdaptiveAmmoOpportunity(multiWeaponSnapshot, 1, 0, () => 0).ammoType).toBe('shell');
  });

  it('全部有限武器不可用时无视基础概率立即保底', () => {
    const result = resolveAdaptiveAmmoOpportunity(snapshot({
      currentWeaponId: 'smg',
      ownedWeapons: ['smg', 'pistol'],
      ammoInMag: { smg: 0, pistol: 7 },
    }), 0, 0, () => 0.99);
    expect(result.forced).toBe(true);
    expect(result.allFiniteWeaponsUnavailable).toBe(true);
    expect(result.ammoType).toBe('light');
  });

  it('连续 10 次低弹未掉落后第 11 次强制触发', () => {
    const result = resolveAdaptiveAmmoOpportunity(snapshot({
      currentWeaponId: 'shotgun',
      ownedWeapons: ['shotgun', 'pistol'],
      ammoInMag: { shotgun: 1, pistol: 7 },
    }), 0, 10, () => 0.99);
    expect(result.lowStock).toBe(true);
    expect(result.forced).toBe(true);
    expect(result.ammoType).toBe('shell');
    expect(result.nextLowAmmoMisses).toBe(0);
  });

  it('库存达到两弹匣目标时把触发概率压到 30%', () => {
    const result = resolveAdaptiveAmmoOpportunity(snapshot({
      currentWeaponId: 'shotgun',
      ownedWeapons: ['shotgun', 'pistol'],
      ammoInMag: { shotgun: 6, pistol: 7 },
      ammoReserve: { light: 0, heavy: 0, shell: 12, explosive: 0 },
    }), 0.5, 0, () => 0.2);
    expect(result.ammoType).toBeNull();
    expect(result.highStockSuppressed).toBe(true);
  });
});
