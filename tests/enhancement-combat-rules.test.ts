import { describe, expect, it } from 'vitest';
import { EnhancementManager } from '../src/systems/EnhancementManager';
import {
  createImpactFragmentBlasts,
  createTargetMark,
  resolveTargetMarkDamageFactor,
  resolveWeaponVolley,
} from '../src/systems/EnhancementCombatRules';

describe('强化打法变异规则', () => {
  it('弹链只在第 5 发周期点增加两组齐射并应用伤害倍率', () => {
    const smg = EnhancementManager.resolveWeaponDef('smg', new Set(['smg_penetration']));

    expect(resolveWeaponVolley(smg, 4)).toMatchObject({
      burstCount: 1,
      totalProjectiles: 1,
      damageFactor: 1,
      ammoChainTriggered: false,
    });
    expect(resolveWeaponVolley(smg, 5)).toMatchObject({
      burstCount: 3,
      totalProjectiles: 3,
      damageFactor: 1.25,
      ammoChainTriggered: true,
    });
    expect(resolveWeaponVolley(smg, 10).ammoChainTriggered).toBe(true);
  });

  it('四管齐射生成四组共 16 颗弹丸', () => {
    const shotgun = EnhancementManager.resolveWeaponDef(
      'shotgun',
      new Set(['shotgun_double_pellets']),
    );

    expect(resolveWeaponVolley(shotgun, 1)).toEqual({
      burstCount: 4,
      pelletsPerBurst: 4,
      totalProjectiles: 16,
      damageFactor: 1,
      ammoChainTriggered: false,
    });
  });

  it('连锁标记在持续时间内生效，到期帧立即失效', () => {
    const mark = createTargetMark({ duration: 3000, damageFactor: 1.35 }, 1000);
    expect(mark).toEqual({ expiresAt: 4000, damageFactor: 1.35 });
    expect(resolveTargetMarkDamageFactor(mark, 3999)).toBe(1.35);
    expect(resolveTargetMarkDamageFactor(mark, 4000)).toBe(1);
    expect(resolveTargetMarkDamageFactor(undefined, 2000)).toBe(1);
  });

  it('子母弹按固定环形位置生成一层次级爆破', () => {
    const fragments = createImpactFragmentBlasts(
      100,
      200,
      { kind: 'explosion', damage: 260, radius: 170 },
      { count: 4, offset: 140, damageFactor: 0.2, radiusFactor: 0.32 },
    );

    expect(fragments).toHaveLength(4);
    expect(fragments.map((entry) => [Math.round(entry.x), Math.round(entry.y)])).toEqual([
      [100, 60],
      [240, 200],
      [100, 340],
      [-40, 200],
    ]);
    for (const fragment of fragments) {
      expect(fragment.effect).toEqual({ kind: 'explosion', damage: 52, radius: 54.4 });
      expect(fragment.effect.lingering).toBeUndefined();
    }
  });
});
