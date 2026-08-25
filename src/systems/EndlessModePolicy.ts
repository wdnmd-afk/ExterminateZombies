export const ENDLESS_PROP_LIMIT = 12;
export const ENDLESS_PROP_MIN_DISTANCE = 72;

export interface EndlessOverdriveSpec {
  streak: number;
  multiplier: number;
  durationMs: number;
  label: string;
  color: number;
}

/**
 * 无尽模式连杀火力档位。
 *
 * 只使用已经存在的 10/20/35 连杀里程碑，避免玩家同时理解两套计数门槛；
 * 后档覆盖前档，不叠乘，防止短时间内把伤害放大到不可解释的数量级。
 */
export const ENDLESS_OVERDRIVE_TIERS: readonly EndlessOverdriveSpec[] = [
  { streak: 10, multiplier: 1.25, durationMs: 6000, label: '火力过载 I', color: 0xffb33d },
  { streak: 20, multiplier: 1.5, durationMs: 8000, label: '火力过载 II', color: 0xff6f3d },
  { streak: 35, multiplier: 1.8, durationMs: 10000, label: '火力过载 III', color: 0xffd964 },
] as const;

export function resolveEndlessOverdrive(streak: number): EndlessOverdriveSpec | null {
  return ENDLESS_OVERDRIVE_TIERS.find((tier) => tier.streak === streak) ?? null;
}

/** 达到上限后回收最早生成的场景物，保证长局对象数量稳定。 */
export function getOldestEndlessProp<T extends { spawnedAt: number }>(props: readonly T[]): T | null {
  if (props.length < ENDLESS_PROP_LIMIT) return null;
  return props.reduce((oldest, prop) => (prop.spawnedAt < oldest.spawnedAt ? prop : oldest));
}
