import { describe, expect, it } from 'vitest';
import {
  KNOCKBACK_BASE_RADIUS,
  KNOCKBACK_MIN_SCALE,
  MOVING_SPREAD_PENALTY,
  resolveDropoffMultiplier,
  resolveKnockbackDistance,
  resolveObstacleBounce,
  resolveObstacleBounceSurface,
  resolvePierceDamage,
  resolveSpinUpFireRate,
  resolveSpreadMultiplier,
  shouldExecute,
} from '../src/systems/WeaponCombatRules';
import { WEAPONS, getWeaponDef } from '../src/config/weapons';
import { resolveHeadshotDamage, rollHeadshot } from '../src/systems/CharacterCombatRules';

describe('移动射击散射惩罚', () => {
  it('静止时任何武器都不受惩罚', () => {
    expect(resolveSpreadMultiplier(undefined, false)).toBe(1);
    expect(resolveSpreadMultiplier(0.3, false)).toBe(1);
    expect(resolveSpreadMultiplier(1, false)).toBe(1);
  });

  it('缺省承受完整惩罚', () => {
    expect(resolveSpreadMultiplier(undefined, true)).toBe(MOVING_SPREAD_PENALTY);
    expect(resolveSpreadMultiplier(1, true)).toBe(MOVING_SPREAD_PENALTY);
  });

  it('承受比例为 0 时移动完全不影响精度', () => {
    expect(resolveSpreadMultiplier(0, true)).toBe(1);
  });

  it('承受比例是插值而不是直接倍率：小于 1 绝不能出现"移动更准"', () => {
    const mp5 = resolveSpreadMultiplier(0.3, true);
    expect(mp5).toBeCloseTo(1 + (MOVING_SPREAD_PENALTY - 1) * 0.3);
    // 关键回归：直接相乘会得到 0.75，即移动比站着更准，语义完全反了。
    expect(mp5).toBeGreaterThan(1);
    expect(mp5).toBeLessThan(MOVING_SPREAD_PENALTY);
  });

  it('越界的承受比例被夹到 0~1', () => {
    expect(resolveSpreadMultiplier(-3, true)).toBe(1);
    expect(resolveSpreadMultiplier(9, true)).toBe(MOVING_SPREAD_PENALTY);
  });
});

describe('加特林预热射速', () => {
  const spinUp = { durationMs: 1200, initialFireRate: 160 };

  it('从初始间隔平滑加速到基础射速并夹住端点', () => {
    expect(resolveSpinUpFireRate(45, spinUp, -100)).toBe(160);
    expect(resolveSpinUpFireRate(45, spinUp, 600)).toBeCloseTo(102.5);
    expect(resolveSpinUpFireRate(45, spinUp, 1200)).toBe(45);
    expect(resolveSpinUpFireRate(45, spinUp, 5000)).toBe(45);
  });

  it('普通武器和零时长配置直接使用基础射速', () => {
    expect(resolveSpinUpFireRate(85, undefined, 500)).toBe(85);
    expect(resolveSpinUpFireRate(45, { durationMs: 0, initialFireRate: 160 }, 0)).toBe(45);
  });
});

describe('距离衰减', () => {
  const stops = [
    { distance: 0, multiplier: 1 },
    { distance: 110, multiplier: 0.7 },
    { distance: 210, multiplier: 0.35 },
  ];

  it('未配置时全程满伤', () => {
    expect(resolveDropoffMultiplier(undefined, 500)).toBe(1);
    expect(resolveDropoffMultiplier([], 500)).toBe(1);
  });

  it('取已越过的最后一档', () => {
    expect(resolveDropoffMultiplier(stops, 0)).toBe(1);
    expect(resolveDropoffMultiplier(stops, 109)).toBe(1);
    expect(resolveDropoffMultiplier(stops, 110)).toBe(0.7);
    expect(resolveDropoffMultiplier(stops, 209)).toBe(0.7);
    expect(resolveDropoffMultiplier(stops, 210)).toBe(0.35);
    expect(resolveDropoffMultiplier(stops, 9999)).toBe(0.35);
  });

  it('未越过首档时不衰减', () => {
    const late = [{ distance: 200, multiplier: 0.5 }];
    expect(resolveDropoffMultiplier(late, 199)).toBe(1);
    expect(resolveDropoffMultiplier(late, 200)).toBe(0.5);
  });
});

