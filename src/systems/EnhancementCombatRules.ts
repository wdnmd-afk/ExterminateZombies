import type {
  EffectDef,
  ImpactFragmentsDef,
  MarkOnHitDef,
  WeaponDef,
} from '../config/types';

export interface WeaponVolleyPattern {
  burstCount: number;
  pelletsPerBurst: number;
  totalProjectiles: number;
  damageFactor: number;
  ammoChainTriggered: boolean;
}

export interface TargetMarkState {
  expiresAt: number;
  damageFactor: number;
}

export interface ImpactFragmentBlast {
  x: number;
  y: number;
  effect: EffectDef;
}

/**
 * 解析一次击发的齐射结构。弹链只在准确的周期点生效，且不会额外消耗弹匣。
 */
export function resolveWeaponVolley(weapon: WeaponDef, shotNumber: number): WeaponVolleyPattern {
  const baseBurstCount = Math.max(1, Math.round(weapon.burstCount ?? 1));
  const chain = weapon.ammoChain;
  const ammoChainTriggered = Boolean(
    chain
    && Number.isInteger(chain.interval)
    && chain.interval > 0
    && shotNumber > 0
    && shotNumber % chain.interval === 0,
  );
  const bonusBurstCount = ammoChainTriggered
    ? Math.max(0, Math.round(chain?.bonusBurstCount ?? 0))
    : 0;
  const burstCount = baseBurstCount + bonusBurstCount;
  const pelletsPerBurst = Math.max(1, Math.round(weapon.pellets));

  return {
    burstCount,
    pelletsPerBurst,
    totalProjectiles: burstCount * pelletsPerBurst,
    damageFactor: ammoChainTriggered ? Math.max(1, chain?.damageFactor ?? 1) : 1,
    ammoChainTriggered,
  };
}

/** 标记只在过期时间之前提供收益；恰好到期的帧视为失效。 */
export function resolveTargetMarkDamageFactor(mark: TargetMarkState | undefined, now: number): number {
  if (!mark || now >= mark.expiresAt) return 1;
  return Math.max(1, mark.damageFactor);
}

/** 创建与配置对象脱钩的标记状态，防止运行时修改共享强化配置。 */
export function createTargetMark(effect: MarkOnHitDef, now: number): TargetMarkState {
  return {
    expiresAt: now + Math.max(0, effect.duration),
    damageFactor: Math.max(1, effect.damageFactor),
  };
}

/**
 * 子母弹只基于主爆炸生成一层固定环形次级爆破，返回的 EffectDef 不含 lingering，
 * 调用方也不会再次携带碎片配置，因此不存在递归爆破链。
 */
export function createImpactFragmentBlasts(
  x: number,
  y: number,
  baseEffect: EffectDef,
  fragments: ImpactFragmentsDef,
): ImpactFragmentBlast[] {
  const count = Math.max(0, Math.round(fragments.count));
  if (count === 0) return [];
  const offset = Math.max(0, fragments.offset);
  const damage = Math.max(0, baseEffect.damage * fragments.damageFactor);
  const radius = Math.max(1, baseEffect.radius * fragments.radiusFactor);

  return Array.from({ length: count }, (_, index) => {
    const angle = -Math.PI / 2 + Math.PI * 2 * index / count;
    return {
      x: x + Math.cos(angle) * offset,
      y: y + Math.sin(angle) * offset,
      effect: { kind: 'explosion', damage, radius },
    };
  });
}
