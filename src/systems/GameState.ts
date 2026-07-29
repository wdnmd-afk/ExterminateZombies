/** 运行时游戏状态。挂在 GameScene 上,HUD 读它渲染。 */

import type { AmmoType } from '../config/types';
import type { WeaponId } from '../config/weapons';
import { WEAPONS } from '../config/weapons';

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
}

export interface GameState {
  mode: GameMode;
  levelId: string | null;
  score: number;
  waveIndex: number;
  player: PlayerState;
}

/** 新开一局的初始状态。玩家初始只有手枪,带几颗地雷。 */
export function createInitialState(mode: GameMode, levelId: string | null): GameState {
  return {
    mode,
    levelId,
    score: 0,
    waveIndex: 0,
    player: {
      health: 100,
      maxHealth: 100,
      currentWeaponId: 'pistol',
      ownedWeapons: ['pistol'],
      ammoInMag: { pistol: WEAPONS.pistol.magazineSize },
      // 手枪无限弹药(见 weapons.ts infiniteAmmo),备用弹只服务重型武器,全靠拾取。
      ammoReserve: { light: 0, heavy: 0, shell: 0 },
      items: { mine: 3 },
      currentItemId: 'mine',
    },
  };
}
