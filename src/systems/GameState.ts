/** 运行时游戏状态。挂在 GameScene 上,HUD 读它渲染。 */

import type { AmmoType } from '../config/types';
import type { MedicineId } from '../config/medicine';
import {
  DEFAULT_CHARACTER_ID,
  getCharacterDef,
  type CharacterId,
  type CharacterPassiveDef,
} from '../config/characters';
import type { WeaponId } from '../config/weapons';
import { WEAPONS } from '../config/weapons';
import {
  MAX_WEAPON_LOADOUT_SIZE,
  normalizeWeaponLoadout,
} from '../config/loadout';
import {
  TESTING_AMMO_RESERVE,
  TESTING_FLAGS,
  TESTING_WEAPON_ORDER,
} from '../config/testing';
import { isDeveloperCheatEnabled } from './DeveloperCheats';

export type GameMode = 'level' | 'endless';

export interface PlayerState {
  characterId: CharacterId;
  moveSpeed: number;
  damageMultiplier: number;
  headshotChance: number;
  characterPassive: {
    kind: CharacterPassiveDef['kind'];
    stationaryMs: number;
    calibrated: boolean;
    lastStandAvailable: boolean;
  };
  health: number;
  maxHealth: number;
  currentWeaponId: WeaponId;
  ownedWeapons: WeaponId[];
  ammoInMag: Partial<Record<WeaponId, number>>;   // 每把枪当前弹匣
  ammoReserve: Record<AmmoType, number>;           // 备用弹按弹药类型
  items: Record<string, number>;                   // 携带道具 id -> 数量
  currentItemId: string | null;
  /** 药品库存：id -> 数量。 */
  medicines: Record<MedicineId, number>;
  /** 正在进行的读条；空闲为 null。 */
  medicineUse: { medicineId: MedicineId; elapsedMs: number; durationMs: number } | null;
  /** 能量饮料持续效果；healCarry 保存未满 1 点的小数余量。 */
  overTimeHeal: {
    remainingMs: number;
    healPerMs: number;
    healCarry: number;
    moveSpeedMultiplier: number;
  } | null;
  /** 无尽模式连杀触发的短时火力过载；暂停/抽卡时由 GameScene 平移截止时间。 */
  endlessOverdrive: {
    multiplier: number;
    expiresAt: number;
    milestone: number;
    label: string;
    color: number;
  } | null;
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
    headshots: number;
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

/** 按出战编队创建本局状态；第一关仍以手枪作为当前武器。 */
export function createInitialState(
  mode: GameMode,
  levelId: string | null,
  requestedStarterWeaponId: WeaponId = 'pistol',
  requestedLoadout: readonly WeaponId[] = [requestedStarterWeaponId, 'pistol'],
  requestedCharacterId: CharacterId = DEFAULT_CHARACTER_ID,
): GameState {
  const character = getCharacterDef(requestedCharacterId);
  const forcedTestLoadout = TESTING_FLAGS.unlockAllWeapons;
  const expandedReserveEnabled = forcedTestLoadout || isDeveloperCheatEnabled();
  const allWeaponIds = Object.keys(WEAPONS) as WeaponId[];
  const ownedWeapons = normalizeWeaponLoadout(
    forcedTestLoadout ? TESTING_WEAPON_ORDER.slice(0, MAX_WEAPON_LOADOUT_SIZE) : requestedLoadout,
    allWeaponIds,
  );
  const starterWeaponId: WeaponId = levelId === 'level_1'
    ? 'pistol'
    : ownedWeapons.includes(requestedStarterWeaponId)
      ? requestedStarterWeaponId
      : ownedWeapons.find((weaponId) => weaponId !== 'pistol') ?? 'pistol';
  const ammoInMag = Object.fromEntries(
    ownedWeapons.map((weaponId) => [weaponId, WEAPONS[weaponId].magazineSize]),
  ) as Partial<Record<WeaponId, number>>;
  const starterReserve = {
    light: 0, heavy: 0, shell: 0, explosive: 0, belt: 0, fuel: 0,
  } satisfies Record<AmmoType, number>;
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
      headshots: 0,
      executions: 0,
      pierceHits: 0,
      oilBarrelsTriggered: 0,
      flourBarrelsTriggered: 0,
      minesTriggered: 0,
      weaponUsageMs: {},
      weaponAvailableMs: {},
      weaponEmptyEvents: {},
      ammoDropsByType: { light: 0, heavy: 0, shell: 0, explosive: 0, belt: 0, fuel: 0 },
      ammoAmountsByType: { light: 0, heavy: 0, shell: 0, explosive: 0, belt: 0, fuel: 0 },
      adaptiveAmmoDrops: 0,
      ammoPityTriggers: 0,
      highStockSuppressions: 0,
      finiteWeaponsUnavailableMs: 0,
    },
    ammoSupply: { lowAmmoMisses: 0 },
    player: {
      characterId: character.id,
      moveSpeed: character.moveSpeed,
      damageMultiplier: character.damageMultiplier,
      headshotChance: character.headshotChance,
      characterPassive: {
        kind: character.passive.kind,
        stationaryMs: 0,
        calibrated: false,
        lastStandAvailable: character.passive.kind === 'lastStand',
      },
      health: character.maxHealth,
      maxHealth: character.maxHealth,
      currentWeaponId: starterWeaponId,
      ownedWeapons,
      ammoInMag,
      // 测试配发使用大额联调库存；正式编队每把枪有满弹匣，仅当前主武器附带一个备用弹匣。
      ammoReserve: expandedReserveEnabled
        ? { ...TESTING_AMMO_RESERVE }
        : starterReserve,
      items: { mine: 3 },
      currentItemId: 'mine',
      medicines: { bandage: 2, medkit: 1, energy_drink: 1 },
      medicineUse: null,
      overTimeHeal: null,
      endlessOverdrive: null,
      activeEnhancements: new Set<string>(),
    },
  };
}
