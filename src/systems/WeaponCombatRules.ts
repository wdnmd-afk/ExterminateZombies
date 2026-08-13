import type { DamageDropoffStop } from '../config/types';

/**
 * 武器命中期结算规则。纯逻辑，便于单测。
 *
 * 依据 `docs/design/FUN_FIRST_DESIGN.md` §2：每把武器的爽感瞬间由这些规则支撑，
 * 数值与联动记录见 `docs/execution/2026-08-12-g2-weapon-feel.md`。
 */

/** 移动射击的完整散射惩罚倍率。承受比例为 1 的武器移动时散射变为该倍。 */
export const MOVING_SPREAD_PENALTY = 2.5;

/** 击退衰减的基准体型半径。等于普通感染体 `walker` 的半径，因此它承受 100% 击退。 */
export const KNOCKBACK_BASE_RADIUS = 14;

/** 体型再大也保留一点击退反馈，否则重型敌人命中会完全没有受击感。 */
export const KNOCKBACK_MIN_SCALE = 0.25;

export interface ObstacleBounds {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export type ObstacleBounceSurface = 'left' | 'right' | 'top' | 'bottom';

/**
 * 根据上一帧到当前帧的运动线段求弹体进入障碍 AABB 的表面。
 * Arcade overlap 不提供碰撞法线；扫掠入口比“相对障碍中心”更适合长条和旋转后 AABB。
 */
export function resolveObstacleBounceSurface(
  previousX: number,
  previousY: number,
  currentX: number,
  currentY: number,
  bounds: ObstacleBounds,
  radius: number,
): ObstacleBounceSurface {
  const expanded = {
    left: bounds.left - radius,
    right: bounds.right + radius,
    top: bounds.top - radius,
    bottom: bounds.bottom + radius,
  };
  const dx = currentX - previousX;
  const dy = currentY - previousY;
  const xEntry = dx > 0
    ? { time: (expanded.left - previousX) / dx, surface: 'left' as const }
    : dx < 0
      ? { time: (expanded.right - previousX) / dx, surface: 'right' as const }
      : { time: -Infinity, surface: 'left' as const };
  const yEntry = dy > 0
    ? { time: (expanded.top - previousY) / dy, surface: 'top' as const }
    : dy < 0
      ? { time: (expanded.bottom - previousY) / dy, surface: 'bottom' as const }
      : { time: -Infinity, surface: 'top' as const };
  const xExit = dx > 0
    ? (expanded.right - previousX) / dx
    : dx < 0
      ? (expanded.left - previousX) / dx
      : Infinity;
  const yExit = dy > 0
    ? (expanded.bottom - previousY) / dy
    : dy < 0
      ? (expanded.top - previousY) / dy
      : Infinity;
  const entryTime = Math.max(xEntry.time, yEntry.time);
  const exitTime = Math.min(xExit, yExit);

  if (entryTime <= exitTime && exitTime >= 0 && entryTime <= 1) {
    return xEntry.time >= yEntry.time ? xEntry.surface : yEntry.surface;
  }

  // 上一位置也在 AABB 内时无法还原入口，退化为当前点最近的边界。
  const distances: Array<{ distance: number; surface: ObstacleBounceSurface }> = [
    { distance: Math.abs(currentX - expanded.left), surface: 'left' },
    { distance: Math.abs(expanded.right - currentX), surface: 'right' },
    { distance: Math.abs(currentY - expanded.top), surface: 'top' },
    { distance: Math.abs(expanded.bottom - currentY), surface: 'bottom' },
  ];
  distances.sort((a, b) => a.distance - b.distance);
  return distances[0].surface;
}

/**
 * 移动射击的散射倍率。
 *
 * `movementPenalty` 是"承受惩罚的比例"而不是直接倍率：
 * 直接相乘会让小于 1 的值变成"移动比站着更准"，语义完全反了。
 */
export function resolveSpreadMultiplier(
  movementPenalty: number | undefined,
  isMoving: boolean,
): number {
  if (!isMoving) return 1;
  const ratio = Math.max(0, Math.min(1, movementPenalty ?? 1));
  return 1 + (MOVING_SPREAD_PENALTY - 1) * ratio;
}

/**
 * 按飞行距离取伤害衰减倍率。
 * 取"已越过的最后一档"，未配置或未越过首档时返回 1。
 */
export function resolveDropoffMultiplier(
  stops: readonly DamageDropoffStop[] | undefined,
  travelDistance: number,
): number {
  if (!stops || stops.length === 0) return 1;
  let multiplier = 1;
  for (const stop of stops) {
    if (travelDistance < stop.distance) break;
    multiplier = stop.multiplier;
  }
  return multiplier;
}

/**
 * 穿透加成后的伤害。
 * `hitsBefore` 是这颗子弹在本次命中之前已经击中的目标数，因此第一个目标不吃加成。
 */
export function resolvePierceDamage(
  baseDamage: number,
  chainBonus: number | undefined,
  hitsBefore: number,
): number {
  if (!chainBonus || chainBonus === 1 || hitsBefore <= 0) return baseDamage;
  return baseDamage * chainBonus ** hitsBefore;
}

/**
 * 击退实际距离。体型越大承受越少，避免霰弹把重装敌人当皮球推。
 * Boss 由调用方直接跳过，不走这里。
 */
export function resolveKnockbackDistance(
  baseDistance: number | undefined,
  targetRadius: number,
): number {
  if (!baseDistance || baseDistance <= 0 || targetRadius <= 0) return 0;
  const scale = Math.max(
    KNOCKBACK_MIN_SCALE,
    Math.min(1, KNOCKBACK_BASE_RADIUS / targetRadius),
  );
  return baseDistance * scale;
}

/** 目标生命比例是否已低到可以被直接处决。`maxHealth <= 0` 视为无效配置，不处决。 */
export function shouldExecute(
  threshold: number | undefined,
  health: number,
  maxHealth: number,
): boolean {
  if (!threshold || threshold <= 0 || maxHealth <= 0) return false;
  if (health <= 0) return false;
  return health / maxHealth <= threshold;
}

/** 暴击判定。`roll` 由调用方注入，便于单测确定化。 */
export function rollCritical(chance: number | undefined, roll: number): boolean {
  if (!chance || chance <= 0) return false;
  return roll < chance;
}

/** 暴击后的伤害。未配置倍率时按 2 倍兜底，避免出现"暴击了但伤害不变"。 */
export function resolveCriticalDamage(
  baseDamage: number,
  critMultiplier: number | undefined,
): number {
  return baseDamage * Math.max(1, critMultiplier ?? 2);
}
