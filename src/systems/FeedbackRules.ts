/**
 * 反馈分层规则。
 *
 * 依据 `docs/design/FUN_FIRST_DESIGN.md` §1 法则 2：反馈必须分级，
 * 否则普通击杀和 Boss 击杀一样响，高潮就被稀释掉。
 * 这里只放纯计算，便于单测；实际播放由 GameScene 与各管理器执行。
 */

/** 反馈强度档位。S 最强，C 最弱。 */
export type FeedbackTier = 'S' | 'A' | 'B' | 'C';

export interface ShakeSpec {
  duration: number;
  intensity: number;
}

/** 分级震屏参数。数值对齐既有 `cameras.main.shake` 的量级，避免高密度战斗晕眩。 */
const SHAKE_BY_TIER: Record<FeedbackTier, ShakeSpec | null> = {
  S: { duration: 420, intensity: 0.0085 },
  A: { duration: 220, intensity: 0.0045 },
  B: { duration: 90, intensity: 0.0016 },
  C: null,
};

export function resolveShake(tier: FeedbackTier): ShakeSpec | null {
  return SHAKE_BY_TIER[tier];
}

export function accessibilityFactor(level: 'off' | 'low' | 'medium' | 'high'): number {
  return level === 'off' ? 0 : level === 'low' ? 0.35 : level === 'medium' ? 0.65 : 1;
}

export interface SlowMotionSpec {
  /** 时间缩放比例，0-1，越小越慢。 */
  scale: number;
  /** 持续毫秒。 */
  duration: number;
  /** 优先级，高的可以打断低的。 */
  priority: number;
}

/**
 * 分级慢动作参数。
 *
 * 只有 S/A 两档会触发慢动作：B/C 级事件在高密度战斗中每秒发生数十次，
 * 一旦触发慢动作会导致整局卡顿感而不是爽感。
 */
const SLOW_MOTION_BY_TIER: Record<FeedbackTier, SlowMotionSpec | null> = {
  S: { scale: 0.28, duration: 900, priority: 2 },
  A: { scale: 0.45, duration: 280, priority: 1 },
  B: null,
  C: null,
};

export function resolveSlowMotion(tier: FeedbackTier): SlowMotionSpec | null {
  return SLOW_MOTION_BY_TIER[tier];
}

/**
 * 慢动作是否允许触发。
 *
 * 规则：同级或更低级的请求必须等冷却结束；更高级的请求可以立刻打断当前慢动作。
 * 没有这条，密集击杀会把整段战斗拖成连续慢放。
 */
export function canTriggerSlowMotion(
  incoming: SlowMotionSpec,
  now: number,
  cooldownUntil: number,
  activePriority: number | null,
): boolean {
  if (activePriority !== null && incoming.priority > activePriority) return true;
  return now >= cooldownUntil;
}

export interface DamageNumberBudget {
  /** 超过这个数量后，普通伤害数字不再新增。 */
  softLimit: number;
  /** 超过这个数量后，回收最早的一个再复用。 */
  hardLimit: number;
}

export const DAMAGE_NUMBER_BUDGET: DamageNumberBudget = { softLimit: 18, hardLimit: 30 };

/** 强调类伤害数字（暴击、处决、穿透、爆炸）不参与软上限降级，必须始终可见。 */
export type DamageNumberKind = 'normal' | 'critical' | 'execute' | 'pierce' | 'explosion';

const EMPHASIZED_KINDS: ReadonlySet<DamageNumberKind> = new Set<DamageNumberKind>([
  'critical',
  'execute',
  'pierce',
  'explosion',
]);

export function isEmphasizedDamage(kind: DamageNumberKind): boolean {
  return EMPHASIZED_KINDS.has(kind);
}

/**
 * 一次伤害的命中信息，供伤害数字与尸体击退共用。
 * `angle` 是伤害推进方向（弧度）；来源不明确时传 null，尸体只做原地淡出。
 */
export interface DamageImpact {
  angle: number | null;
  kind: DamageNumberKind;
}

/**
 * 判定一条伤害数字是否应当显示。
 * 返回 `'show'` 直接新增，`'recycle'` 表示需要先回收最早的，`'skip'` 表示本条丢弃。
 */
export function resolveDamageNumberAdmission(
  kind: DamageNumberKind,
  activeCount: number,
  budget: DamageNumberBudget = DAMAGE_NUMBER_BUDGET,
): 'show' | 'recycle' | 'skip' {
  if (activeCount >= budget.hardLimit) {
    return isEmphasizedDamage(kind) ? 'recycle' : 'skip';
  }
  if (activeCount >= budget.softLimit && !isEmphasizedDamage(kind)) return 'skip';
  return 'show';
}
