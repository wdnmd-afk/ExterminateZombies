import type { AmmoType, DropDef } from './types';
import type { WeaponId } from './weapons';

/** 测试覆盖默认全部关闭；需要定向联调时再显式开启。 */
export const TESTING_FLAGS = {
  /** 开启时使用测试武器顺序生成满 5 槽编队；不会突破正式编队容量。 */
  unlockAllWeapons: false,
  /**
   * 强化包掉落率的测试覆盖。非 null 时任意感染体都按此概率掉强化包，
   * 忽略 `zombies.ts` 里的正式概率，用于快速验证抽卡与强化叠加。
   * 正式平衡时改回 null 即可恢复配置表概率，不需要动 24 条掉落表。
   */
  enhancementDropChance: null as number | null,
} as const;

/**
 * 掉落判定实际使用的概率。正式概率仍以 `zombies.ts` 为准，
 * 这里只负责套用测试覆盖，保证覆盖逻辑只有一处、可单测。
 */
export function resolveDropChance(drop: DropDef): number {
  if (drop.type === 'enhancement_pack' && TESTING_FLAGS.enhancementDropChance !== null) {
    return TESTING_FLAGS.enhancementDropChance;
  }
  return drop.chance;
}

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
