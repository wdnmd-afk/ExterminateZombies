import type { CharacterId } from './characters';
import type { WeaponId } from './weapons';
import type { ZombieId } from './zombies';

export const FRENZY_VERSION = 'hunt-v1';
export const FRENZY_DURATION_MS = 300_000;
export const FRENZY_ENEMY_CAP = 80;
export const FRENZY_PRESET_IDS = ['shotgun', 'tesla', 'explosive'] as const;
export type FrenzyPresetId = typeof FRENZY_PRESET_IDS[number];
export type FrenzyRewardId = 'ammo' | 'breach' | 'supply';

export interface FrenzyPreset {
  id: FrenzyPresetId;
  name: string;
  description: string;
  characterId: CharacterId;
  weaponId: WeaponId;
  enhancements: readonly string[];
}

export const FRENZY_PRESETS: Record<FrenzyPresetId, FrenzyPreset> = {
  shotgun: {
    id: 'shotgun', name: '霰弹冲阵', description: '近身破阵 · 双倍弹丸 · 扩容弹鼓',
    characterId: 'breacher', weaponId: 'shotgun',
    enhancements: ['shotgun_double_pellets', 'shotgun_drum_mag'],
  },
  tesla: {
    id: 'tesla', name: '电链风暴', description: '连锁清场 · 双弧放电 · 导电标记',
    characterId: 'runner', weaponId: 'tesla',
    enhancements: ['tesla_arc_split', 'tesla_conductive', 'tesla_overcharge'],
  },
  explosive: {
    id: 'explosive', name: '爆破工程', description: '范围轰炸 · 扩大爆域 · 快速装填',
    characterId: 'bastion', weaponId: 'rpg',
    enhancements: ['rpg_wider_explosion', 'rpg_quick_load'],
  },
};

export const FRENZY_REWARDS: Record<FrenzyRewardId, { name: string; description: string; durationMs: number }> = {
  ammo: { name: '弹药狂热', description: '12 秒弹匣免耗', durationMs: 12_000 },
  breach: { name: '破阵强化', description: '15 秒武器伤害 ×1.5', durationMs: 15_000 },
  supply: { name: '突击补给', description: '恢复 35% 生命 · 弹药与地雷', durationMs: 0 },
};

export interface FrenzyTarget {
  id: FrenzyRewardId;
  name: string;
  zombieId: ZombieId;
  x: number;
  y: number;
  healthMultiplier: number;
  guards: readonly ZombieId[];
}

export const FRENZY_TARGETS: readonly FrenzyTarget[] = [
  { id: 'ammo', name: '尸群统领', zombieId: 'bloodied', x: 180, y: 190, healthMultiplier: 8,
    guards: ['walker', 'walker', 'walker', 'walker', 'walker', 'runner'] },
  { id: 'breach', name: '远程压制者', zombieId: 'oddity', x: 1100, y: 190, healthMultiplier: 4,
    guards: ['runner', 'walker', 'runner', 'walker'] },
  { id: 'supply', name: '重装守卫', zombieId: 'tank', x: 640, y: 570, healthMultiplier: 2,
    guards: ['walker', 'walker', 'runner', 'walker'] },
];

export function isFrenzyPresetId(value: unknown): value is FrenzyPresetId {
  return typeof value === 'string' && FRENZY_PRESET_IDS.some((id) => id === value);
}
