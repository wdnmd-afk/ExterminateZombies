import type { ZombieAbilityDef } from '../config/types';

/** 特殊能力只有在距离、冷却、恢复和冲刺状态都允许时才能进入前摇。 */
export function canStartZombieAbility(
  ability: ZombieAbilityDef,
  distance: number,
  now: number,
  abilityReadyAt: number,
  recoveryUntil: number,
  dashUntil: number,
): boolean {
  return now >= abilityReadyAt
    && now >= recoveryUntil
    && now >= dashUntil
    && distance >= ability.minRange
    && distance <= ability.maxRange;
}
