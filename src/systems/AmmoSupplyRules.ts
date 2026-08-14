import { AMMO_SUPPLY_CONFIG, type AmmoSupplyConfig } from '../config/ammo';
import type { AmmoType } from '../config/types';
import { WEAPONS, type WeaponId } from '../config/weapons';

export interface AmmoSupplySnapshot {
  currentWeaponId: WeaponId;
  ownedWeapons: readonly WeaponId[];
  ammoInMag: Partial<Record<WeaponId, number>>;
  ammoReserve: Record<AmmoType, number>;
}

export interface AmmoTypeSupplyState {
  ammoType: AmmoType;
  currentInventory: number;
  magazineSize: number;
  targetInventory: number;
  deficitRatio: number;
  weight: number;
}

export interface AdaptiveAmmoDecision {
  ammoType: AmmoType | null;
  amount: number;
  forced: boolean;
  highStockSuppressed: boolean;
  lowStock: boolean;
  allFiniteWeaponsUnavailable: boolean;
  nextLowAmmoMisses: number;
}

function getFiniteOwnedWeapons(snapshot: AmmoSupplySnapshot): WeaponId[] {
  return snapshot.ownedWeapons.filter((weaponId) => !WEAPONS[weaponId].infiniteAmmo);
}

export function isWeaponUsable(snapshot: AmmoSupplySnapshot, weaponId: WeaponId): boolean {
  if (!snapshot.ownedWeapons.includes(weaponId)) return false;
  const weapon = WEAPONS[weaponId];
  return Boolean(
    weapon.infiniteAmmo
    || (snapshot.ammoInMag[weaponId] ?? 0) > 0
    || snapshot.ammoReserve[weapon.ammoType] > 0,
  );
}

export function getAmmoTypeSupplyStates(
  snapshot: AmmoSupplySnapshot,
  config: AmmoSupplyConfig = AMMO_SUPPLY_CONFIG,
): AmmoTypeSupplyState[] {
  const finiteWeapons = getFiniteOwnedWeapons(snapshot);
  const ammoTypes = [...new Set(finiteWeapons.map((weaponId) => WEAPONS[weaponId].ammoType))];

  return ammoTypes.map((ammoType) => {
    const matchingWeapons = finiteWeapons.filter((weaponId) => WEAPONS[weaponId].ammoType === ammoType);
    const magazineSize = Math.max(...matchingWeapons.map((weaponId) => WEAPONS[weaponId].magazineSize));
    const currentInventory = snapshot.ammoReserve[ammoType]
      + matchingWeapons.reduce((total, weaponId) => total + (snapshot.ammoInMag[weaponId] ?? 0), 0);
    const targetInventory = magazineSize * config.targetMagazines;
    const deficitRatio = targetInventory > 0
      ? Math.max(0, Math.min(1, 1 - currentInventory / targetInventory))
      : 0;
    const currentWeaponUsesType = !WEAPONS[snapshot.currentWeaponId].infiniteAmmo
      && WEAPONS[snapshot.currentWeaponId].ammoType === ammoType;
    const currentWeaponInventory = (snapshot.ammoInMag[snapshot.currentWeaponId] ?? 0)
      + snapshot.ammoReserve[ammoType];
    const currentWeaponIsLow = currentWeaponUsesType && currentWeaponInventory < magazineSize;

    return {
      ammoType,
      currentInventory,
      magazineSize,
      targetInventory,
      deficitRatio,
      weight: deficitRatio * (currentWeaponIsLow ? config.currentWeaponWeightMultiplier : 1),
    };
  });
}

function chooseWeightedAmmoType(states: AmmoTypeSupplyState[], randomValue: number): AmmoType | null {
  if (states.length === 0) return null;
  const totalWeight = states.reduce((total, state) => total + state.weight, 0);
  if (totalWeight <= 0) {
    const index = Math.min(states.length - 1, Math.floor(Math.max(0, randomValue) * states.length));
    return states[index].ammoType;
  }

  let cursor = Math.max(0, Math.min(0.999999, randomValue)) * totalWeight;
  for (const state of states) {
    if (state.weight <= 0) continue;
    if (cursor < state.weight) return state.ammoType;
    cursor -= state.weight;
  }
  return states[states.length - 1].ammoType;
}

/**
 * 每次调用只解析一次感染体的自适应弹药机会，并固定消费至多两次随机数：
 * 第一次判定是否掉落，第二次只在掉落时选择弹药类型。
 */
export function resolveAdaptiveAmmoOpportunity(
  snapshot: AmmoSupplySnapshot,
  baseChance: number,
  lowAmmoMisses: number,
  random: () => number = Math.random,
  config: AmmoSupplyConfig = AMMO_SUPPLY_CONFIG,
): AdaptiveAmmoDecision {
  const states = getAmmoTypeSupplyStates(snapshot, config);
  if (states.length === 0) {
    return {
      ammoType: null,
      amount: 0,
      forced: false,
      highStockSuppressed: false,
      lowStock: false,
      allFiniteWeaponsUnavailable: false,
      nextLowAmmoMisses: 0,
    };
  }

  const finiteWeapons = getFiniteOwnedWeapons(snapshot);
  const allFiniteWeaponsUnavailable = finiteWeapons.every((weaponId) => !isWeaponUsable(snapshot, weaponId));
  const lowStock = states.every(
    (state) => state.currentInventory < state.magazineSize * config.lowStockMagazines,
  );
  const highStock = states.every((state) => state.currentInventory >= state.targetInventory);
  const forced = allFiniteWeaponsUnavailable || (lowStock && lowAmmoMisses >= config.pityKillCount);
  const chanceMultiplier = lowStock
    ? config.lowStockChanceMultiplier
    : highStock
      ? config.highStockChanceMultiplier
      : 1;
  const shouldDrop = forced || random() < Math.min(1, Math.max(0, baseChance * chanceMultiplier));

  if (!shouldDrop) {
    return {
      ammoType: null,
      amount: 0,
      forced: false,
      highStockSuppressed: highStock,
      lowStock,
      allFiniteWeaponsUnavailable,
      nextLowAmmoMisses: lowStock ? lowAmmoMisses + 1 : 0,
    };
  }

  const ammoType = chooseWeightedAmmoType(states, random());
  return {
    ammoType,
    amount: ammoType ? config.amounts[ammoType] : 0,
    forced,
    highStockSuppressed: false,
    lowStock,
    allFiniteWeaponsUnavailable,
    nextLowAmmoMisses: 0,
  };
}
