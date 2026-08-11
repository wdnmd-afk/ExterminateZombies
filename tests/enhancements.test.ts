import { describe, expect, it } from 'vitest';
import { ENHANCEMENTS, getEnhancementsForWeapon } from '../src/config/enhancements';
import { WEAPONS, getWeaponDef, type WeaponId } from '../src/config/weapons';
import { TESTING_FLAGS, resolveDropChance } from '../src/config/testing';
import { ZOMBIES } from '../src/config/zombies';
import { EnhancementManager } from '../src/systems/EnhancementManager';

const ALL_WEAPON_IDS = Object.keys(WEAPONS) as WeaponId[];

describe('强化卡池配置', () => {
  it('每把武器都有强化卡，键与 id 一致且效果非空', () => {
    for (const [key, entry] of Object.entries(ENHANCEMENTS)) {
      expect(entry.id).toBe(key);
      expect(entry.weaponId in WEAPONS).toBe(true);
      expect(Object.keys(entry.effects).length).toBeGreaterThan(0);
    }
    for (const weaponId of ALL_WEAPON_IDS) {
      expect(getEnhancementsForWeapon(weaponId).length).toBeGreaterThanOrEqual(3);
    }
  });

  it('爆炸参数强化只挂在配置了命中爆炸的武器上', () => {
    for (const entry of Object.values(ENHANCEMENTS)) {
      const touchesImpact = entry.effects.addExplosionRadius !== undefined
        || entry.effects.explosionDamageFactor !== undefined
        || entry.effects.setImpactLingering !== undefined;
      if (!touchesImpact) continue;
      expect(getWeaponDef(entry.weaponId as WeaponId).impactEffect).toBeDefined();
    }
  });
});

describe('强化包掉落', () => {
  it('全部感染体都能掉落强化包，概率落在设计区间内', () => {
    for (const [id, zombie] of Object.entries(ZOMBIES)) {
      const drop = zombie.drops.find((entry) => entry.type === 'enhancement_pack');
      expect(drop, `${id} 缺少强化包掉落`).toBeDefined();
      const isBoss = id.includes('boss');
      if (isBoss) {
        expect(drop?.chance).toBe(1);
      } else {
        expect(drop?.chance).toBeGreaterThanOrEqual(0.01);
        expect(drop?.chance).toBeLessThanOrEqual(0.05);
      }
    }
  });

  it('正式模式直接读取配置概率；启用测试覆盖时也只影响强化包', () => {
    const override = TESTING_FLAGS.enhancementDropChance;
    const configuredChance = 0.02;
    expect(resolveDropChance({ type: 'enhancement_pack', chance: configuredChance }))
      .toBe(override ?? configuredChance);
    expect(resolveDropChance({ type: 'health', chance: 0.15, amount: 25 })).toBe(0.15);
  });
});

describe('EnhancementManager.drawEnhancements', () => {
  it('只抽玩家已持有武器的卡，且不重复给出已激活的卡', () => {
    const active = new Set(['pistol_auto']);
    const drawn = EnhancementManager.drawEnhancements(['pistol'], active);
    expect(drawn.length).toBeGreaterThan(0);
    for (const card of drawn) {
      expect(card.weaponId).toBe('pistol');
      expect(active.has(card.id)).toBe(false);
    }
  });

  it('同一武器的多张卡可以同时出现，不再互斥', () => {
    // 曾经互斥的「双倍火力」与「独头鹿弹」现在必须能一起抽到：
    // 两者叠加是设计内的组合，不是需要拦掉的冲突。
    const drawn = EnhancementManager.drawEnhancements(['shotgun'], new Set());
    const ids = drawn.map((card) => card.id);
    expect(ids).toContain('shotgun_double_pellets');
    expect(ids).toContain('shotgun_slug');
  });

  it('拿过一张后，同组的另一张仍会出现在后续抽卡中', () => {
    const active = new Set(['shotgun_double_pellets']);
    const drawn = EnhancementManager.drawEnhancements(['shotgun'], active);
    expect(drawn.some((card) => card.id === 'shotgun_slug')).toBe(true);
  });

  it('最多返回 4 张且互不重复', () => {
    for (let round = 0; round < 40; round++) {
      const drawn = EnhancementManager.drawEnhancements(ALL_WEAPON_IDS, new Set());
      expect(drawn.length).toBeLessThanOrEqual(4);
      expect(new Set(drawn.map((card) => card.id)).size).toBe(drawn.length);
    }
  });

  it('可选卡被拿完后返回空数组而不是抛错', () => {
    const active = new Set(getEnhancementsForWeapon('pistol').map((card) => card.id));
    expect(EnhancementManager.drawEnhancements(['pistol'], active)).toEqual([]);
  });
});

