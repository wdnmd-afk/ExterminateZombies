/** 数学与几何工具。 */

/** 角度转弧度。 */
export function degToRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/** 两点间距离。 */
export function distance(x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  return Math.sqrt(dx * dx + dy * dy);
}

/** 两点间距离的平方(比较距离时用,省一次开方)。 */
export function distanceSq(x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  return dx * dx + dy * dy;
}

/** 从 (x1,y1) 指向 (x2,y2) 的弧度角。 */
export function angleBetween(x1: number, y1: number, x2: number, y2: number): number {
  return Math.atan2(y2 - y1, x2 - x1);
}

/** 限制在 [min,max]。 */
export function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

/** [min,max) 随机浮点。 */
export function randRange(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

/** [min,max] 随机整数。 */
export function randInt(min: number, max: number): number {
  return Math.floor(min + Math.random() * (max - min + 1));
}

/** 返回打乱后的新数组(Fisher-Yates),不修改入参。 */
export function shuffled<T>(items: readonly T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = randInt(0, i);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
