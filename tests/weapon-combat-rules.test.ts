import { describe, expect, it } from 'vitest';
import {
  BRACE_RECOVERY_FACTOR,
  KNOCKBACK_BASE_RADIUS,
  KNOCKBACK_MIN_SCALE,
  MAX_CONE_TICK_FACTOR,
  MIN_MOBILITY_MULTIPLIER,
  MOVING_SPREAD_PENALTY,
  advanceBraceRatio,
  isConeTargetBlocked,
  isTargetInsideCone,
  resolveBraceRampMs,
  resolveConeTickDamage,
  resolveDropoffMultiplier,
  resolveKnockbackDistance,
  resolveObstacleBounce,
  resolveObstacleBounceSurface,
  resolvePierceDamage,
  resolveSpinUpFireRate,
  resolveSpreadMultiplier,
  resolveWeaponMobilityMultiplier,
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
      const weapon = getWeaponDef(weaponId);
      if (weapon.coneAttack) {
        // 扇形武器没有弹道，散射对它无从生效；它的移动代价必须由负重来承担，
        // 否则「边跑边烧」会变成完全没有取舍的最优解。
        expect(weapon.mobility?.carry, `${weaponId} 的扇形攻击没有负重代价`).toBeLessThan(1);
        continue;
      }
      // 惩罚是按散射倍率实现的：spread 为 0 的武器会完全不受移动影响。
      expect(weapon.spread, `${weaponId} 的散射为 0`).toBeGreaterThan(0);
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
    // 喷火器不再发射弹丸：枪口前方是一片扇形火焰，范围内每秒持续掉血。
    expect(WEAPONS.flamethrower.coneAttack?.damagePerSecond).toBeGreaterThan(0);
    expect(WEAPONS.flamethrower.coneAttack?.angle).toBeGreaterThan(0);
    expect(WEAPONS.flamethrower.coneAttack?.range).toBe(WEAPONS.flamethrower.range);
    expect(getWeaponDef('flamethrower').projectileStyle).toBeUndefined();
    expect(getWeaponDef('flamethrower').impactEffect).toBeUndefined();    expect(WEAPONS.flamethrower.impactLinger?.stackMode).toBe('refresh-nearby');
    expect(WEAPONS.flamethrower.impactLinger?.damagesPlayer).toBe(false);
  });
});

describe('架枪进度', () => {
  it('不开火时从 0 起不动', () => {
    expect(advanceBraceRatio(0, 16, 1200, false)).toBe(0);
  });

  it('开火期间按 ramp 线性建立，满档后不越 1', () => {
    expect(advanceBraceRatio(0, 600, 1200, true)).toBeCloseTo(0.5);
    expect(advanceBraceRatio(0.5, 600, 1200, true)).toBeCloseTo(1);
    expect(advanceBraceRatio(1, 600, 1200, true)).toBe(1);
  });

  it('松扳机按恢复倍速回落且不越 0', () => {
    // 建立慢、解除快：同样的 300ms 回落掉的进度是建立的 BRACE_RECOVERY_FACTOR 倍。
    const built = advanceBraceRatio(0, 300, 1200, true);
    const recovered = advanceBraceRatio(1, 300, 1200, false);
    expect(1 - recovered).toBeCloseTo(built * BRACE_RECOVERY_FACTOR);
    expect(advanceBraceRatio(0.1, 1000, 1200, false)).toBe(0);
  });

  it('非法 delta 与进度被安全归一', () => {
    expect(advanceBraceRatio(Number.NaN, 16, 1200, true)).toBeCloseTo(16 / 1200);
    expect(advanceBraceRatio(0.5, Number.NaN, 1200, true)).toBe(0.5);
    expect(advanceBraceRatio(0.5, -100, 1200, true)).toBe(0.5);
  });

  it('缺省复用预热时长，让转速与负重共用同一条曲线', () => {
    expect(resolveBraceRampMs(WEAPONS.gatling.mobility, WEAPONS.gatling.spinUp))
      .toBe(WEAPONS.gatling.spinUp.durationMs);
    expect(resolveBraceRampMs(WEAPONS.golden_m249.mobility, undefined)).toBe(800);
    expect(resolveBraceRampMs(undefined, undefined)).toBeGreaterThan(0);
  });
});