describe('EnhancementManager.resolveWeaponDef', () => {
  it('没有激活增强时返回基础数值', () => {
    const def = EnhancementManager.resolveWeaponDef('rifle', new Set());
    expect(def.damage).toBe(WEAPONS.rifle.damage);
    expect(def.magazineSize).toBe(WEAPONS.rifle.magazineSize);
  });

  it('应用倍率、赋值与加法修正，并把弹匣和穿透落到整数', () => {
    const shotgun = EnhancementManager.resolveWeaponDef('shotgun', new Set(['shotgun_drum_mag']));
    expect(shotgun.magazineSize).toBe(WEAPONS.shotgun.magazineSize * 2);
    expect(Number.isInteger(shotgun.magazineSize)).toBe(true);

    const pistol = EnhancementManager.resolveWeaponDef('pistol', new Set(['pistol_auto']));
    expect(pistol.auto).toBe(true);
    expect(pistol.fireRate).toBeLessThan(WEAPONS.pistol.fireRate);

    const ak = EnhancementManager.resolveWeaponDef('ak47', new Set(['ak47_steel_core']));
    expect(ak.penetration).toBe(WEAPONS.ak47.penetration + 2);

    const rifle = EnhancementManager.resolveWeaponDef('rifle', new Set(['rifle_tactical_reload']));
    // 30 * 1.2 = 36，取整后仍必须是整数弹匣
    expect(rifle.magazineSize).toBe(36);
  });

  it('只把属于该武器的增强算进来', () => {
    const rifle = EnhancementManager.resolveWeaponDef('rifle', new Set(['pistol_auto', 'smg_penetration']));
    expect(rifle.auto).toBe(WEAPONS.rifle.auto);
    expect(rifle.penetration).toBe(WEAPONS.rifle.penetration);
  });

  it('同一武器的三张卡全部叠加：倍率相乘、加法相加', () => {
    const base = getWeaponDef('ak47');
    const stacked = EnhancementManager.resolveWeaponDef(
      'ak47',
      new Set(['ak47_muzzle_brake', 'ak47_steel_core', 'ak47_high_cycle']),
    );
    expect(stacked.damage).toBeCloseTo(base.damage * 1.15);
    expect(stacked.fireRate).toBeCloseTo(base.fireRate * 0.7);
    expect(stacked.spread).toBeCloseTo(base.spread * 0.45 * 1.3);
    expect(stacked.penetration).toBe(base.penetration + 2);
  });

  it('解析结果与拾取顺序无关', () => {
    const forward = EnhancementManager.resolveWeaponDef(
      'shotgun',
      new Set(['shotgun_slug', 'shotgun_double_pellets', 'shotgun_drum_mag']),
    );
    const reversed = EnhancementManager.resolveWeaponDef(
      'shotgun',
      new Set(['shotgun_drum_mag', 'shotgun_double_pellets', 'shotgun_slug']),
    );
    expect(reversed).toEqual(forward);
  });

  it('独头弹锁定弹丸后，双倍火力折算成伤害翻倍而不是弹丸翻倍', () => {
    const base = getWeaponDef('shotgun');
    const slug = EnhancementManager.resolveWeaponDef('shotgun', new Set(['shotgun_slug']));
    expect(slug.pellets).toBe(1);
    expect(slug.damage).toBeCloseTo(base.damage * 3);

    const slugPlusDouble = EnhancementManager.resolveWeaponDef(
      'shotgun',
      new Set(['shotgun_slug', 'shotgun_double_pellets']),
    );
    // 弹丸仍是独头，火力预算折进单发伤害：18 × 3 × 2 = 108
    expect(slugPlusDouble.pellets).toBe(1);
    expect(slugPlusDouble.damage).toBeCloseTo(base.damage * 3 * 2);
  });

  it('没有独头弹时，双倍火力照常翻倍弹丸而不动伤害', () => {
    const base = getWeaponDef('shotgun');
    const doubled = EnhancementManager.resolveWeaponDef(
      'shotgun',
      new Set(['shotgun_double_pellets']),
    );
    expect(doubled.pellets).toBe(base.pellets * 2);
    expect(doubled.damage).toBeCloseTo(base.damage);
  });

  it('爆炸强化生效，且不会污染共享的 WEAPONS 配置', () => {
    const baseRadius = WEAPONS.rpg.impactEffect?.radius;
    const baseDamage = WEAPONS.rpg.impactEffect?.damage;

    const wider = EnhancementManager.resolveWeaponDef('rpg', new Set(['rpg_wider_explosion']));
    expect(wider.impactEffect?.radius).toBe((baseRadius ?? 0) + 50);

    const thermobaric = EnhancementManager.resolveWeaponDef('rpg', new Set(['rpg_thermobaric']));
    expect(thermobaric.impactEffect?.damage).toBeCloseTo((baseDamage ?? 0) * 1.6);
    expect(thermobaric.impactEffect?.radius).toBe((baseRadius ?? 0) - 25);

    // 两张弹头卡不再互斥，叠加时半径加法相加、伤害倍率相乘。
    const both = EnhancementManager.resolveWeaponDef(
      'rpg',
      new Set(['rpg_wider_explosion', 'rpg_thermobaric']),
    );
    expect(both.impactEffect?.radius).toBe((baseRadius ?? 0) + 25);
    expect(both.impactEffect?.damage).toBeCloseTo((baseDamage ?? 0) * 1.6);

    // 关键回归：impactEffect 在 WEAPONS 里是共享对象，解析必须走副本。
    expect(WEAPONS.rpg.impactEffect?.radius).toBe(baseRadius);
    expect(WEAPONS.rpg.impactEffect?.damage).toBe(baseDamage);
    expect(EnhancementManager.resolveWeaponDef('rpg', new Set()).impactEffect?.radius).toBe(baseRadius);
  });

  it('燃烧榴弹会给命中爆炸挂上残留区域，且不写回基础配置', () => {
    const m79 = EnhancementManager.resolveWeaponDef('m79', new Set(['m79_fire_linger']));
    expect(m79.impactEffect?.lingering?.kind).toBe('fire');
    expect(m79.impactEffect?.lingering?.tickDamage).toBeGreaterThan(0);
    expect(getWeaponDef('m79').impactEffect?.lingering).toBeUndefined();
  });

  it('多张增强叠加后不会出现非法的负散射或零弹丸', () => {
    const shotgun = EnhancementManager.resolveWeaponDef(
      'shotgun',
      new Set(['shotgun_slug', 'shotgun_double_pellets', 'shotgun_drum_mag']),
    );
    expect(shotgun.pellets).toBeGreaterThanOrEqual(1);
    expect(shotgun.spread).toBeGreaterThanOrEqual(0);
    expect(shotgun.penetration).toBeGreaterThanOrEqual(0);
    expect(Number.isInteger(shotgun.magazineSize)).toBe(true);
  });
});