describe('穿透加成', () => {
  it('第一个目标不吃加成', () => {
    expect(resolvePierceDamage(45, 1.2, 0)).toBe(45);
  });

  it('每穿透一个目标伤害递增', () => {
    expect(resolvePierceDamage(45, 1.2, 1)).toBeCloseTo(45 * 1.2);
    expect(resolvePierceDamage(45, 1.2, 3)).toBeCloseTo(45 * 1.2 ** 3);
  });

  it('未配置或倍率为 1 时保持基础伤害', () => {
    expect(resolvePierceDamage(45, undefined, 5)).toBe(45);
    expect(resolvePierceDamage(45, 1, 5)).toBe(45);
  });
});

describe('击退衰减', () => {
  it('基准体型承受完整击退', () => {
    expect(resolveKnockbackDistance(150, KNOCKBACK_BASE_RADIUS)).toBe(150);
  });

  it('体型越大承受越少，但保留下限', () => {
    const tank = resolveKnockbackDistance(150, 24);
    expect(tank).toBeLessThan(150);
    expect(tank).toBeCloseTo(150 * (KNOCKBACK_BASE_RADIUS / 24));
    // 极大体型仍保留最小反馈，不能完全没有受击感。
    expect(resolveKnockbackDistance(150, 999)).toBeCloseTo(150 * KNOCKBACK_MIN_SCALE);
  });

  it('体型小于基准时不会放大超过 100%', () => {
    expect(resolveKnockbackDistance(150, 8)).toBe(150);
  });

  it('未配置击退或体型非法时返回 0', () => {
    expect(resolveKnockbackDistance(undefined, 14)).toBe(0);
    expect(resolveKnockbackDistance(0, 14)).toBe(0);
    expect(resolveKnockbackDistance(150, 0)).toBe(0);
  });
});

describe('处决判定', () => {
  it('生命比例低于阈值时处决', () => {
    expect(shouldExecute(0.3, 30, 100)).toBe(true);
    expect(shouldExecute(0.3, 29, 100)).toBe(true);
  });

  it('高于阈值时不处决', () => {
    expect(shouldExecute(0.3, 31, 100)).toBe(false);
  });

  it('未配置阈值或数据非法时不处决', () => {
    expect(shouldExecute(undefined, 1, 100)).toBe(false);
    expect(shouldExecute(0, 1, 100)).toBe(false);
    expect(shouldExecute(0.3, 10, 0)).toBe(false);
    // 已经死亡的目标不再重复处决。
    expect(shouldExecute(0.3, 0, 100)).toBe(false);
  });
});

describe('爆头', () => {
  it('roll 小于概率时爆头', () => {
    expect(rollHeadshot(0.15, 0.149)).toBe(true);
    expect(rollHeadshot(0.15, 0.15)).toBe(false);
    expect(rollHeadshot(0.15, 0.9)).toBe(false);
  });

  it('概率为 0 时永不爆头', () => {
    expect(rollHeadshot(0, 0)).toBe(false);
  });

  it('爆头伤害按倍率放大且不会缩小伤害', () => {
    expect(resolveHeadshotDamage(50, 2.5)).toBe(125);
    expect(resolveHeadshotDamage(50, 0.5)).toBe(50);
  });
});

describe('障碍反弹面判定', () => {
  const bounds = { left: 100, right: 300, top: 200, bottom: 240 };

  it('横向进入长条障碍时反射水平速度', () => {
    expect(resolveObstacleBounceSurface(80, 220, 105, 220, bounds, 5)).toBe('left');
    expect(resolveObstacleBounceSurface(320, 220, 295, 220, bounds, 5)).toBe('right');
  });

  it('纵向进入长条障碍时反射垂直速度，不再按障碍中心误判', () => {
    expect(resolveObstacleBounceSurface(280, 180, 280, 205, bounds, 5)).toBe('top');
    expect(resolveObstacleBounceSurface(120, 260, 120, 235, bounds, 5)).toBe('bottom');
  });

  it('缺少有效扫掠入口时退化为当前点最近表面', () => {
    expect(resolveObstacleBounceSurface(280, 205, 280, 205, bounds, 5)).toBe('top');
  });

  it('命中长障碍后把物理圆心推离实际入口面', () => {
    expect(resolveObstacleBounce(
      280, 180, 280, 205, 30, 120, bounds, 5,
    )).toEqual({
      surface: 'top',
      centerX: 280,
      centerY: 194,
      velocityX: 30,
      velocityY: -120,
    });
  });

  it('角点同时进入两轴时稳定选择左右侧面并只反射水平速度', () => {
    expect(resolveObstacleBounce(
      80, 180, 105, 205, 120, 120, bounds, 5,
    )).toEqual({
      surface: 'left',
      centerX: 94,
      centerY: 205,
      velocityX: -120,
      velocityY: 120,
    });
  });
});

