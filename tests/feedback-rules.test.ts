import { describe, expect, it } from 'vitest';
import {
  DAMAGE_NUMBER_BUDGET,
  canTriggerSlowMotion,
  isEmphasizedDamage,
  resolveDamageNumberAdmission,
  resolveShake,
  resolveSlowMotion,
  type FeedbackTier,
} from '../src/systems/FeedbackRules';

describe('反馈分层规则', () => {
  it('震屏强度按档位递减，C 档不震屏', () => {
    const s = resolveShake('S');
    const a = resolveShake('A');
    const b = resolveShake('B');

    expect(s).not.toBeNull();
    expect(a).not.toBeNull();
    expect(b).not.toBeNull();
    expect(s!.intensity).toBeGreaterThan(a!.intensity);
    expect(a!.intensity).toBeGreaterThan(b!.intensity);
    expect(resolveShake('C')).toBeNull();
  });

  it('只有 S/A 档配置慢动作', () => {
    expect(resolveSlowMotion('S')).not.toBeNull();
    expect(resolveSlowMotion('A')).not.toBeNull();
    expect(resolveSlowMotion('B')).toBeNull();
    expect(resolveSlowMotion('C')).toBeNull();
  });

  it('S 档比 A 档更慢、更久、优先级更高', () => {
    const s = resolveSlowMotion('S')!;
    const a = resolveSlowMotion('A')!;
    expect(s.scale).toBeLessThan(a.scale);
    expect(s.duration).toBeGreaterThan(a.duration);
    expect(s.priority).toBeGreaterThan(a.priority);
  });

  it('慢动作冷却期内同级请求被拒绝，更高级可以打断', () => {
    const a = resolveSlowMotion('A')!;
    const s = resolveSlowMotion('S')!;

    // 冷却未结束且当前没有慢动作在播：同级请求必须等。
    expect(canTriggerSlowMotion(a, 1000, 5000, null)).toBe(false);
    // 冷却结束后放行。
    expect(canTriggerSlowMotion(a, 6000, 5000, null)).toBe(true);
    // A 档正在播时，S 档可以立即打断。
    expect(canTriggerSlowMotion(s, 1000, 5000, a.priority)).toBe(true);
    // 反过来，A 档不能打断 S 档。
    expect(canTriggerSlowMotion(a, 1000, 5000, s.priority)).toBe(false);
  });

  it('强调类伤害与普通伤害区分正确', () => {
    expect(isEmphasizedDamage('normal')).toBe(false);
    for (const kind of ['critical', 'execute', 'pierce', 'explosion'] as const) {
      expect(isEmphasizedDamage(kind)).toBe(true);
    }
  });

  it('高密度时普通伤害数字降级，强调类始终可见', () => {
    const { softLimit, hardLimit } = DAMAGE_NUMBER_BUDGET;

    expect(resolveDamageNumberAdmission('normal', 0)).toBe('show');
    expect(resolveDamageNumberAdmission('normal', softLimit - 1)).toBe('show');
    // 超过软上限后普通数字丢弃，强调类照常显示。
    expect(resolveDamageNumberAdmission('normal', softLimit)).toBe('skip');
    expect(resolveDamageNumberAdmission('critical', softLimit)).toBe('show');
    // 超过硬上限后强调类先回收最早的再复用，普通数字仍然丢弃。
    expect(resolveDamageNumberAdmission('normal', hardLimit)).toBe('skip');
    expect(resolveDamageNumberAdmission('explosion', hardLimit)).toBe('recycle');
  });

  it('软上限必须小于硬上限，否则降级策略无效', () => {
    expect(DAMAGE_NUMBER_BUDGET.softLimit).toBeLessThan(DAMAGE_NUMBER_BUDGET.hardLimit);
  });

  it('四个档位都有明确定义，不存在漏配', () => {
    const tiers: FeedbackTier[] = ['S', 'A', 'B', 'C'];
    for (const tier of tiers) {
      expect(() => resolveShake(tier)).not.toThrow();
      expect(() => resolveSlowMotion(tier)).not.toThrow();
    }
  });
});
