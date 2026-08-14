/** 运行时游戏状态。挂在 GameScene 上,HUD 读它渲染。 */

import type { AmmoType } from '../config/types';
import type { WeaponId } from '../config/weapons';
import { WEAPONS } from '../config/weapons';
import {
  TESTING_AMMO_RESERVE,
  TESTING_FLAGS,
  TESTING_WEAPON_ORDER,
} from '../config/testing';

export type GameMode = 'level' | 'endless';

export interface PlayerState {
  health: number;
  maxHealth: number;
  currentWeaponId: WeaponId;
  ownedWeapons: WeaponId[];
  ammoInMag: Partial<Record<WeaponId, number>>;   // 每把枪当前弹匣
  ammoReserve: Record<AmmoType, number>;           // 备用弹按弹药类型
  items: Record<string, number>;                   // 携带道具 id -> 数量
  currentItemId: string | null;
  activeEnhancements: Set<string>; // 存储已激活的 EnhancementDef.id
}

export interface GameState {
  mode: GameMode;
  levelId: string | null;
  score: number;
  waveIndex: number;
  stats: {
    elapsedMs: number;
    kills: number;
    bossDefeated: boolean;
    bestKillStreak: number;
    criticalHits: number;
    executions: number;
    pierceHits: number;
    oilBarrelsTriggered: number;
    flourBarrelsTriggered: number;
    minesTriggered: number;
    weaponUsageMs: Partial<Record<WeaponId, number>>;
    weaponAvailableMs: Partial<Record<WeaponId, number>>;
    weaponEmptyEvents: Partial<Record<WeaponId, number>>;
    ammoDropsByType: Record<AmmoType, number>;
    ammoAmountsByType: Record<AmmoType, number>;
    adaptiveAmmoDrops: number;
    ammoPityTriggers: number;
    highStockSuppressions: number;
    finiteWeaponsUnavailableMs: number;
  };
  ammoSupply: {
    lowAmmoMisses: number;
  };
  player: PlayerState;
}

/** 第一关保留手枪教学；其余模式按已解锁主武器配发，并始终携带保底手枪。 */
export function createInitialState(
  mode: GameMode,
  levelId: string | null,
  requestedStarterWeaponId: WeaponId = 'pistol',
): GameState {
  const starterWeaponId: WeaponId = levelId === 'level_1'
    || !Object.prototype.hasOwnProperty.call(WEAPONS, requestedStarterWeaponId)
    ? 'pistol'
    : requestedStarterWeaponId;
  const ownedWeapons: WeaponId[] = TESTING_FLAGS.unlockAllWeapons
    ? [...TESTING_WEAPON_ORDER]
    : starterWeaponId === 'pistol'
      ? ['pistol']
      : [starterWeaponId, 'pistol'];
  const ammoInMag = Object.fromEntries(
    ownedWeapons.map((weaponId) => [weaponId, WEAPONS[weaponId].magazineSize]),
  ) as Partial<Record<WeaponId, number>>;
  const starterReserve = { light: 0, heavy: 0, shell: 0, explosive: 0 } satisfies Record<AmmoType, number>;
  if (!WEAPONS[starterWeaponId].infiniteAmmo) {
    starterReserve[WEAPONS[starterWeaponId].ammoType] = WEAPONS[starterWeaponId].magazineSize;
  }
  return {
    mode,
    levelId,
    score: 0,
    waveIndex: 0,
    stats: {
      elapsedMs: 0,
      kills: 0,
      bossDefeated: false,
      bestKillStreak: 0,
      criticalHits: 0,
      executions: 0,
      pierceHits: 0,
      oilBarrelsTriggered: 0,
      flourBarrelsTriggered: 0,
      minesTriggered: 0,
      weaponUsageMs: {},
      weaponAvailableMs: {},
      weaponEmptyEvents: {},
      ammoDropsByType: { light: 0, heavy: 0, shell: 0, explosive: 0 },
      ammoAmountsByType: { light: 0, heavy: 0, shell: 0, explosive: 0 },
      adaptiveAmmoDrops: 0,
      ammoPityTriggers: 0,
      highStockSuppressions: 0,
      finiteWeaponsUnavailableMs: 0,
    },
    ammoSupply: { lowAmmoMisses: 0 },
    player: {
      health: 100,
      maxHealth: 100,
      currentWeaponId: starterWeaponId,
      ownedWeapons,
      ammoInMag,
      // 测试配发使用大额联调库存；正式配发只给所选主武器一个备用弹匣。
      ammoReserve: TESTING_FLAGS.unlockAllWeapons
        ? { ...TESTING_AMMO_RESERVE }
        : starterReserve,
      items: { mine: 3 },
      currentItemId: 'mine',
      activeEnhancements: new Set<string>(),
    },
  };
}
