import type { FeedbackTier } from './FeedbackRules';

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

/** HUD 计数颜色随连杀升温；未达首个里程碑时保持中性色。 */
export function resolveKillStreakColor(streak: number): number {
  let color = 0xf4eedd;
  for (const milestone of KILL_STREAK_MILESTONES) {
    if (streak >= milestone.count) color = milestone.color;
  }
  return color;
}
