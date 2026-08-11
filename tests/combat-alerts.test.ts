import { describe, expect, it } from 'vitest';
import {
  createBossAbilityAlert,
  createEmptyAmmoAlert,
  shouldPresentCombatAlert,
} from '../src/config/combatAlerts';
import { ZOMBIES } from '../src/config/zombies';

describe('战斗警报契约', () => {
  it('空弹警报区分自动换弹与备用弹耗尽', () => {
    expect(createEmptyAmmoAlert(true)).toMatchObject({
      key: 'weapon-empty',
      tone: 'warning',
      subtitle: '自动换弹已启动',
    });
    expect(createEmptyAmmoAlert(false).subtitle).toBe('当前没有可用备用弹药');
  });

  it('四类 Boss 能力都有稳定文案，显示时长与真实前摇一致', () => {
    const cases = [
      [ZOMBIES.tank_boss.ability, '震荡冲击蓄力'],
      [ZOMBIES.bomber_boss.ability, '区域轰炸锁定'],
      [ZOMBIES.hunter_boss.ability, '定向冲锋蓄力'],
      [ZOMBIES.matriarch_boss.ability, '远程攻击蓄力'],
    ] as const;

    for (const [ability, title] of cases) {
      const alert = createBossAbilityAlert('测试首领', ability);
      expect(alert.title).toBe(title);
      expect(alert.tone).toBe('danger');
      expect(alert.duration).toBe(ability.windup);
    }
  });

  it('低优先级不能覆盖危险警报，同 key 可以刷新', () => {
    const danger = createBossAbilityAlert('巨型坦克', ZOMBIES.tank_boss.ability);
    const warning = createEmptyAmmoAlert(false);

    expect(shouldPresentCombatAlert(danger, warning)).toBe(false);
    expect(shouldPresentCombatAlert(warning, danger)).toBe(true);
    expect(shouldPresentCombatAlert(danger, { ...danger, duration: danger.duration + 100 })).toBe(true);
  });
});
