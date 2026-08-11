import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { AmmoType } from '../src/config/types';
import { TESTING_FLAGS, TESTING_WEAPON_ORDER } from '../src/config/testing';
import { WEAPON_LIBRARY } from '../src/config/weaponLibrary';
import { WEAPONS } from '../src/config/weapons';
import { ZOMBIES, isBossZombie } from '../src/config/zombies';
import { createInitialState } from '../src/systems/GameState';
import { ProjectileImpact } from '../src/systems/ProjectileImpact';

describe('正式武器经济', () => {
  it('八张透明武器运行时 PNG 已生成', () => {
    for (const weaponId of TESTING_WEAPON_ORDER) {
      const assetUrl = new URL(`../src/assets/processed/weapons/${weaponId}.png`, import.meta.url);
      const assetPath = fileURLToPath(assetUrl);
      expect(existsSync(assetPath)).toBe(true);
      expect(readFileSync(assetPath).subarray(0, 8)).toEqual(
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      );
    }
  });

  it('默认新局只配发满弹匣的无限弹手枪', () => {
    const state = createInitialState('level', 'level_1');
    expect(TESTING_FLAGS.unlockAllWeapons).toBe(false);
    expect(state.player.ownedWeapons).toEqual(['pistol']);
    expect(state.player.currentWeaponId).toBe('pistol');
    expect(state.player.ammoInMag).toEqual({ pistol: WEAPONS.pistol.magazineSize });
    expect(state.player.ammoReserve).toEqual({ light: 0, heavy: 0, shell: 0, explosive: 0 });
  });

  it('全部战场武器都有正式敌人掉落来源', () => {
    for (const entry of WEAPON_LIBRARY) {
      if (entry.availability.kind !== 'enemyDrop') continue;
      const weaponId = entry.availability.weaponId;
      const sources = Object.values(ZOMBIES).filter((zombie) => zombie.drops.some(
        (drop) => drop.type === 'weapon' && drop.itemId === weaponId,
      ));
      expect(sources.length, `${weaponId} 没有正式掉落来源`).toBeGreaterThan(0);
    }
  });

  it('全部有限弹药武器都有补给来源，爆炸弹同时来自普通敌人与 Boss', () => {
    const ammoSources: Array<{ zombieId: string; ammoType: AmmoType }> = [];
    for (const zombie of Object.values(ZOMBIES)) {
      for (const drop of zombie.drops) {
        if (drop.type !== 'ammo' || drop.amount <= 0) continue;
        ammoSources.push({ zombieId: zombie.id, ammoType: drop.ammoType });
      }
    }

    for (const weapon of Object.values(WEAPONS)) {
      if (weapon.infiniteAmmo) continue;
      expect(
        ammoSources.some((source) => source.ammoType === weapon.ammoType),
        `${weapon.id} 的 ${weapon.ammoType} 弹药没有补给来源`,
      ).toBe(true);
    }

    const explosiveSources = ammoSources.filter((source) => source.ammoType === 'explosive');
    expect(explosiveSources.some((source) => !isBossZombie(source.zombieId))).toBe(true);
    expect(explosiveSources.some((source) => isBossZombie(source.zombieId))).toBe(true);
  });

  it('命中爆炸效果只能消费一次', () => {
    const impact = new ProjectileImpact();
    const effect = { kind: 'explosion' as const, damage: 120, radius: 90 };
    impact.reset(effect);
    expect(impact.consume()).toEqual(effect);
    expect(impact.consume()).toBeNull();
  });
});
