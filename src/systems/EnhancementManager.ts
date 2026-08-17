import { ENHANCEMENTS } from '../config/enhancements';
import type {
  AmmoChainDef,
  EnhancementDef,
  LingerDef,
  MarkOnHitDef,
  WeaponDef,
} from '../config/types';
import { WEAPONS, type WeaponId } from '../config/weapons';
import { shuffled } from '../utils/math';

const DRAW_COUNT = 4; // 每次抽几张卡

/** 数值对比里判定「有变化」的容差，避免浮点噪声刷出无意义的对比行。 */
const EPSILON = 1e-6;

/**
 * 一把武器上全部已激活强化累加后的净修正量。
 *
 * 先累加成净值再一次性套用，是为了让解析结果与拾取顺序无关：
 * 单遍循环时「先独头弹后双倍火力」和「先双倍火力后独头弹」会算出两把不同的枪。
 */
interface StackedModifiers {
  damageFactor: number;
  fireRateFactor: number;
  reloadTimeFactor: number;
  pelletsFactor: number;
  spreadFactor: number;
  magazineFactor: number;
  addSpread: number;
  addPenetration: number;
  addExplosionRadius: number;
  explosionDamageFactor: number;
  /** 改造类效果；undefined 表示没有任何卡改造过该项。 */
  auto?: boolean;
  pellets?: number;
  penetration?: number;
  lingering?: LingerDef;
  burstCount?: number;
  ammoChain?: AmmoChainDef;
  markOnHit?: MarkOnHitDef;
}

/** 卡面上的一条「当前值 → 强化后」对比。 */
export interface EnhancementStatDelta {
  label: string;
  before: string;
  after: string;
  trend: 'up' | 'down';
}

interface StatSpec {
  label: string;
  /** 返回 undefined 表示该武器没有这项数值，例如非爆炸武器的爆炸伤害。 */
  read: (def: WeaponDef) => number | undefined;
  format: (value: number) => string;
  higherIsBetter: boolean;
}

