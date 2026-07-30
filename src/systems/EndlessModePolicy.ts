export const ENDLESS_PROP_LIMIT = 12;
export const ENDLESS_PROP_MIN_DISTANCE = 72;

/** 达到上限后回收最早生成的场景物，保证长局对象数量稳定。 */
export function getOldestEndlessProp<T extends { spawnedAt: number }>(props: readonly T[]): T | null {
  if (props.length < ENDLESS_PROP_LIMIT) return null;
  return props.reduce((oldest, prop) => (prop.spawnedAt < oldest.spawnedAt ? prop : oldest));
}
