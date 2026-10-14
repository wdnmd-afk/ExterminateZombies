import { ENHANCEMENTS } from './enhancements';
import type { EnhancementDef } from './types';

/**
 * 强化流派。
 *
 * 存在理由：卡池里 24+ 张卡在机制上早已自然分成几组（击杀爆炸、标记增伤、弹链追加），
 * 但这层结构对玩家完全不可见——卡面只讲自己那一张的数值，不告诉玩家
 * 「你已经在走爆炸连锁流，这张卡能接上」。缺这层信息时玩家倾向于每次挑当前涨幅最大的一张，
 * 强化被摊平到多把枪上，一局结束也说不出「这局构筑为什么不同」
 * （`2026-09-09-combat-fun-roadmap.md` §1 成功标准与 R2-1）。
 *
 * **流派从 `effects` 推导而不是手工打标**：手工标签在新增卡时必然漏标，
 * 而机制字段是卡真正的行为来源。加一张带 `setKillExplosion` 的新卡会自动进入爆炸连锁流。
 */

export type EnhancementArchetypeId = 'killChain' | 'markHunt' | 'ammoChain';

export interface EnhancementArchetypeDef {
  id: EnhancementArchetypeId;
  /** 流派名，显示在卡面徽标与构筑摘要里。 */
  label: string;
  /** 一句话说明这个流派怎么打。 */
  playstyle: string;
  /** 徽标与摘要用色。 */
  accent: number;
}

export const ENHANCEMENT_ARCHETYPES: readonly EnhancementArchetypeDef[] = [
  {
    id: 'killChain',
    label: '爆炸连锁',
    playstyle: '击杀本身触发爆炸，把密集敌群变成连环引爆',
    accent: 0xff7f4d,
  },
  {
    id: 'markHunt',
    label: '标记猎杀',
    playstyle: '先标记再集火，奖励持续咬住同一个高价值目标',
    accent: 0xffd964,
  },
  {
    id: 'ammoChain',
    label: '弹链爆发',
    playstyle: '固定间隔追加齐射，奖励不松扳机的持续压制',
    accent: 0x7fd4ff,
  },
] as const;

/**
 * 一张卡属于哪些流派。
 *
 * 当前卡池里没有任何一张同时携带两个签名效果（有用例锁定这一点），因此实际返回 0 或 1 个 id。
 * 仍返回数组而不是单值：签名互斥是当前卡池的性质而不是类型层约束，
 * 日后若刻意做一张「连接两条流派」的卡，调用方不需要跟着改签名。
 */
export function resolveCardArchetypes(def: EnhancementDef): EnhancementArchetypeId[] {
  const ids: EnhancementArchetypeId[] = [];
  if (def.effects.setKillExplosion !== undefined) ids.push('killChain');
  if (def.effects.setMarkOnHit !== undefined) ids.push('markHunt');
  if (def.effects.setAmmoChain !== undefined) ids.push('ammoChain');
  return ids;
}

export function getArchetypeDef(id: EnhancementArchetypeId): EnhancementArchetypeDef {
  const def = ENHANCEMENT_ARCHETYPES.find((entry) => entry.id === id);
  if (!def) throw new Error(`未知强化流派：${id}`);
  return def;
}

/** 某个流派在整个卡池里有几张卡。用于校验每个流派都有足够支撑。 */
export function countCardsInArchetype(id: EnhancementArchetypeId): number {
  return Object.values(ENHANCEMENTS)
    .filter((def) => resolveCardArchetypes(def).includes(id))
    .length;
}

/** 玩家当前在某流派上已激活几张卡。 */
export function countActiveInArchetype(
  id: EnhancementArchetypeId,
  activeEnhancements: ReadonlySet<string>,
): number {
  let count = 0;
  for (const enhancementId of activeEnhancements) {
    const def = ENHANCEMENTS[enhancementId];
    if (def && resolveCardArchetypes(def).includes(id)) count += 1;
  }
  return count;
}

/** 一个流派要成立至少需要几张卡（`2026-09-09-combat-fun-roadmap.md` R2-1）。 */
export const ARCHETYPE_MIN_CARDS = 3;