function formatAmount(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

/** 卡面对比行的取值与格式。顺序即卡面自上而下的显示顺序。 */
const STAT_SPECS: StatSpec[] = [
  { label: '伤害', read: (def) => def.damage, format: formatAmount, higherIsBetter: true },
  {
    label: '射速',
    // 配置里存的是击发间隔(毫秒)。卡面换算成「发/分」，数字变大即变强，
    // 免得玩家看到 300 → 240 还得自己反过来理解。
    read: (def) => (def.fireRate > 0 ? 60000 / def.fireRate : undefined),
    format: (value) => String(Math.round(value)),
    higherIsBetter: true,
  },
  {
    label: '总弹丸',
    read: (def) => def.pellets * (def.burstCount ?? 1),
    format: formatAmount,
    higherIsBetter: true,
  },
  { label: '穿透', read: (def) => def.penetration, format: formatAmount, higherIsBetter: true },
  {
    label: '散射',
    read: (def) => def.spread,
    format: (value) => `${formatAmount(value)}°`,
    higherIsBetter: false,
  },
  { label: '弹匣', read: (def) => def.magazineSize, format: formatAmount, higherIsBetter: true },
  {
    label: '换弹',
    read: (def) => def.reloadTime / 1000,
    format: (value) => `${value.toFixed(2)}s`,
    higherIsBetter: false,
  },
  {
    label: '爆炸伤害',
    read: (def) => def.impactEffect?.damage,
    format: formatAmount,
    higherIsBetter: true,
  },
  {
    label: '爆炸半径',
    read: (def) => def.impactEffect?.radius,
    format: (value) => String(Math.round(value)),
    higherIsBetter: true,
  },
];

/**
 * 武器增强的抽卡与结算入口。
 *
 * `drawEnhancements` 从总卡池里为玩家当前状态抽取选项；
 * `resolveWeaponDef` 把已激活增强折算成实际生效的武器定义。
 * 解析结果必须由所有读取武器数值的地方共用（开火、换弹、HUD），
 * 否则 HUD 会继续显示未强化的基础数值。
 */
export class EnhancementManager {
  /**
   * @param ownedWeapons 玩家当前拥有的武器ID列表
   * @param activeEnhancements 玩家已激活的增强ID集合
   * @returns 最多 DRAW_COUNT 张未持有的增强选项
   *
   * 同一武器的多张卡允许同时出现：它们会叠加，不存在互斥组。
   */
  public static drawEnhancements(
    ownedWeapons: readonly WeaponId[],
    activeEnhancements: ReadonlySet<string>,
  ): EnhancementDef[] {
    const availablePool = Object.values(ENHANCEMENTS).filter(
      (enhancement) => ownedWeapons.includes(enhancement.weaponId as WeaponId)
        && !activeEnhancements.has(enhancement.id),
    );

    return shuffled(availablePool).slice(0, DRAW_COUNT);
  }

  /**
   * 把已激活增强折算到武器定义上，返回可直接使用的副本。
   * 不修改 WEAPONS：`impactEffect` 在基础配置里是共享对象，必须先克隆再改，
   * 否则一次爆炸半径强化会永久污染全局配置并跨局残留。
   */
  public static resolveWeaponDef(
    weaponId: WeaponId,
    activeEnhancements: ReadonlySet<string>,
  ): WeaponDef {
    return applyModifiers(weaponId, collectModifiers(weaponId, activeEnhancements));
  }

  /** 该武器已激活的强化层数，用于卡面显示叠加进度。 */
  public static countActiveForWeapon(
    weaponId: string,
    activeEnhancements: ReadonlySet<string>,
  ): number {
    let count = 0;
    for (const id of activeEnhancements) {
      if (ENHANCEMENTS[id]?.weaponId === weaponId) count += 1;
    }
    return count;
  }

  /**
   * 卡面数值预览：对比「当前已强化状态」与「再拿下这张卡之后」。
   * 强化会叠加，所以基准必须是玩家现在的实际数值，而不是武器基础值——
   * 否则第二张同武器的卡会显示成和第一张一样的涨幅。
   */
  public static previewEnhancement(
    candidate: EnhancementDef,
    activeEnhancements: ReadonlySet<string>,
  ): EnhancementStatDelta[] {
    const weaponId = candidate.weaponId as WeaponId;
    if (!(weaponId in WEAPONS)) return [];

    const before = EnhancementManager.resolveWeaponDef(weaponId, activeEnhancements);
    const after = EnhancementManager.resolveWeaponDef(
      weaponId,
      new Set([...activeEnhancements, candidate.id]),
    );

    const deltas: EnhancementStatDelta[] = [];
    for (const spec of STAT_SPECS) {
      const previous = spec.read(before);
      const next = spec.read(after);
      if (previous === undefined || next === undefined) continue;
      if (Math.abs(next - previous) <= EPSILON) continue;
      deltas.push({
        label: spec.label,
        before: spec.format(previous),
        after: spec.format(next),
        trend: (next > previous) === spec.higherIsBetter ? 'up' : 'down',
      });
    }

    const beforeTotalDamage = before.damage * before.pellets * (before.burstCount ?? 1);
    const afterTotalDamage = after.damage * after.pellets * (after.burstCount ?? 1);
    const projectileShapeChanged = before.pellets !== after.pellets
      || (before.burstCount ?? 1) !== (after.burstCount ?? 1);
    if (projectileShapeChanged && Math.abs(afterTotalDamage - beforeTotalDamage) > EPSILON) {
      deltas.push({
        label: '单次总伤',
        before: formatAmount(beforeTotalDamage),
        after: formatAmount(afterTotalDamage),
        trend: afterTotalDamage > beforeTotalDamage ? 'up' : 'down',
      });
    }

    if (before.auto !== after.auto) {
      deltas.push({
        label: '射击模式',
        before: before.auto ? '全自动' : '单发',
        after: after.auto ? '全自动' : '单发',
        trend: after.auto ? 'up' : 'down',
      });
    }

    const beforeBurstCount = before.burstCount ?? 1;
    const afterBurstCount = after.burstCount ?? 1;
    if (beforeBurstCount !== afterBurstCount) {
      deltas.push({
        label: '齐射组',
        before: String(beforeBurstCount),
        after: String(afterBurstCount),
        trend: afterBurstCount > beforeBurstCount ? 'up' : 'down',
      });
    }

    if (!before.ammoChain && after.ammoChain) {
      deltas.push({
        label: '弹链',
        before: '无',
        after: `每 ${after.ammoChain.interval} 发`,
        trend: 'up',
      });
    }

    if (!before.markOnHit && after.markOnHit) {
      deltas.push({
        label: '连锁标记',
        before: '无',
        after: `${(after.markOnHit.duration / 1000).toFixed(1)}s / ×${formatAmount(after.markOnHit.damageFactor)}`,
        trend: 'up',
      });
    }

    // 残留区只有「从无到有」一种变化，卡池里没有移除残留的卡。
    const addedLingering = after.impactEffect?.lingering;
    if (!before.impactEffect?.lingering && addedLingering) {
      deltas.push({
        label: '弹着残留',
        before: '无',
        after: addedLingering.kind === 'fire' ? '燃烧区' : '粉尘区',
        trend: 'up',
      });
    }

    return deltas;
  }
}

/** 累加某把武器上全部已激活强化的修正量。 */
function collectModifiers(
  weaponId: WeaponId,
  activeEnhancements: ReadonlySet<string>,
): StackedModifiers {
  const stacked: StackedModifiers = {
    damageFactor: 1,
    fireRateFactor: 1,
    reloadTimeFactor: 1,
    pelletsFactor: 1,
    spreadFactor: 1,
    magazineFactor: 1,
    addSpread: 0,
    addPenetration: 0,
    addExplosionRadius: 0,
    explosionDamageFactor: 1,
  };

  for (const id of activeEnhancements) {
    const enhancement = ENHANCEMENTS[id];
    if (!enhancement || enhancement.weaponId !== weaponId) continue;
    const { effects } = enhancement;

    if (effects.damageFactor) stacked.damageFactor *= effects.damageFactor;
    if (effects.fireRateFactor) stacked.fireRateFactor *= effects.fireRateFactor;
    if (effects.reloadTimeFactor) stacked.reloadTimeFactor *= effects.reloadTimeFactor;
    if (effects.pelletsFactor) stacked.pelletsFactor *= effects.pelletsFactor;
    if (effects.spreadFactor) stacked.spreadFactor *= effects.spreadFactor;
    if (effects.magazineFactor) stacked.magazineFactor *= effects.magazineFactor;

    if (effects.addSpread) stacked.addSpread += effects.addSpread;
    if (effects.addPenetration) stacked.addPenetration += effects.addPenetration;
    if (effects.addExplosionRadius) stacked.addExplosionRadius += effects.addExplosionRadius;
    if (effects.explosionDamageFactor) {
      stacked.explosionDamageFactor *= effects.explosionDamageFactor;
    }

    // 改造类效果取最强的一档，而不是「最后一张卡覆盖前面」：
    // 取值不能依赖 Set 的插入顺序，且强化只该越叠越强。
    if (effects.setToAuto !== undefined) {
      stacked.auto = (stacked.auto ?? false) || effects.setToAuto;
    }
    if (effects.setPellets !== undefined) {
      stacked.pellets = Math.max(stacked.pellets ?? 0, effects.setPellets);
    }
    if (effects.setPenetration !== undefined) {
      stacked.penetration = Math.max(stacked.penetration ?? 0, effects.setPenetration);
    }
    if (effects.setBurstCount !== undefined) {
      stacked.burstCount = Math.max(stacked.burstCount ?? 1, effects.setBurstCount);
    }
    if (effects.setAmmoChain) {
      const current = stacked.ammoChain;
      stacked.ammoChain = {
        interval: Math.min(current?.interval ?? Number.POSITIVE_INFINITY, effects.setAmmoChain.interval),
        bonusBurstCount: Math.max(current?.bonusBurstCount ?? 0, effects.setAmmoChain.bonusBurstCount),
        damageFactor: Math.max(current?.damageFactor ?? 1, effects.setAmmoChain.damageFactor),
      };
    }
    if (effects.setMarkOnHit) {
      const current = stacked.markOnHit;
      stacked.markOnHit = {
        duration: Math.max(current?.duration ?? 0, effects.setMarkOnHit.duration),
        damageFactor: Math.max(current?.damageFactor ?? 1, effects.setMarkOnHit.damageFactor),
      };
    }
    if (effects.setImpactLingering) stacked.lingering = effects.setImpactLingering;
  }

  return stacked;
}

/** 把累加后的净修正量套用到武器基础值上。 */
function applyModifiers(weaponId: WeaponId, mods: StackedModifiers): WeaponDef {
  const def: WeaponDef = { ...WEAPONS[weaponId] };
  if (def.impactEffect) def.impactEffect = { ...def.impactEffect };

  if (mods.auto !== undefined) def.auto = mods.auto;
  if (mods.penetration !== undefined) def.penetration = mods.penetration;
  if (mods.burstCount !== undefined) def.burstCount = mods.burstCount;
  if (mods.ammoChain) def.ammoChain = { ...mods.ammoChain };
  if (mods.markOnHit) def.markOnHit = { ...mods.markOnHit };

  let damageFactor = mods.damageFactor;
  if (mods.pellets === undefined) {
    def.pellets *= mods.pelletsFactor;
  } else {
    // 弹丸数被改造锁定时（独头鹿弹把霰弹枪变成单发弹头），「弹丸翻倍」
    // 已经没有可翻的弹丸了。丢弃会让这张卡变成空卡，硬乘上去又会把独头弹
    // 拆回散弹；折算成等效伤害倍率，火力照涨而弹道形态保持不变。
    def.pellets = mods.pellets;
    damageFactor *= mods.pelletsFactor;
  }

  def.damage *= damageFactor;
  def.fireRate *= mods.fireRateFactor;
  def.reloadTime *= mods.reloadTimeFactor;
  def.magazineSize *= mods.magazineFactor;
  // 倍率先乘、加法后加：同一项上两类修正共存时结果才不依赖书写顺序。
  def.spread = def.spread * mods.spreadFactor + mods.addSpread;
  def.penetration += mods.addPenetration;

  const impact = def.impactEffect;
  if (impact) {
    impact.damage *= mods.explosionDamageFactor;
    impact.radius += mods.addExplosionRadius;
    if (mods.lingering) impact.lingering = { ...mods.lingering };
  }

  // 弹丸数、弹匣和穿透会进入循环与计数逻辑，必须落到合法整数；
  // 射速、散射和爆炸半径夹到非负，防止叠加后出现负值。
  def.pellets = Math.max(1, Math.round(def.pellets));
  def.magazineSize = Math.max(1, Math.round(def.magazineSize));
  def.penetration = Math.max(0, Math.round(def.penetration));
  if (def.burstCount !== undefined) def.burstCount = Math.max(1, Math.round(def.burstCount));
  if (def.ammoChain) {
    def.ammoChain.interval = Math.max(1, Math.round(def.ammoChain.interval));
    def.ammoChain.bonusBurstCount = Math.max(0, Math.round(def.ammoChain.bonusBurstCount));
    def.ammoChain.damageFactor = Math.max(1, def.ammoChain.damageFactor);
  }
  if (def.markOnHit) {
    def.markOnHit.duration = Math.max(1, def.markOnHit.duration);
    def.markOnHit.damageFactor = Math.max(1, def.markOnHit.damageFactor);
  }
  def.fireRate = Math.max(0, def.fireRate);
  def.spread = Math.max(0, def.spread);
  if (def.impactEffect) {
    def.impactEffect.radius = Math.max(1, def.impactEffect.radius);
  }

  return def;
}
