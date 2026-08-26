import type { CharacterDef } from '../config/characters';
import type { EffectDef, WeaponDef } from '../config/types';
import type { PlayerDamageSource } from './CombatDiagnostics';
import {
  skillDamageMultiplier,
  skillHeadshotChanceBonus,
  skillIncomingDamageMultiplier,
} from './CharacterSkillRules';

export const HEADSHOT_CHANCE_CAP = 0.5;

const ARMORED_DAMAGE_SOURCES = new Set<PlayerDamageSource>([
  'melee',
  'projectile',
  'enemyBlast',
]);

export function resolveHeadshotChance(
  baseHeadshotChance: number,
  character: CharacterDef,
  weapon: WeaponDef,
  stationaryCalibrationActive: boolean,
  skillActive = false,
): number {
  if (!weapon.canHeadshot) return 0;
  const passiveBonus = character.passive.kind === 'stationaryCalibration'
    && stationaryCalibrationActive
    ? character.passive.headshotChanceBonus
    : 0;
  const activeBonus = skillHeadshotChanceBonus(character.active, skillActive);
  return Math.min(
    HEADSHOT_CHANCE_CAP,
    Math.max(0, baseHeadshotChance + weapon.headshotChanceBonus + passiveBonus + activeBonus),
  );
}

export function rollHeadshot(chance: number, roll: number): boolean {
  if (chance <= 0) return false;
  return roll < Math.min(HEADSHOT_CHANCE_CAP, chance);
}

export function resolveHeadshotDamage(baseDamage: number, multiplier: number): number {
  return baseDamage * Math.max(1, multiplier);
}

export function resolveMovementPenalty(
  character: CharacterDef,
  weaponMovementPenalty: number | undefined,
): number {
  const basePenalty = weaponMovementPenalty ?? 1;
  return character.passive.kind === 'movingFire'
    ? basePenalty * character.passive.movementPenaltyMultiplier
    : basePenalty;
}

export function isLastMagazineWindow(
  character: CharacterDef,
  ammoBeforeShot: number,
  magazineSize: number,
): boolean {
  if (character.passive.kind !== 'lastMagazine' || ammoBeforeShot <= 0 || magazineSize <= 0) return false;
  const thresholdRounds = Math.max(1, Math.floor(magazineSize * character.passive.magazineThreshold));
  return ammoBeforeShot <= thresholdRounds;
}

export function resolveWeaponDamageMultiplier(
  baseDamageMultiplier: number,
  character: CharacterDef,
  ammoBeforeShot: number,
  magazineSize: number,
  skillActive = false,
): number {
  const passiveMultiplier = isLastMagazineWindow(character, ammoBeforeShot, magazineSize)
    && character.passive.kind === 'lastMagazine'
    ? character.passive.damageMultiplier
    : 1;
  return baseDamageMultiplier
    * passiveMultiplier
    * skillDamageMultiplier(character.active, skillActive);
}

/**
 * 玩家实际承受的伤害。
 *
 * 装甲板被动只作用于白名单来源（近战 / 投射物 / 敌方技能爆炸），而装甲过载主动
 * 对**所有**来源生效：主动是玩家花冷却换来的，不该被"这一下算不算装甲覆盖范围"
 * 这种玩家看不见的分类判断掉。两者相乘而不取最强项，叠加是设计意图。
 */
export function resolveIncomingPlayerDamage(
  character: CharacterDef,
  amount: number,
  source: PlayerDamageSource,
  skillActive = false,
): number {
  const multiplier = character.passive.kind === 'armorPlate' && ARMORED_DAMAGE_SOURCES.has(source)
    ? character.passive.incomingDamageMultiplier
    : 1;
  const activeMultiplier = skillIncomingDamageMultiplier(character.active, skillActive);
  return Math.max(0, Math.round(amount * multiplier * activeMultiplier));
}

/** 复制并缩放玩家来源效果，不能修改共享武器/道具配置。 */
export function scalePlayerEffect(effect: EffectDef | undefined, multiplier: number): EffectDef | undefined {
  if (!effect) return undefined;
  return {
    ...effect,
    damage: effect.damage * multiplier,
    lingering: effect.lingering
      ? {
        ...effect.lingering,
        tickDamage: effect.lingering.tickDamage === undefined
          ? undefined
          : effect.lingering.tickDamage * multiplier,
      }
      : undefined,
  };
}
