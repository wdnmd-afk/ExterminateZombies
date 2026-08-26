import { describe, expect, it } from 'vitest';
import { WEAPONS } from '../src/config/weapons';
import { validateGameConfig } from '../src/config/validate';
import type { ChainLightningDef, ChargeShotDef, WeaponDef } from '../src/config/types';

/**
 * 第二批六把武器的机制不变量。
 *
 * 这里测的是**配置层的可玩性前提**，不是运行期行为：链式必须收敛、蓄力必须有收益、
 * 多发耗弹必须打得出来。运行期行为（电弧真的跳到了谁、松手那一帧算出多少伤害）
 * 需要 Phaser 场景，属于实机验收范围。
 */

const NEW_WEAPON_IDS = ['m16a4', 'aa12', 'dual_uzi', 'tesla', 'railgun', 'cryo_sprayer'] as const;

/** 链式闪电的总伤害上界。用于确认它收敛而不是发散。 */
function totalChainDamage(baseDamage: number, chain: ChainLightningDef): number {
  let total = baseDamage;
  let current = baseDamage;
  for (let jump = 0; jump < chain.jumps; jump += 1) {
    current *= chain.damageFactor;
    total += current;
  }
  return total;
}

/** 蓄力比例 → 伤害倍率，与 `WeaponManager.tryFire` 的插值同式。 */
function chargeDamageFactor(charge: ChargeShotDef, ratio: number): number {
  return charge.minDamageFactor
    + (charge.maxDamageFactor - charge.minDamageFactor) * ratio;
}

describe('第二批武器配置', () => {
  it('六把武器全部存在且键名与 id 一致', () => {
    for (const weaponId of NEW_WEAPON_IDS) {
      const weapon = WEAPONS[weaponId] as WeaponDef;
      expect(weapon, `${weaponId} 未注册`).toBeDefined();
      expect(weapon.id).toBe(weaponId);
      expect(weapon.name.trim().length).toBeGreaterThan(0);
    }
  });

  it('配置校验器没有因新武器报错', () => {
    expect(validateGameConfig()).toEqual([]);
  });
});

describe('多发耗弹（ammoPerShot）', () => {
  it('三连发步枪一次扣 3 发，不是免费的三倍火力', () => {
    const m16a4 = WEAPONS.m16a4 as WeaponDef;
    expect(m16a4.burstCount).toBe(3);
    // 这两个数必须相等：只配 burstCount 会让一发弹药打出三发，
    // 那是强化卡的特权，不该是基础武器的经济。
    expect(m16a4.ammoPerShot).toBe(m16a4.burstCount);
  });

  it('每次击发耗弹不超过弹匣容量，装满就能打出至少一次', () => {
    for (const weaponId of NEW_WEAPON_IDS) {
      const weapon = WEAPONS[weaponId] as WeaponDef;
      const perShot = weapon.ammoPerShot ?? 1;
      expect(perShot, `${weaponId} 的耗弹非正`).toBeGreaterThanOrEqual(1);
      expect(
        perShot,
        `${weaponId} 装满弹匣也打不出一次击发`,
      ).toBeLessThanOrEqual(weapon.magazineSize);
    }
  });

  it('双持乌兹一次两管但只扣 1 发，弹匣容量已按此配平', () => {
    const uzi = WEAPONS.dual_uzi as WeaponDef;
    expect(uzi.burstCount).toBe(2);
    // 显式断言"没有配 ammoPerShot"：双持的浪漫就是两管的火力按一发算，
    // 平衡由高散射与短射程承担。哪天有人顺手补上这个字段，这条会拦住他。
    expect(uzi.ammoPerShot).toBeUndefined();
  });
});

