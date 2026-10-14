import type { LurePlacement } from '../config/types';
import { LURE_SETTINGS } from '../config/tacticalDevices';
import { distanceSq } from '../utils/math';

export interface LureState extends LurePlacement {
  chargesLeft: number;
  activeUntil: number;
  readyAt: number;
}

export type LurePhase = 'ready' | 'broadcasting' | 'cooldown' | 'exhausted';

const AFFECTED_TYPES = new Set<string>(LURE_SETTINGS.affectedTypes);

export function createLureState(placement: LurePlacement): LureState {
  return { ...placement, chargesLeft: LURE_SETTINGS.charges, activeUntil: -Infinity, readyAt: 0 };
}

export function getLurePhase(state: LureState, now: number): LurePhase {
  if (now < state.activeUntil) return 'broadcasting';
  if (state.chargesLeft <= 0) return 'exhausted';
  return now < state.readyAt ? 'cooldown' : 'ready';
}

export function activateLure(states: readonly LureState[], id: string, now: number): boolean {
  if (!Number.isFinite(now) || now < 0) return false;
  const target = states.find((state) => state.id === id);
  if (!target || getLurePhase(target, now) !== 'ready') return false;
  for (const state of states) {
    // 切换广播立即失去旧声源，但不能以切换返还使用次数或跳过冷却。
    if (state.activeUntil > now) {
      state.activeUntil = now;
      state.readyAt = now + LURE_SETTINGS.cooldownMs;
    }
  }
  target.chargesLeft -= 1;
  target.activeUntil = now + LURE_SETTINGS.durationMs;
  target.readyAt = target.activeUntil + LURE_SETTINGS.cooldownMs;
  return true;
}

export function findNearbyLure(
  states: readonly LureState[],
  player: { x: number; y: number },
): LureState | null {
  let nearest: LureState | null = null;
  let nearestDistance = LURE_SETTINGS.interactionRadius ** 2;
  for (const state of states) {
    const distance = distanceSq(player.x, player.y, state.x, state.y);
    if (distance > nearestDistance) continue;
    nearestDistance = distance;
    nearest = state;
  }
  return nearest;
}

export function resolveLureTarget(
  states: readonly LureState[],
  now: number,
  zombie: { typeId: string; x: number; y: number },
  player: { x: number; y: number },
): LureState | null {
  if (!AFFECTED_TYPES.has(zombie.typeId)) return null;
  if (distanceSq(zombie.x, zombie.y, player.x, player.y) <= LURE_SETTINGS.playerPriorityRadius ** 2) {
    return null;
  }
  return states.find((state) => getLurePhase(state, now) === 'broadcasting'
    && distanceSq(zombie.x, zombie.y, state.x, state.y) <= LURE_SETTINGS.attractionRadius ** 2) ?? null;
}

export function shiftLureTimers(states: readonly LureState[], offset: number): void {
  if (!Number.isFinite(offset) || offset <= 0) return;
  for (const state of states) {
    state.activeUntil += offset;
    if (state.readyAt > 0) state.readyAt += offset;
  }
}