describe('武器负重移速', () => {
  const gatling = WEAPONS.gatling.mobility;

  it('没配负重的武器完全不受影响', () => {
    expect(resolveWeaponMobilityMultiplier(undefined, { reloading: true, braceRatio: 1 })).toBe(1);
  });

  it('取最强的一项而不是相乘', () => {
    // 关键回归：相乘会得到 carry 0.8 × reload 0.35 = 0.28，比配置里任何一项都狠，
    // 4.2 秒换弹直接变成站着等死，而且 HUD 上的百分比也无法从配置反推。
    const reloading = resolveWeaponMobilityMultiplier(gatling, { reloading: true, braceRatio: 0 });
    expect(reloading).toBeCloseTo(0.35);
    expect(reloading).toBeGreaterThan(gatling.carry * gatling.reload);
  });

  it('待机只吃常驻负重，架枪满档取架枪值', () => {
    expect(resolveWeaponMobilityMultiplier(gatling, { reloading: false, braceRatio: 0 }))
      .toBeCloseTo(gatling.carry);
    expect(resolveWeaponMobilityMultiplier(gatling, { reloading: false, braceRatio: 1 }))
      .toBeCloseTo(gatling.sustainedFire);
  });

  it('架枪按进度插值，半档落在常驻负重与满档之间', () => {
    const half = resolveWeaponMobilityMultiplier(gatling, { reloading: false, braceRatio: 0.5 });
    expect(half).toBeLessThan(gatling.carry);
    expect(half).toBeGreaterThan(gatling.sustainedFire);
  });

  it('没配架枪的武器持续开火也不掉速', () => {
    // 走 getWeaponDef 而不是 WEAPONS.rifle：后者保留字面量类型，读不到没配的可选字段。
    const rifle = getWeaponDef('rifle').mobility!;
    expect(rifle.sustainedFire).toBeUndefined();
    expect(resolveWeaponMobilityMultiplier(rifle, { reloading: false, braceRatio: 1 }))
      .toBeCloseTo(rifle.carry);
  });

  it('手枪除换弹外全程不受影响', () => {
    const pistol = WEAPONS.pistol.mobility;
    expect(resolveWeaponMobilityMultiplier(pistol, { reloading: false, braceRatio: 1 })).toBe(1);
    expect(resolveWeaponMobilityMultiplier(pistol, { reloading: true, braceRatio: 0 }))
      .toBeCloseTo(pistol.reload);
  });

  it('越界配置被夹回可玩区间', () => {
    expect(resolveWeaponMobilityMultiplier(
      { carry: 0.05, reload: 0.02 },
      { reloading: true, braceRatio: 0 },
    )).toBe(MIN_MOBILITY_MULTIPLIER);
    expect(resolveWeaponMobilityMultiplier(
      { carry: 3, reload: 2 },
      { reloading: true, braceRatio: 0 },
    )).toBe(1);
    expect(resolveWeaponMobilityMultiplier(gatling, { reloading: false, braceRatio: Number.NaN }))
      .toBeCloseTo(gatling.carry);
  });

  it('全部武器的负重都在可玩区间内，且手枪最轻、加特林最重', () => {
    for (const weaponId of Object.keys(WEAPONS) as Array<keyof typeof WEAPONS>) {
      const mobility = getWeaponDef(weaponId).mobility;
      expect(mobility, `${weaponId} 缺少负重配置`).toBeDefined();
      for (const value of [mobility!.carry, mobility!.reload, mobility!.sustainedFire ?? 1]) {
        expect(value, `${weaponId} 的负重越界`).toBeGreaterThan(MIN_MOBILITY_MULTIPLIER);
        expect(value, `${weaponId} 的负重越界`).toBeLessThanOrEqual(1);
      }
      expect(mobility!.carry, `${weaponId} 比手枪还轻`)
        .toBeLessThanOrEqual(WEAPONS.pistol.mobility.carry);
      expect(mobility!.reload, `${weaponId} 换弹比加特林还重`)
        .toBeGreaterThanOrEqual(WEAPONS.gatling.mobility.reload);
    }
  });
});

