import type { DamageNumberKind, FeedbackTier } from './FeedbackRules';

/**
 * 连杀规则。纯逻辑，便于单测。
 *
 * 依据 `docs/design/FUN_FIRST_DESIGN.md` §5.2：3 秒窗口内的连续击杀累计，
 * 达到里程碑时播报并触发对应等级的反馈。
 */

/** 两次击杀间隔超过这个毫秒数，连杀归零。 */
export const KILL_STREAK_WINDOW = 3000;

export interface KillStreakMilestone {
  count: number;
  label: string;
  /** 播报文字颜色。 */
  color: number;
  tier: FeedbackTier;
}

/**
 * 里程碑档位。按 count 升序排列，`resolveKillStreakMilestone` 依赖该顺序做精确匹配。
 * 只在恰好达到时播报一次，避免每次击杀都弹字。
 */
export const KILL_STREAK_MILESTONES: readonly KillStreakMilestone[] = [
  { count: 5, label: 'RAMPAGE!', color: 0xfbc02d, tier: 'B' },
  { count: 10, label: 'UNSTOPPABLE!', color: 0xff9236, tier: 'A' },
  { count: 20, label: 'GODLIKE!', color: 0xef4b3a, tier: 'S' },
  { count: 35, label: 'EXTERMINATION!', color: 0xffd964, tier: 'S' },
] as const;

/** 连杀计数在窗口内累加，超时归零后重新从 1 开始。 */
export function advanceKillStreak(
  currentStreak: number,
  lastKillAt: number,
  now: number,
  window: number = KILL_STREAK_WINDOW,
): number {
  if (currentStreak <= 0) return 1;
  return now - lastKillAt > window ? 1 : currentStreak + 1;
}

/** 只有恰好命中里程碑数值时才返回，避免同一档位反复播报。 */
export function resolveKillStreakMilestone(streak: number): KillStreakMilestone | null {
  return KILL_STREAK_MILESTONES.find((milestone) => milestone.count === streak) ?? null;
}

/**
 * 固定关卡的连杀奖励：退还角色主动技能冷却。
 *
 * 与无尽模式的 `ENDLESS_OVERDRIVE_TIERS`（伤害倍率）刻意不同轴，两条理由：
 * 1. 固定关卡是一条设计好的十关难度曲线，直接给伤害倍率会让连杀滚雪球压平后半段，
 *    这正是 `FUN_FIRST_DESIGN` 要避免的平直曲线。
 * 2. 退冷却由 `refundSkillCooldown` 夹在「立刻可用」，天然有上限，
 *    不需要像火力过载那样再设档位覆盖规则。
 *
 * 门槛沿用 `KILL_STREAK_MILESTONES` 的 5/10/20/35，不引入第三套计数阈值。
 * 无尽从 10 起跳而这里从 5 起跳：固定关卡奖励更轻，可以更早给一次正反馈。
 *
 * 数值为首版初稿。上限来自一条硬约束：累计退还（8.3s）必须低于最短技能冷却
 * （相位疾冲 9000ms，见 `config/characters.ts`），否则一条 35 连杀链会让该技能全程可用。
 * 实机试玩后按 `2026-09-09-combat-fun-roadmap.md` §8 记录旧值/新值再调。
 */
export interface KillStreakSkillRefund {
  streak: number;
  /** 退还的冷却毫秒数。 */
  refundMs: number;
  /** 播报文案。 */
  label: string;
}

export const LEVEL_STREAK_SKILL_REFUNDS: readonly KillStreakSkillRefund[] = [
  { streak: 5, refundMs: 800, label: '技能充能 +0.8s' },
  { streak: 10, refundMs: 1500, label: '技能充能 +1.5s' },
  { streak: 20, refundMs: 2500, label: '技能充能 +2.5s' },
  { streak: 35, refundMs: 3500, label: '技能充能 +3.5s' },
] as const;

/** 只在恰好命中里程碑时返回，与 `resolveKillStreakMilestone` 保持同一判定口径。 */
export function resolveLevelStreakRefund(streak: number): KillStreakSkillRefund | null {
  return LEVEL_STREAK_SKILL_REFUNDS.find((tier) => tier.streak === streak) ?? null;
}

/**
 * 击杀来源。
 *
 * 审计缺口 A：`DamageImpact.kind` 此前只喂给伤害数字，`registerKill` 只收一个布尔量，
 * 于是「这只是怎么死的」在击杀层面丢失（见 `2026-09-09-combat-baseline-audit.md` §6.1）。
 * 已有的 `stats.headshots / executions / pierceHits` 记的是**命中**次数而不是击杀数：
 * 一次爆头命中没打死也会 +1，因此无法回答「多少只是被爆头打死的」。
 *
 * 这里刻意复用 `DamageNumberKind` 而不另立一套枚举：来源的唯一真相是伤害结算时
 * 已经算出的那个 kind（`GameScene` 处决 / 爆头 / 签名穿透 / 爆炸的判定顺序），
 * 另立枚举就会出现两套判定漂移。`normal` 在击杀语境下叫 `direct` 更贴切，
 * 其余同名。来源缺失（如火焰锥不传 impact）归入 `unknown`，不硬塞进 `direct`——
 * 否则「直接击杀」会把所有未接线来源都吞掉，数字失去意义。
 */
export type KillSource = 'direct' | 'headshot' | 'execute' | 'pierce' | 'explosion' | 'unknown';

export const KILL_SOURCES: readonly KillSource[] = [
  'direct', 'headshot', 'execute', 'pierce', 'explosion', 'unknown',
] as const;

/** 结算页展示用的中文标签。 */
export const KILL_SOURCE_LABELS: Readonly<Record<KillSource, string>> = {
  direct: '直接',
  headshot: '爆头',
  execute: '处决',
  pierce: '穿透',
  explosion: '爆炸',
  unknown: '其他',
};

/** 伤害种类 → 击杀来源。`undefined` 表示调用方没有传 impact。 */
export function resolveKillSource(kind?: DamageNumberKind): KillSource {
  switch (kind) {
    case 'normal': return 'direct';
    case 'critical': return 'headshot';
    case 'execute': return 'execute';
    case 'pierce': return 'pierce';
    case 'explosion': return 'explosion';
    default: return 'unknown';
  }
}

/** 全零的来源账本。每局与每个结算页都从这里起算，避免各处手写六个字段漏项。 */
export function createKillSourceLedger(): Record<KillSource, number> {
  return { direct: 0, headshot: 0, execute: 0, pierce: 0, explosion: 0, unknown: 0 };
}

/**
 * 结算页摘要：只列出非零来源，按数量降序、同数按固定顺序，保证同一局每次渲染一致。
 * 全零时返回空数组，由调用方决定显示占位文案。
 */
export function summarizeKillSources(
  ledger: Readonly<Record<KillSource, number>>,
): { source: KillSource; label: string; count: number }[] {
  return KILL_SOURCES
    .map((source) => ({ source, label: KILL_SOURCE_LABELS[source], count: ledger[source] ?? 0 }))
    .filter((entry) => entry.count > 0)
    .sort((a, b) => (b.count - a.count) || (KILL_SOURCES.indexOf(a.source) - KILL_SOURCES.indexOf(b.source)));
}

/** HUD 计数颜色随连杀升温；未达首个里程碑时保持中性色。 */
export function resolveKillStreakColor(streak: number): number {
  let color = 0xf4eedd;
  for (const milestone of KILL_STREAK_MILESTONES) {
    if (streak >= milestone.count) color = milestone.color;
  }
  return color;
}
