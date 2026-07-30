import type { AmmoType } from './types';
import type { WeaponId } from './weapons';

/** 测试完成后只需关闭此开关即可恢复正式初始武器逻辑。 */
export const TESTING_FLAGS = {
  unlockAllWeapons: true,
} as const;

export const TESTING_WEAPON_ORDER: WeaponId[] = [
  'pistol',
  'smg',
  'rifle',
  'shotgun',
  'ak47',
  'barrett',
  'rpg',
  'm79',
];

export const TESTING_AMMO_RESERVE: Record<AmmoType, number> = {
  light: 240,
  heavy: 300,
  shell: 80,
  explosive: 24,
};