describe('机枪类精度定位', () => {
  it('机枪散射明显收紧到突击步枪之下，架枪不动是它们的强项', () => {
    // 负重把机枪变成「架起来打」的平台，精度就是架枪换来的回报。
    expect(WEAPONS.gatling.spread).toBeLessThan(WEAPONS.ak47.spread);
    expect(WEAPONS.golden_m249.spread).toBeLessThan(WEAPONS.ak47.spread);
    // 不吃预热的 M249 精度必须优于加特林，否则两把机枪没有分工。
    expect(WEAPONS.golden_m249.spread).toBeLessThan(WEAPONS.gatling.spread);
  });

  it('加特林移动扫射的散射约等于收紧前的站桩水平', () => {
    // 改动前是站桩 12°。收紧到 4.5° 后，边挪边打 4.5 × 2.5 = 11.25°，
    // 等于把旧手感变成新的下限：站着打更准，跑着打不比以前差。
    const moving = WEAPONS.gatling.spread
      * resolveSpreadMultiplier(WEAPONS.gatling.movementPenalty, true);
    expect(moving).toBeGreaterThan(10);
    expect(moving).toBeLessThan(13);
  });
});

describe('扇形火焰的每秒伤害', () => {
  it('按经过时间折算，一整秒正好扣满一份每秒伤害', () => {
    expect(resolveConeTickDamage(78, 1000, 1000)).toBeCloseTo(78);
    expect(resolveConeTickDamage(78, 120, 120)).toBeCloseTo(9.36);
  });

  it('卡帧造成的超长间隔被夹住，不会凭空重击一次', () => {
    const capped = resolveConeTickDamage(78, 5000, 120);
    expect(capped).toBeCloseTo((78 * 120 * MAX_CONE_TICK_FACTOR) / 1000);
  });

  it('没有伤害或没有间隔时不结算', () => {
    expect(resolveConeTickDamage(0, 120, 120)).toBe(0);
    expect(resolveConeTickDamage(78, 0, 120)).toBe(0);
    expect(resolveConeTickDamage(78, 120, 0)).toBe(0);
  });
});

describe('扇形火焰的命中判定', () => {
  const RANGE = 210;
  const ANGLE = 58;

  it('正前方射程内命中', () => {
    expect(isTargetInsideCone(0, 0, 0, RANGE, ANGLE, 150, 0)).toBe(true);
  });

  it('超出射程不命中', () => {
    expect(isTargetInsideCone(0, 0, 0, RANGE, ANGLE, 260, 0)).toBe(false);
  });

  it('背后的目标不会被烧到', () => {
    expect(isTargetInsideCone(0, 0, 0, RANGE, ANGLE, -100, 0)).toBe(false);
  });

  it('张角之外的侧向目标不命中', () => {
    // 58 度总张角 = 左右各 29 度；45 度方向必须落空。
    expect(isTargetInsideCone(0, 0, 0, RANGE, ANGLE, 100, 100)).toBe(false);
  });

  it('体型让贴边的大个子仍然算被烧到', () => {
    const x = 100;
    const y = 100 * Math.tan((32 * Math.PI) / 180);
    expect(isTargetInsideCone(0, 0, 0, RANGE, ANGLE, x, y, 0)).toBe(false);
    expect(isTargetInsideCone(0, 0, 0, RANGE, ANGLE, x, y, 24)).toBe(true);
  });

  it('怼在枪口上的目标一定命中，不受方向影响', () => {
    expect(isTargetInsideCone(0, 0, 0, RANGE, ANGLE, -4, -3, 20)).toBe(true);
  });

  it('瞄准方向跨过 ±180 度时判定仍然正确', () => {
    expect(isTargetInsideCone(0, 0, Math.PI, RANGE, ANGLE, -150, 0)).toBe(true);
    expect(isTargetInsideCone(0, 0, -Math.PI, RANGE, ANGLE, -150, 0)).toBe(true);
  });
});

describe('扇形火焰的掩体遮挡', () => {
  const cover = [{ x: 100, y: 0, width: 30, height: 120 }];

  it('掩体后的目标不掉血', () => {
    expect(isConeTargetBlocked(0, 0, 180, 0, cover)).toBe(true);
  });

  it('绕过掩体的目标照常掉血', () => {
    expect(isConeTargetBlocked(0, 0, 180, 200, cover)).toBe(false);
  });

  it('没有掩体时永不遮挡', () => {
    expect(isConeTargetBlocked(0, 0, 180, 0, [])).toBe(false);
  });
});
