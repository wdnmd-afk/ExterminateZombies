import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { TESTING_AMMO_RESERVE, TESTING_WEAPON_ORDER } from '../src/config/testing';
import { WEAPONS } from '../src/config/weapons';
import { createInitialState } from '../src/systems/GameState';
import { ProjectileImpact } from '../src/systems/ProjectileImpact';

describe('全武器测试配发', () => {
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

  it('新局拥有全部八把武器和满弹匣', () => {
    const state = createInitialState('level', 'level_1');
    expect(state.player.ownedWeapons).toEqual(TESTING_WEAPON_ORDER);
    for (const weaponId of TESTING_WEAPON_ORDER) {
      expect(state.player.ammoInMag[weaponId]).toBe(WEAPONS[weaponId].magazineSize);
    }
    expect(state.player.ammoReserve).toEqual(TESTING_AMMO_RESERVE);
    expect(state.player.ammoReserve.explosive).toBeGreaterThan(0);
  });

  it('命中爆炸效果只能消费一次', () => {
    const impact = new ProjectileImpact();
    const effect = { kind: 'explosion' as const, damage: 120, radius: 90 };
    impact.reset(effect);
    expect(impact.consume()).toEqual(effect);
    expect(impact.consume()).toBeNull();
  });
});
