import type { AmmoType } from './types';

export interface AmmoSupplyConfig {
  amounts: Record<AmmoType, number>;
  targetMagazines: number;
  lowStockMagazines: number;
  currentWeaponWeightMultiplier: number;
  lowStockChanceMultiplier: number;
  highStockChanceMultiplier: number;
  pityKillCount: number;
}

/**
 * 自适应补给只改变弹药类型与数量，不修改感染体各自的基础触发概率。
 * 数值来自 D-010 首版方案，后续只能依据完整试玩统计调整。
 */
export const AMMO_SUPPLY_CONFIG: AmmoSupplyConfig = {
  amounts: {
    light: 30,
    heavy: 12,
    shell: 6,
    explosive: 2,
    belt: 40,
    fuel: 25,
  },
  targetMagazines: 2,
  lowStockMagazines: 1,
  currentWeaponWeightMultiplier: 1.5,
  lowStockChanceMultiplier: 2,
  highStockChanceMultiplier: 0.3,
  pityKillCount: 10,
};

