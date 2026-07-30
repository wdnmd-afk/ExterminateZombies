import { describe, expect, it } from 'vitest';
import type { ZombieAbilityDef } from '../src/config/types';
import { canStartZombieAbility } from '../src/systems/EnemyAbilityRules';
import {
  ENDLESS_PROP_LIMIT,
  getOldestEndlessProp,
} from '../src/systems/EndlessModePolicy';

const DASH_ABILITY: ZombieAbilityDef = {
  kind: 'dash',
  cooldown: 3000,
  windup: 400,
  recovery: 350,
  minRange: 100,
  maxRange: 360,
  dashSpeed: 320,
  dashDuration: 300,
};

describe('敌方能力触发规则', () => {
  it('距离和所有时间窗口满足时允许进入前摇', () => {
    expect(canStartZombieAbility(DASH_ABILITY, 180, 5000, 4000, 4500, 4300)).toBe(true);
  });

  it('冷却、恢复、冲刺或距离任一不满足时禁止触发', () => {
    expect(canStartZombieAbility(DASH_ABILITY, 180, 3900, 4000, 3500, 3500)).toBe(false);
    expect(canStartZombieAbility(DASH_ABILITY, 180, 3900, 3000, 4000, 3500)).toBe(false);
    expect(canStartZombieAbility(DASH_ABILITY, 80, 5000, 4000, 4500, 4300)).toBe(false);
    expect(canStartZombieAbility(DASH_ABILITY, 400, 5000, 4000, 4500, 4300)).toBe(false);
  });
});

describe('无尽场景物上限', () => {
  it('未达到上限时不回收', () => {
    const props = Array.from({ length: ENDLESS_PROP_LIMIT - 1 }, (_, index) => ({ spawnedAt: index }));
    expect(getOldestEndlessProp(props)).toBeNull();
  });

  it('达到上限时选择最早生成的对象', () => {
    const props = Array.from({ length: ENDLESS_PROP_LIMIT }, (_, index) => ({
      id: index,
      spawnedAt: 100 + index,
    }));
    props[7].spawnedAt = 3;
    expect(getOldestEndlessProp(props)?.id).toBe(7);
  });
});
