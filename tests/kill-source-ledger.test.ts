import { describe, expect, it, vi } from 'vitest';
import {
  KILL_SOURCES,
  KILL_SOURCE_LABELS,
  createKillSourceLedger,
  resolveKillSource,
  summarizeKillSources,
} from '../src/systems/KillStreakRules';
import { formatKillSources } from '../src/ui/debrief';

/** 这里只测纯格式化函数，避免 Node 测试环境加载完整 Phaser。 */
vi.mock('phaser', () => ({ default: {} }));

/**
 * 审计缺口 A：击杀来源未入连杀链（`2026-09-09-combat-baseline-audit.md` §6.1）。
 *
 * 这里锁的是纯规则部分：kind → source 的映射、账本初值、摘要排序与结算页文案。
 * `GameScene.registerKill` 的实际累加依赖 Phaser 生命周期，属 V3/V4 实景范围。
 */
describe('击杀来源映射', () => {
  it('五种伤害种类各自映射到对应来源', () => {
    expect(resolveKillSource('normal')).toBe('direct');
    expect(resolveKillSource('critical')).toBe('headshot');
    expect(resolveKillSource('execute')).toBe('execute');
    expect(resolveKillSource('pierce')).toBe('pierce');
    expect(resolveKillSource('explosion')).toBe('explosion');
  });

  it('未传 impact 归入 unknown 而不是 direct', () => {
    // 火焰锥等调用方不传 impact。塞进 direct 会让「直接击杀」吞掉所有未接线来源。
    expect(resolveKillSource(undefined)).toBe('unknown');
  });

  it('每种来源都有中文标签，无遗漏', () => {
    for (const source of KILL_SOURCES) {
      expect(KILL_SOURCE_LABELS[source]).toBeTruthy();
    }
    expect(Object.keys(KILL_SOURCE_LABELS).sort()).toEqual([...KILL_SOURCES].sort());
  });
});

describe('击杀来源账本', () => {
  it('新账本每种来源都是 0', () => {
    const ledger = createKillSourceLedger();
    expect(KILL_SOURCES.every((source) => ledger[source] === 0)).toBe(true);
  });

  it('两次调用互不共享引用', () => {
    // 共享引用会让上一局的击杀数漏进下一局。
    const first = createKillSourceLedger();
    first.direct += 5;
    expect(createKillSourceLedger().direct).toBe(0);
  });

  it('摘要只列非零来源', () => {
    const ledger = createKillSourceLedger();
    ledger.direct = 3;
    ledger.explosion = 7;
    expect(summarizeKillSources(ledger).map((entry) => entry.source)).toEqual([
      'explosion', 'direct',
    ]);
  });

  it('摘要按数量降序，同数按固定顺序稳定排列', () => {
    const ledger = createKillSourceLedger();
    ledger.pierce = 4;
    ledger.headshot = 4;
    ledger.direct = 4;
    // 三者同数：必须回落到 KILL_SOURCES 的声明顺序，保证同一局每次渲染一致。
    expect(summarizeKillSources(ledger).map((entry) => entry.source)).toEqual([
      'direct', 'headshot', 'pierce',
    ]);
  });

  it('全零账本摘要为空数组', () => {
    expect(summarizeKillSources(createKillSourceLedger())).toEqual([]);
  });
});

describe('结算页击杀归因明细', () => {
  it('全零时显示占位文案而不是空字符串', () => {
    expect(formatKillSources(createKillSourceLedger())).toBe('暂无');
  });

  it('只展示非零来源并沿用稳定排序', () => {
    const ledger = createKillSourceLedger();
    ledger.direct = 12;
    ledger.headshot = 3;
    ledger.explosion = 5;
    expect(formatKillSources(ledger)).toBe('直接 12  /  爆炸 5  /  爆头 3');
  });

  it('缺失来源键时按 0 计', () => {
    // 旧场景数据可能只带部分键；结算页不能因此显示空洞分隔符。
    const partial = { direct: 4 } as unknown as Record<
      (typeof KILL_SOURCES)[number], number
    >;
    expect(formatKillSources(partial)).toBe('直接 4');
  });
});
