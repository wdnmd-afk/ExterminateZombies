export type BreakableObstacleStage = 'intact' | 'cracked' | 'collapsed';

export interface BreakableObstacleRuntimeState {
  health: number;
  maxHealth: number;
  crackedHealthRatio: number;
}

export interface BreakableObstacleDamageResult extends BreakableObstacleRuntimeState {
  previousStage: BreakableObstacleStage;
  stage: BreakableObstacleStage;
  damaged: boolean;
  crackedNow: boolean;
  collapsedNow: boolean;
}

/** 按剩余耐久解析显示与碰撞阶段。 */
export function resolveBreakableObstacleStage(
  state: BreakableObstacleRuntimeState,
): BreakableObstacleStage {
  if (state.health <= 0) return 'collapsed';
  if (state.maxHealth > 0 && state.health / state.maxHealth <= state.crackedHealthRatio) {
    return 'cracked';
  }
  return 'intact';
}

/**
 * 结算一次结构伤害。
 *
 * 非有限值、非正伤害和已经坍塌的墙均保持原状态；坍塌只在跨入 0 耐久的那次返回 true，
 * 调用方据此保证碰撞体销毁、范围伤害和慢动作都只触发一次。
 */
export function applyBreakableObstacleDamage(
  state: BreakableObstacleRuntimeState,
  amount: number,
): BreakableObstacleDamageResult {
  const normalized: BreakableObstacleRuntimeState = {
    maxHealth: Math.max(1, Number.isFinite(state.maxHealth) ? state.maxHealth : 1),
    health: Math.max(
      0,
      Math.min(
        Math.max(1, Number.isFinite(state.maxHealth) ? state.maxHealth : 1),
        Number.isFinite(state.health) ? state.health : 0,
      ),
    ),
    crackedHealthRatio: Number.isFinite(state.crackedHealthRatio)
      ? Math.max(0, Math.min(1, state.crackedHealthRatio))
      : 0.5,
  };
  const previousStage = resolveBreakableObstacleStage(normalized);
  const damaged = previousStage !== 'collapsed' && Number.isFinite(amount) && amount > 0;
  const health = damaged ? Math.max(0, normalized.health - amount) : normalized.health;
  const nextState = { ...normalized, health };
  const stage = resolveBreakableObstacleStage(nextState);

  return {
    ...nextState,
    previousStage,
    stage,
    damaged,
    crackedNow: previousStage === 'intact' && stage === 'cracked',
    collapsedNow: previousStage !== 'collapsed' && stage === 'collapsed',
  };
}

/** 坍塌冲击对 Boss 衰减，普通感染体吃完整伤害。 */
export function resolveCollapseDamage(
  damage: number,
  isBoss: boolean,
  bossDamageFactor: number,
): number {
  if (!Number.isFinite(damage) || damage <= 0) return 0;
  if (!isBoss) return damage;
  const factor = Number.isFinite(bossDamageFactor)
    ? Math.max(0, Math.min(1, bossDamageFactor))
    : 0;
  return damage * factor;
}
