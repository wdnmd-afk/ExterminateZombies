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
  player: PlayerState;
}

/** 新开一局的初始状态。测试开关开启时配发全部武器与充足弹药。 */
export function createInitialState(mode: GameMode, levelId: string | null): GameState {
  const ownedWeapons = TESTING_FLAGS.unlockAllWeapons ? [...TESTING_WEAPON_ORDER] : ['pistol'] satisfies WeaponId[];
  const ammoInMag = Object.fromEntries(
    ownedWeapons.map((weaponId) => [weaponId, WEAPONS[weaponId].magazineSize]),
  ) as Partial<Record<WeaponId, number>>;
  return {
    mode,
    levelId,
    score: 0,
    waveIndex: 0,
    player: {
      health: 100,
      maxHealth: 100,
      currentWeaponId: 'pistol',
      ownedWeapons,
      ammoInMag,
      // 测试配发不代表正式经济；关闭测试开关后恢复为零备用弹。
      ammoReserve: TESTING_FLAGS.unlockAllWeapons
        ? { ...TESTING_AMMO_RESERVE }
        : { light: 0, heavy: 0, shell: 0, explosive: 0 },
      items: { mine: 3 },
      currentItemId: 'mine',
      activeEnhancements: new Set<string>(),
    },
  };
}