describe('EnhancementManager.countActiveForWeapon', () => {
  it('只数同一把武器的强化层数', () => {
    const active = new Set(['ak47_steel_core', 'ak47_high_cycle', 'pistol_auto']);
    expect(EnhancementManager.countActiveForWeapon('ak47', active)).toBe(2);
    expect(EnhancementManager.countActiveForWeapon('pistol', active)).toBe(1);
    expect(EnhancementManager.countActiveForWeapon('m79', active)).toBe(0);
  });
});

describe('EnhancementManager.previewEnhancement', () => {
  it('只列出发生变化的数值，并按收益标注涨跌', () => {
    const deltas = EnhancementManager.previewEnhancement(ENHANCEMENTS.ak47_high_cycle, new Set());
    const byLabel = new Map(deltas.map((delta) => [delta.label, delta]));
    // 射速换算成「发/分」，数字变大即变强
    expect(byLabel.get('射速')?.trend).toBe('up');
    // 散射变大是变弱，必须标红
    expect(byLabel.get('散射')?.trend).toBe('down');
    // 这张卡不动伤害，就不该占一行
    expect(byLabel.has('伤害')).toBe(false);
  });

  it('涨幅基准是当前已强化状态：独头弹在场时双倍火力显示为伤害提升', () => {
    const fresh = EnhancementManager.previewEnhancement(
      ENHANCEMENTS.shotgun_double_pellets,
      new Set(),
    );
    expect(fresh.map((delta) => delta.label)).toContain('弹丸');

    const withSlug = EnhancementManager.previewEnhancement(
      ENHANCEMENTS.shotgun_double_pellets,
      new Set(['shotgun_slug']),
    );
    expect(withSlug.map((delta) => delta.label)).not.toContain('弹丸');
    const damage = withSlug.find((delta) => delta.label === '伤害');
    expect(damage?.before).toBe('54');
    expect(damage?.after).toBe('108');
  });

  it('射击模式与弹着残留各自单独给出一行', () => {
    const auto = EnhancementManager.previewEnhancement(ENHANCEMENTS.pistol_auto, new Set());
    const mode = auto.find((delta) => delta.label === '射击模式');
    expect(mode?.before).toBe('单发');
    expect(mode?.after).toBe('全自动');

    const linger = EnhancementManager.previewEnhancement(ENHANCEMENTS.m79_fire_linger, new Set());
    expect(linger.find((delta) => delta.label === '弹着残留')?.after).toBe('燃烧区');
  });

  it('每张卡都至少给出一条可见变化，卡面不会出现空白数值区', () => {
    for (const card of Object.values(ENHANCEMENTS)) {
      expect(
        EnhancementManager.previewEnhancement(card, new Set()).length,
        `${card.id} 没有任何可展示的数值变化`,
      ).toBeGreaterThan(0);
    }
  });
});
