import { WEAPONS, type WeaponId } from './weapons';
import { ZOMBIES } from './zombies';

export const WEAPON_TEXTURE_KEYS = {
  guns: 'weapon-guns-128',
  desertEagle: 'weapon-desert-eagle-source',
} as const;

interface WeaponFrameArt {
  kind: 'frame';
  textureKey: typeof WEAPON_TEXTURE_KEYS.guns;
  frame: number;
  scale: number;
}

interface WeaponCropArt {
  kind: 'crop';
  textureKey: typeof WEAPON_TEXTURE_KEYS.desertEagle;
  crop: { x: number; y: number; width: number; height: number };
  scale: number;
}

export type WeaponLibraryArt = WeaponFrameArt | WeaponCropArt;

export type WeaponLibraryAvailability =
  | { kind: 'initial'; weaponId: WeaponId }
  | { kind: 'enemyDrop'; weaponId: WeaponId }
  | { kind: 'unavailable' };

export interface WeaponLibraryEntry {
  id: string;
  name: string;
  category: string;
  art: WeaponLibraryArt;
  availability: WeaponLibraryAvailability;
}

export interface WeaponAcquisitionInfo {
  label: string;
  lines: string[];
}

export const WEAPON_LIBRARY: WeaponLibraryEntry[] = [
  {
    id: 'desert_eagle',
    name: 'DESERT EAGLE',
    category: '大口径手枪',
    art: {
      kind: 'crop',
      textureKey: WEAPON_TEXTURE_KEYS.desertEagle,
      // 原图右上角是独立的沙漠之鹰侧视图，保留少量透明边距用于整数倍放大。
      crop: { x: 62, y: 2, width: 36, height: 28 },
      scale: 4,
    },
    availability: { kind: 'initial', weaponId: 'pistol' },
  },
  {
    id: 'mp5',
    name: 'MP5',
    category: '冲锋枪',
    art: { kind: 'frame', textureKey: WEAPON_TEXTURE_KEYS.guns, frame: 9, scale: 1 },
    availability: { kind: 'enemyDrop', weaponId: 'smg' },
  },
  {
    id: 'm4a1',
    name: 'M4A1',
    category: '突击步枪',
    art: { kind: 'frame', textureKey: WEAPON_TEXTURE_KEYS.guns, frame: 15, scale: 1 },
    availability: { kind: 'enemyDrop', weaponId: 'rifle' },
  },
  {
    id: 'spas_12',
    name: 'SPAS-12',
    category: '战斗霰弹枪',
    art: { kind: 'frame', textureKey: WEAPON_TEXTURE_KEYS.guns, frame: 8, scale: 1 },
    availability: { kind: 'enemyDrop', weaponId: 'shotgun' },
  },
  {
    id: 'ak_47',
    name: 'AK-47',
    category: '突击步枪',
    art: { kind: 'frame', textureKey: WEAPON_TEXTURE_KEYS.guns, frame: 16, scale: 1 },
    availability: { kind: 'unavailable' },
  },
  {
    id: 'barrett_m82',
    name: 'BARRETT M82',
    category: '反器材步枪',
    art: { kind: 'frame', textureKey: WEAPON_TEXTURE_KEYS.guns, frame: 22, scale: 1 },
    availability: { kind: 'unavailable' },
  },
  {
    id: 'rpg_7',
    name: 'RPG-7',
    category: '火箭推进榴弹',
    art: { kind: 'frame', textureKey: WEAPON_TEXTURE_KEYS.guns, frame: 23, scale: 1 },
    availability: { kind: 'unavailable' },
  },
  {
    id: 'm79',
    name: 'M79',
    category: '单发榴弹发射器',
    art: { kind: 'frame', textureKey: WEAPON_TEXTURE_KEYS.guns, frame: 24, scale: 1 },
    availability: { kind: 'unavailable' },
  },
];

export function getWeaponDefinition(entry: WeaponLibraryEntry) {
  if (entry.availability.kind === 'unavailable') return null;
  return WEAPONS[entry.availability.weaponId];
}

/**
 * 获取方式从实际僵尸掉落表生成，避免 UI 复制概率后与玩法配置发生漂移。
 */
export function getWeaponAcquisition(entry: WeaponLibraryEntry): WeaponAcquisitionInfo {
  if (entry.availability.kind === 'initial') {
    return {
      label: '初始配发',
      lines: ['进入任意关卡或无尽模式时自动携带', '无需敌人掉落'],
    };
  }

  if (entry.availability.kind === 'unavailable') {
    return {
      label: '未开放',
      lines: ['当前版本不可获得', '尚未接入武器配置与敌人掉落表'],
    };
  }

  const weaponId = entry.availability.weaponId;
  const sources = Object.values(ZOMBIES).flatMap((zombie) => zombie.drops
    .filter((drop) => drop.type === 'weapon' && drop.itemId === weaponId)
    .map((drop) => `${zombie.name} · ${Math.round(drop.chance * 100)}% 概率掉落`));

  return {
    label: sources.length > 0 ? '战场掉落' : '暂无来源',
    lines: sources.length > 0 ? sources : ['当前掉落表中没有该武器来源'],
  };
}
