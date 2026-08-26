import { describe, expect, it } from 'vitest';
import { DEFAULT_KEYBINDS, MENU_KEY } from '../src/config/keybinds';
import { CARRYABLE_ITEM_IDS, ITEMS, isCarryableItem } from '../src/config/items';
import { LEVELS } from '../src/config/levels';
import { MEDICINES, MEDICINE_IDS } from '../src/config/medicine';
import { MONSTER_LIBRARY } from '../src/config/monsterLibrary';
import { WEAPON_LIBRARY, getWeaponDefinition } from '../src/config/weaponLibrary';
import { WEAPONS, getWeaponDef, type WeaponId } from '../src/config/weapons';
import { ZOMBIES } from '../src/config/zombies';
import { validateGameConfig } from '../src/config/validate';
import { getWaveEnemyEntries } from '../src/config/waveShape';
import type { WeaponDef, ZombieDef } from '../src/config/types';

describe('游戏配置完整性', () => {
  it('运行时校验器没有发现错误', () => {
    expect(validateGameConfig()).toEqual([]);
  });

  it('配置键与实体 id 一致', () => {
    expect(Object.keys(WEAPONS)).toHaveLength(17);
    for (const [id, weapon] of Object.entries(WEAPONS)) expect(weapon.id).toBe(id);
    for (const [id, zombie] of Object.entries(ZOMBIES)) expect(zombie.id).toBe(id);
    for (const [id, item] of Object.entries(ITEMS)) expect(item.id).toBe(id);
  });

  it('关卡中的敌人、Boss 和场景物都有真实定义', () => {
    for (const level of LEVELS) {
      expect(level.name.trim().length).toBeGreaterThan(0);
      expect(level.briefing.trim().length).toBeGreaterThan(0);
      for (const placement of level.props) {
        expect(ITEMS[placement.type as keyof typeof ITEMS]).toBeDefined();
        expect(ITEMS[placement.type as keyof typeof ITEMS]?.scenePlaceable).toBe(true);
      }
      for (const wave of level.waves) {
        for (const enemy of getWaveEnemyEntries(wave)) {
          expect(ZOMBIES[enemy.type]).toBeDefined();
          expect(enemy.count).toBeGreaterThan(0);
        }
      }
      if (level.boss) expect(ZOMBIES[level.boss.type]).toBeDefined();
    }
  });

  it('所有掉落引用都指向正确类别', () => {
    for (const zombie of Object.values(ZOMBIES) as ZombieDef[]) {
      for (const drop of zombie.drops) {
        if (drop.type === 'weapon') expect(WEAPONS[drop.itemId as keyof typeof WEAPONS]).toBeDefined();
        // 道具掉落必须可携带：不可携带的道具拾取时 addItem 返回 0，掉落物会一直留在地上。
        if (drop.type === 'item') expect(isCarryableItem(String(drop.itemId))).toBe(true);
        if (drop.type === 'medicine') expect(MEDICINES[drop.medicineId]).toBeDefined();
        if (drop.type === 'ammo') {
          expect(['adaptive', 'fixed']).toContain(drop.ammoMode);
          if (drop.ammoMode === 'fixed') expect(drop.amount).toBeGreaterThan(0);
        }
        expect(drop.chance).toBeGreaterThanOrEqual(0);
        expect(drop.chance).toBeLessThanOrEqual(1);
      }
    }
  });

  it('每种药品与每种可携带道具都至少有一个感染体掉落来源', () => {
    // 两者都是纯局内消耗品，没有掉落来源就等于开局配额打完即失效。
    const drops = (Object.values(ZOMBIES) as ZombieDef[]).flatMap((zombie) => zombie.drops);
    for (const medicineId of MEDICINE_IDS) {
      expect(
        drops.some((drop) => drop.type === 'medicine' && drop.medicineId === medicineId),
        `药品 ${medicineId} 没有掉落来源`,
      ).toBe(true);
    }
    for (const itemId of CARRYABLE_ITEM_IDS) {
      expect(
        drops.some((drop) => drop.type === 'item' && drop.itemId === itemId),
        `道具 ${itemId} 没有掉落来源`,
      ).toBe(true);
    }
  });

  it('怪物图鉴无重复且完整覆盖玩法配置', () => {
    const configured = Object.keys(ZOMBIES).sort();
    const documented = MONSTER_LIBRARY.map((entry) => entry.id).sort();
    expect(new Set(documented).size).toBe(documented.length);
    expect(documented).toEqual(configured);
  });

  it('已开放武器档案都能解析到战斗配置', () => {
    for (const entry of WEAPON_LIBRARY) {
      if (entry.availability.kind === 'unavailable') continue;
      expect(getWeaponDefinition(entry)).toBeDefined();
    }
  });

  it('特殊能力都提供可反应前摇、合法距离与完整执行参数', () => {
    for (const zombie of Object.values(ZOMBIES)) {
      const definition = zombie as ZombieDef;
      const abilities = [
        ...(definition.ability ? [definition.ability] : []),
        ...(definition.bossPhases ?? []).flatMap((phase) => phase.unlockAbilities ?? []),
      ];
      for (const ability of abilities) {
        expect(ability.windup).toBeGreaterThanOrEqual(250);
        expect(ability.cooldown).toBeGreaterThan(ability.windup);
        expect(ability.recovery).toBeGreaterThan(0);
        expect(ability.maxRange).toBeGreaterThan(ability.minRange);
        if (ability.recoveryDamageMultiplier !== undefined) {
          expect(ability.recoveryDamageMultiplier).toBeGreaterThan(1);
          expect(ability.recoveryDamageMultiplier).toBeLessThanOrEqual(2);
        }

        if (ability.kind === 'ranged') {
          expect(ability.projectileSpeed).toBeGreaterThan(0);
          expect(ability.projectileRange).toBeGreaterThan(ability.maxRange);
        } else if (ability.kind === 'dash') {
          expect(ability.dashSpeed).toBeGreaterThan(definition.speed);
          expect(ability.dashDuration).toBeGreaterThan(0);
        } else {
          expect(ability.radius).toBeGreaterThan(0);
          expect(ability.damage).toBeGreaterThan(0);
        }
      }
    }
  });

  it('Boss 阶段阈值递减且解锁能力不会覆盖基础能力', () => {
    for (const zombie of Object.values(ZOMBIES)) {
      const definition = zombie as ZombieDef;
      const phases = definition.bossPhases ?? [];
      let previousThreshold = 1;
      for (const phase of phases) {
        expect(phase.healthRatio).toBeGreaterThan(0);
        expect(phase.healthRatio).toBeLessThan(previousThreshold);
        expect(phase.label.length).toBeGreaterThan(0);
        previousThreshold = phase.healthRatio;
      }
    }

    expect(ZOMBIES.tank_boss.ability.kind).toBe('shockwave');
    expect(ZOMBIES.tank_boss.ability.recoveryDamageMultiplier).toBe(1.2);
    expect(ZOMBIES.tank_boss.bossPhases[0].unlockAbilities[0].kind).toBe('dash');
    expect(ZOMBIES.tank_boss.bossPhases[0].unlockAbilities[0].recoveryDamageMultiplier).toBe(1.45);
    expect(ZOMBIES.bomber_boss.ability.kind).toBe('bombard');
    expect(ZOMBIES.bomber_boss.bossPhases[0].healthRatio).toBe(0.5);
    const bomberShockwave = ZOMBIES.bomber_boss.bossPhases[0].unlockAbilities[0];
    expect(bomberShockwave.kind).toBe('shockwave');
    expect(bomberShockwave.maxRange).toBeLessThan(ZOMBIES.bomber_boss.ability.minRange);
    if (bomberShockwave.kind === 'shockwave') {
      expect(bomberShockwave.triggerProps).toBe(true);
    }

    expect(ZOMBIES.hunter_boss.ability.kind).toBe('dash');
    expect(ZOMBIES.hunter_boss.bossPhases[0].healthRatio).toBe(0.5);
    const hunterShockwave = ZOMBIES.hunter_boss.bossPhases[0].unlockAbilities[0];
    expect(hunterShockwave.kind).toBe('shockwave');
    expect(hunterShockwave.maxRange).toBeLessThan(ZOMBIES.hunter_boss.ability.minRange);

    expect(ZOMBIES.matriarch_boss.ability.kind).toBe('ranged');
    expect(ZOMBIES.matriarch_boss.bossPhases[0].healthRatio).toBe(0.6);
    expect(ZOMBIES.matriarch_boss.bossPhases[0].unlockAbilities[0].kind).toBe('bombard');
  });

  it('启动期校验拒绝无效的恢复期受伤倍率', () => {
    const ability = ZOMBIES.tank_boss.ability;
    const originalMultiplier = ability.recoveryDamageMultiplier;

    try {
      for (const invalidMultiplier of [1, 2.01, 0]) {
        ability.recoveryDamageMultiplier = invalidMultiplier;
        expect(validateGameConfig()).toContain('tank_boss 的恢复期受伤倍率必须大于 1 且不超过 2');
      }
    } finally {
      ability.recoveryDamageMultiplier = originalMultiplier;
    }
  });

  it('爆炸武器使用独立弹药并提供命中爆炸配置', () => {
    for (const weaponId of ['rpg', 'm79'] as const) {
      const weapon = WEAPONS[weaponId];
      expect(weapon.ammoType).toBe('explosive');
      expect(weapon.impactEffect?.kind).toBe('explosion');
      expect(weapon.impactEffect?.damage).toBeGreaterThan(0);
      expect(weapon.impactEffect?.radius).toBeGreaterThan(0);
    }
  });

  it('武器反弹次数只允许 0 或 1，避免超出单次弹跳机制的设计范围', () => {
    for (const weaponId of Object.keys(WEAPONS) as WeaponId[]) {
      const weapon = getWeaponDef(weaponId);
      if (weapon.bounceCount === undefined) continue;
      expect(Number.isInteger(weapon.bounceCount)).toBe(true);
      expect(weapon.bounceCount).toBeGreaterThanOrEqual(0);
      expect(weapon.bounceCount).toBeLessThanOrEqual(1);
    }
  });

  it('启动期校验拒绝非法反弹次数', () => {
    const m79 = getWeaponDef('m79');
    const originalBounceCount = m79.bounceCount;

    try {
      for (const validBounceCount of [0, 1]) {
        m79.bounceCount = validBounceCount;
        expect(validateGameConfig()).not.toContain('武器 m79 的反弹次数必须是 0 或 1');
      }
      for (const invalidBounceCount of [-1, 0.5, 2]) {
        m79.bounceCount = invalidBounceCount;
        expect(validateGameConfig()).toContain('武器 m79 的反弹次数必须是 0 或 1');
      }
    } finally {
      m79.bounceCount = originalBounceCount;
    }
  });

  it('启动期校验拒绝未知的击杀慢动作档位', () => {
    const barrett = getWeaponDef('barrett');
    const originalTier = barrett.killSlowMotionTier;

    try {
      barrett.killSlowMotionTier = 'B' as WeaponDef['killSlowMotionTier'];
      expect(validateGameConfig()).toContain('武器 barrett 的击杀慢动作档位必须是 A 或 S');
    } finally {
      barrett.killSlowMotionTier = originalTier;
    }
  });
});

describe('暂停菜单键', () => {
  it('ESC 不在可重绑定动作里，也没有被其它动作占用', () => {
    // 菜单是战局唯一的暂停与退出通道；一旦它能被改绑或撞键，玩家就可能失去出口。
    expect(MENU_KEY).toBe('ESC');
    expect(Object.keys(DEFAULT_KEYBINDS)).not.toContain('pause');
    expect(Object.values(DEFAULT_KEYBINDS)).not.toContain(MENU_KEY);
  });

  it('五个武器槽都有独立数字键且不占用暂停键', () => {
    expect([
      DEFAULT_KEYBINDS.weapon1,
      DEFAULT_KEYBINDS.weapon2,
      DEFAULT_KEYBINDS.weapon3,
      DEFAULT_KEYBINDS.weapon4,
      DEFAULT_KEYBINDS.weapon5,
    ]).toEqual(['ONE', 'TWO', 'THREE', 'FOUR', 'FIVE']);
  });
});
