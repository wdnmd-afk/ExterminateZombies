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
  /**
   * 美术检阅波：开启后无尽模式第 1 波改为一次摆出全部 18 类感染体，
   * 每类 8 只（四个朝向各 2 只），钉死在网格里不动、不追人、不攻击。
   *
   * 为什么必须钉死：感染体 AI 每帧把速度改向玩家，`updateFacing` 随即改回动画行，
   * 所以"从四条边各刷 2 只"看不到四个朝向——出生后它们会全部转向玩家。
   * 要目视四方向素材，只能锁朝向并停掉 AI。
   *
   * 第 2 波起恢复正常无尽曲线（已实测 wave2 = walker×3 runner×2 drifter×2），
   * 但检阅波总生命值 36712（含 32 只 Boss），实际清不完也不必清——
   * 看完素材把本开关改回 false 重开一局即可。
   */
  monsterArtReviewWave: false,
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
  'gatling',
  'golden_m249',
  'flamethrower',
  'm16a4',
  'aa12',
  'dual_uzi',
  'tesla',
  'railgun',
  'cryo_sprayer',
];

export const TESTING_AMMO_RESERVE: Record<AmmoType, number> = {
  light: 240,
  heavy: 300,
  shell: 80,
  explosive: 24,
  belt: 300,
  fuel: 180,
  energy: 120,
};