describe('切片四把武器的爽感字段落地', () => {
  it('手枪有爆头修正、MP5 有移动优势、霰弹有处决与衰减、M4A1 有穿透加成', () => {
    expect(WEAPONS.pistol.canHeadshot).toBe(true);
    expect(WEAPONS.pistol.headshotChanceBonus).toBeGreaterThan(0);
    expect(WEAPONS.pistol.headshotMultiplier).toBeGreaterThan(1);

    expect(WEAPONS.smg.movementPenalty).toBeLessThan(1);
    expect(resolveSpreadMultiplier(WEAPONS.smg.movementPenalty, true))
      .toBeLessThan(resolveSpreadMultiplier(undefined, true));

    expect(WEAPONS.shotgun.executeThreshold).toBeGreaterThan(0);
    expect(WEAPONS.shotgun.knockback).toBeGreaterThan(0);
    expect(WEAPONS.shotgun.damageDropoff?.length).toBeGreaterThan(1);

    expect(WEAPONS.rifle.chainBonus).toBeGreaterThan(1);
    expect(WEAPONS.rifle.penetration).toBeGreaterThan(1);
  });

  it('霰弹距离衰减档位升序且最远档在射程内', () => {
    const stops = WEAPONS.shotgun.damageDropoff;
    expect(stops).toBeDefined();
    for (let i = 1; i < stops.length; i++) {
      expect(stops[i].distance).toBeGreaterThan(stops[i - 1].distance);
      expect(stops[i].multiplier).toBeLessThan(stops[i - 1].multiplier);
    }
    expect(stops[stops.length - 1].distance).toBeLessThanOrEqual(WEAPONS.shotgun.range);
  });

  it('每把武器的散射都大于 0，移动惩罚才不会对某把枪失效', () => {
    for (const weaponId of Object.keys(WEAPONS) as Array<keyof typeof WEAPONS>) {
      // 惩罚是按散射倍率实现的：spread 为 0 的武器会完全不受移动影响。
      expect(getWeaponDef(weaponId).spread, `${weaponId} 的散射为 0`).toBeGreaterThan(0);
    }
  });

  it('后四把武器按 G2-6 拥有各自签名机制', () => {
    const ak47 = getWeaponDef('ak47');
    expect(ak47.auto).toBe(true);
    expect(ak47.magazineSize).toBeGreaterThan(WEAPONS.rifle.magazineSize);
    expect(ak47.movementPenalty).toBeLessThan(1);
    expect(ak47.penetration).toBeGreaterThanOrEqual(2);

    const barrett = getWeaponDef('barrett');
    expect(barrett.damage).toBeGreaterThan(200);
    expect(barrett.headshotChanceBonus).toBeGreaterThan(0);
    expect(barrett.knockback).toBeGreaterThan(0);
    expect(barrett.chainBonus).toBeGreaterThan(1);
    expect(barrett.penetration).toBeGreaterThan(WEAPONS.rifle.penetration);
    expect(barrett.killSlowMotionTier).toBe('A');

    const rpg = getWeaponDef('rpg');
    expect(rpg.impactEffect?.damage).toBeGreaterThan(WEAPONS.m79.impactEffect?.damage ?? 0);
    expect(rpg.impactEffect?.radius).toBeGreaterThan(150);
    expect(rpg.magazineSize).toBe(1);

    const m79 = getWeaponDef('m79');
    expect(m79.bounceCount).toBe(1);
    expect(m79.impactEffect?.radius).toBeLessThan(rpg.impactEffect?.radius ?? Infinity);
    expect(m79.reloadTime).toBeLessThan(rpg.reloadTime);
  });
});

describe('新增重火力武器定位', () => {
  it('加特林、黄金 M249 与喷火器使用独立补给并具备差异化机制', () => {
    expect(WEAPONS.gatling.ammoType).toBe('belt');
    expect(WEAPONS.gatling.spinUp?.initialFireRate).toBeGreaterThan(WEAPONS.gatling.fireRate);
    expect(WEAPONS.golden_m249.ammoType).toBe('belt');
    expect(WEAPONS.golden_m249.ammoChain?.interval).toBe(10);
    expect(WEAPONS.flamethrower.ammoType).toBe('fuel');
    expect(WEAPONS.flamethrower.projectileStyle).toBe('flame');
    expect(getWeaponDef('flamethrower').impactEffect).toBeUndefined();
    expect(WEAPONS.flamethrower.impactLinger?.stackMode).toBe('refresh-nearby');
    expect(WEAPONS.flamethrower.impactLinger?.damagesPlayer).toBe(false);
  });
});
