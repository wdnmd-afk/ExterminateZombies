import { describe, expect, it } from 'vitest';
import { DEFAULT_KEYBINDS, MENU_KEY } from '../src/config/keybinds';
import { ITEMS } from '../src/config/items';
import { LEVELS } from '../src/config/levels';
import { MONSTER_LIBRARY } from '../src/config/monsterLibrary';
import { WEAPON_LIBRARY, getWeaponDefinition } from '../src/config/weaponLibrary';
import { WEAPONS } from '../src/config/weapons';
import { ZOMBIES } from '../src/config/zombies';
import { validateGameConfig } from '../src/config/validate';
import type { ZombieDef } from '../src/config/types';

describe('游戏配置完整性', () => {
  it('运行时校验器没有发现错误', () => {
    expect(validateGameConfig()).toEqual([]);
  });

  it('配置键与实体 id 一致', () => {
    expect(Object.keys(WEAPONS)).toHaveLength(8);
    for (const [id, weapon] of Object.entries(WEAPONS)) expect(weapon.id).toBe(id);
    for (const [id, zombie] of Object.entries(ZOMBIES)) expect(zombie.id).toBe(id);
    for (const [id, item] of Object.entries(ITEMS)) expect(item.id).toBe(id);
  });

  it('关卡中的敌人、Boss 和场景物都有真实定义', () => {
    for (const level of LEVELS) {
      for (const placement of level.props) {
        expect(ITEMS[placement.type as keyof typeof ITEMS]).toBeDefined();
        expect(ITEMS[placement.type as keyof typeof ITEMS]?.category).toBe('prop');
      }
      for (const wave of level.waves) {
        for (const enemy of wave.enemies) {
          expect(ZOMBIES[enemy.type]).toBeDefined();
          expect(enemy.count).toBeGreaterThan(0);
        }
      }
      if (level.boss) expect(ZOMBIES[level.boss.type]).toBeDefined();
    }
  });

  it('所有掉落引用都指向正确类别', () => {
    for (const zombie of Object.values(ZOMBIES)) {
      for (const drop of zombie.drops) {
        if (drop.type === 'weapon') expect(WEAPONS[drop.itemId as keyof typeof WEAPONS]).toBeDefined();
        if (drop.type === 'item') expect(ITEMS[drop.itemId as keyof typeof ITEMS]?.category).toBe('deployable');
        expect(drop.chance).toBeGreaterThanOrEqual(0);
        expect(drop.chance).toBeLessThanOrEqual(1);
      }
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
      const ability = (zombie as ZombieDef).ability;
      if (!ability) continue;
      expect(ability.windup).toBeGreaterThanOrEqual(250);
      expect(ability.cooldown).toBeGreaterThan(ability.windup);
      expect(ability.recovery).toBeGreaterThan(0);
      expect(ability.maxRange).toBeGreaterThan(ability.minRange);

      if (ability.kind === 'ranged') {
        expect(ability.projectileSpeed).toBeGreaterThan(0);
        expect(ability.projectileRange).toBeGreaterThan(ability.maxRange);
      } else if (ability.kind === 'dash') {
        expect(ability.dashSpeed).toBeGreaterThan((zombie as ZombieDef).speed);
        expect(ability.dashDuration).toBeGreaterThan(0);
      } else {
        expect(ability.radius).toBeGreaterThan(0);
        expect(ability.damage).toBeGreaterThan(0);
      }
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
});

describe('暂停菜单键', () => {
  it('ESC 不在可重绑定动作里，也没有被其它动作占用', () => {
    // 菜单是战局唯一的暂停与退出通道；一旦它能被改绑或撞键，玩家就可能失去出口。
    expect(MENU_KEY).toBe('ESC');
    expect(Object.keys(DEFAULT_KEYBINDS)).not.toContain('pause');
    expect(Object.values(DEFAULT_KEYBINDS)).not.toContain(MENU_KEY);
  });
});
