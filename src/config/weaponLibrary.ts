import { WEAPONS, type WeaponId } from './weapons';
import type { WeaponDef } from './types';
import { ZOMBIES } from './zombies';

/**
 * 图鉴预览直接复用实机武器贴图。
 *
 * 原始 128×128 素材表单元格把武器名文字和浅灰底烘进了图里，直接取帧会在图鉴中
 * 露出「MP5」「SPAS-12」等标签和白色方块，因此图鉴一律走处理后的透明 PNG。
 * 这样图鉴与战场共用同一套素材，换贴图不需要两处同步，运行时也不必再加载原始素材表。
 */
export interface WeaponLibraryArt {
  weaponId: WeaponId;
  /** 相对贴图原始尺寸的显示缩放，按各自长宽取值以填满预览框且不溢出面板。 */
  scale: number;
}

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
    art: { weaponId: 'pistol', scale: 4.8 },
    availability: { kind: 'initial', weaponId: 'pistol' },
  },
  {
    id: 'mp5',
    name: 'MP5',
    category: '冲锋枪',
    art: { weaponId: 'smg', scale: 1.55 },
    availability: { kind: 'enemyDrop', weaponId: 'smg' },
  },
  {
    id: 'm4a1',
    name: 'M4A1',
    category: '突击步枪',
    art: { weaponId: 'rifle', scale: 2.3 },
    availability: { kind: 'enemyDrop', weaponId: 'rifle' },
  },
  {
    id: 'spas_12',
    name: 'SPAS-12',
    category: '战斗霰弹枪',
    art: { weaponId: 'shotgun', scale: 2.5 },
    availability: { kind: 'enemyDrop', weaponId: 'shotgun' },
  },
  {
    id: 'ak_47',
    name: 'AK-47',
    category: '突击步枪',
    art: { weaponId: 'ak47', scale: 2.9 },
    availability: { kind: 'enemyDrop', weaponId: 'ak47' },
  },
  {
    id: 'barrett_m82',
    name: 'BARRETT M82',
    category: '反器材步枪',
    art: { weaponId: 'barrett', scale: 3 },
    availability: { kind: 'enemyDrop', weaponId: 'barrett' },
  },
  {
    id: 'rpg_7',
    name: 'RPG-7',
    category: '火箭推进榴弹',
    art: { weaponId: 'rpg', scale: 3 },
    availability: { kind: 'enemyDrop', weaponId: 'rpg' },
  },
  {
    id: 'm79',
    name: 'M79',
    category: '单发榴弹发射器',
    art: { weaponId: 'm79', scale: 2.4 },
    availability: { kind: 'enemyDrop', weaponId: 'm79' },
  },
  {
    id: 'gau_8_gatling',
    name: 'GAU-8 GATLING',
    category: '旋转重机枪',
    art: { weaponId: 'gatling', scale: 2.35 },
    availability: { kind: 'enemyDrop', weaponId: 'gatling' },
  },
  {
    id: 'golden_m249',
    name: 'GOLDEN M249',
    category: '黄金轻机枪',
    art: { weaponId: 'golden_m249', scale: 2.35 },
    availability: { kind: 'enemyDrop', weaponId: 'golden_m249' },
  },
  {
    id: 'flamethrower',
    name: 'FLAMETHROWER',
    category: '燃料喷射器',
    art: { weaponId: 'flamethrower', scale: 2.35 },
    availability: { kind: 'enemyDrop', weaponId: 'flamethrower' },
  },
  // 第二批六把与三把重火力同源（程序化侧视图，画幅同为 132x48），因此共用 2.35 倍预览缩放。
  {
    id: 'm16a4',
    name: 'M16A4',
    category: '三连发步枪',
    art: { weaponId: 'm16a4', scale: 2.35 },
    availability: { kind: 'enemyDrop', weaponId: 'm16a4' },
  },
  {
    id: 'aa12',
    name: 'AA-12',
    category: '全自动霰弹枪',
    art: { weaponId: 'aa12', scale: 2.35 },
    availability: { kind: 'enemyDrop', weaponId: 'aa12' },
  },
  {
    id: 'dual_uzi',
    name: 'DUAL UZI',
    category: '双持冲锋枪',
    art: { weaponId: 'dual_uzi', scale: 2.35 },
    availability: { kind: 'enemyDrop', weaponId: 'dual_uzi' },
  },
  {
    id: 'tesla',
    name: 'TESLA COIL',
    category: '链式电磁枪',
    art: { weaponId: 'tesla', scale: 2.35 },
    availability: { kind: 'enemyDrop', weaponId: 'tesla' },
  },
  {
    id: 'railgun',
    name: 'RAILGUN',
    category: '蓄力磁轨炮',
    art: { weaponId: 'railgun', scale: 2.35 },
    availability: { kind: 'enemyDrop', weaponId: 'railgun' },
  },
  {
    id: 'cryo_sprayer',
    name: 'CRYO SPRAYER',
    category: '低温喷射器',
    art: { weaponId: 'cryo_sprayer', scale: 2.35 },
    availability: { kind: 'enemyDrop', weaponId: 'cryo_sprayer' },
  },
];

export function getWeaponDefinition(entry: WeaponLibraryEntry): WeaponDef | null {
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
