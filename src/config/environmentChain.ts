import { ITEMS } from './items';
import type { ItemDef, PropPlacement } from './types';

/**
 * 环境连锁判定。纯逻辑，便于单测与配置校验共用。
 *
 * 连锁规则必须与 `AreaEffectFactory.explode` 的实际判定一致：
 * A 爆炸后波及 B 的条件是 `distance(A,B) <= A.effect.radius + B.radius`，
 * 即用 A 的爆炸半径加 B 的碰撞半径，而不是两者爆炸半径相加。
 * 这里复刻同一条式子——一旦两处不一致，校验就会放过实际炸不到的摆位。
 *
 * 存在理由：十关都摆了多个爆炸桶，但桶与桶的间距普遍在 250px 以上，
 * 而油桶的连锁触发距离只有 106px。结果是「环境连锁」在固定关卡里
 * 只能靠玩家自己把携带桶放到一起触发，场景桶始终是各自独立的一次性摆设
 * （`2026-09-09-combat-fun-roadmap.md` R2-4 要解决的正是这一点）。
 */

/** 一对可互相引爆的场景物及其间距。 */
export interface EnvironmentChainPair {
  fromIndex: number;
  toIndex: number;
  distance: number;
  /** 触发阈值：`from` 的爆炸半径 + `to` 的碰撞半径。 */
  threshold: number;
}

interface ChainableProp {
  index: number;
  x: number;
  y: number;
  /** 碰撞半径，缺省与 `AreaEffectFactory` 的兜底一致。 */
  radius: number;
  /** 爆炸半径；非爆炸类场景物为 0。 */
  blastRadius: number;
}

/** 默认碰撞半径。与 `AreaEffectFactory` 里的 `prop.def.radius ?? 16` 保持一致。 */
const DEFAULT_PROP_RADIUS = 16;

function toChainableProps(props: readonly PropPlacement[]): ChainableProp[] {
  const result: ChainableProp[] = [];
  props.forEach((placement, index) => {
    const def: ItemDef | undefined = ITEMS[placement.type as keyof typeof ITEMS];
    // 只有 chainable 的场景物才参与：粉尘罐、冷冻罐这类零伤害控场物被引爆没有产出。
    if (!def?.chainable) return;
    result.push({
      index,
      x: placement.x,
      y: placement.y,
      radius: def.radius ?? DEFAULT_PROP_RADIUS,
      blastRadius: def.effect.kind === 'explosion' ? def.effect.radius : 0,
    });
  });
  return result;
}

/**
 * 列出所有可互相引爆的场景物对。
 *
 * 方向敏感：A 能炸到 B 不等于 B 能炸到 A（两者爆炸半径可能不同），
 * 因此两个方向各判一次，只要有一个方向成立就算一次连锁机会。
 */
export function findEnvironmentChainPairs(
  props: readonly PropPlacement[],
): EnvironmentChainPair[] {
  const chainable = toChainableProps(props);
  const pairs: EnvironmentChainPair[] = [];

  for (const from of chainable) {
    if (from.blastRadius <= 0) continue;
    for (const to of chainable) {
      if (from.index === to.index) continue;
      const threshold = from.blastRadius + to.radius;
      const dx = from.x - to.x;
      const dy = from.y - to.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      if (distance <= threshold) {
        pairs.push({ fromIndex: from.index, toIndex: to.index, distance, threshold });
      }
    }
  }

  return pairs;
}

/** 该关卡是否存在至少一次可主动利用的环境连锁机会。 */
export function hasEnvironmentChainOpportunity(props: readonly PropPlacement[]): boolean {
  return findEnvironmentChainPairs(props).length > 0;
}