describe('链式闪电', () => {
  const chain = (WEAPONS.tesla as WeaponDef).chainLightning as ChainLightningDef;

  it('特斯拉枪配了链式闪电', () => {
    expect(chain).toBeDefined();
    expect(chain.jumps).toBeGreaterThanOrEqual(1);
    expect(chain.radius).toBeGreaterThan(0);
  });

  it('每跳伤害严格递减，链条必然收敛', () => {
    expect(chain.damageFactor).toBeGreaterThan(0);
    expect(chain.damageFactor).toBeLessThan(1);
  });

  it('总伤害有明确上界，不会因跳数增加而发散', () => {
    const base = (WEAPONS.tesla as WeaponDef).damage;
    const total = totalChainDamage(base, chain);
    // 等比数列上界：base / (1 - r)。实际跳数有限，因此必然低于它。
    const bound = base / (1 - chain.damageFactor);
    expect(total).toBeLessThan(bound);
    // 同时必须真的比单体伤害高，否则这个机制没有存在意义。
    expect(total).toBeGreaterThan(base);
  });

  it('最后一跳仍然造成可见伤害，跳数没有配到无意义的长度', () => {
    const base = (WEAPONS.tesla as WeaponDef).damage;
    const lastJump = base * chain.damageFactor ** chain.jumps;
    // 运行期在伤害低于 1 时提前 break；配置层面最后一跳应当仍在 1 以上，
    // 否则配的跳数里有一段永远不会发生。
    expect(lastJump).toBeGreaterThanOrEqual(1);
  });
});

describe('蓄力射击', () => {
  const railgun = WEAPONS.railgun as WeaponDef;
  const charge = railgun.chargeShot as ChargeShotDef;

  it('磁轨炮配了蓄力，且是单发武器', () => {
    expect(charge).toBeDefined();
    // 自动武器按住就连发，永远读不到"松手"这个击发时刻。
    expect(railgun.auto).toBe(false);
  });

  it('蓄力有正收益：满蓄力严格强于零蓄力', () => {
    expect(charge.maxDamageFactor).toBeGreaterThan(charge.minDamageFactor);
    expect(chargeDamageFactor(charge, 1)).toBeGreaterThan(chargeDamageFactor(charge, 0));
  });

  it('零蓄力仍能开火，被贴脸时不会完全无法自卫', () => {
    expect(charge.minDamageFactor).toBeGreaterThan(0);
    expect(chargeDamageFactor(charge, 0)).toBeCloseTo(charge.minDamageFactor);
  });

  it('伤害倍率随蓄力单调递增且落在两端之间', () => {
    let previous = -Infinity;
    for (const ratio of [0, 0.25, 0.5, 0.75, 1]) {
      const factor = chargeDamageFactor(charge, ratio);
      expect(factor).toBeGreaterThan(previous);
      expect(factor).toBeGreaterThanOrEqual(charge.minDamageFactor);
      expect(factor).toBeLessThanOrEqual(charge.maxDamageFactor);
      previous = factor;
    }
  });

  it('满蓄力的穿透加成是非负整数', () => {
    expect(Number.isInteger(charge.maxPenetrationBonus)).toBe(true);
    expect(charge.maxPenetrationBonus).toBeGreaterThanOrEqual(0);
  });
});

describe('命中减速', () => {
  it('冷冻喷射器靠减速而不是伤害承担价值', () => {
    const cryo = WEAPONS.cryo_sprayer as WeaponDef;
    const flame = WEAPONS.flamethrower as WeaponDef;
    expect(cryo.slowOnHit).toBeDefined();
    // 它的每秒伤害必须明显低于喷火器：两把扇形武器如果伤害相当，
    // 冷冻就成了"喷火器加强版"而不是另一种解法。
    expect(cryo.coneAttack!.damagePerSecond).toBeLessThan(flame.coneAttack!.damagePerSecond);
  });

  it('减速倍率落在开区间 0~1，不是"减速到 0"也不是"没有减速"', () => {
    const slow = (WEAPONS.cryo_sprayer as WeaponDef).slowOnHit!;
    expect(slow.speedMultiplier).toBeGreaterThan(0);
    expect(slow.speedMultiplier).toBeLessThan(1);
    expect(slow.duration).toBeGreaterThan(0);
  });

  it('扇形武器的 range 与 coneAttack.range 一致', () => {
    // 两者不一致时 UI 显示的射程与实际烧到的距离会对不上。
    for (const weaponId of ['cryo_sprayer', 'flamethrower'] as const) {
      const weapon = WEAPONS[weaponId] as WeaponDef;
      expect(weapon.range).toBe(weapon.coneAttack!.range);
    }
  });
});
