import type { CharacterActiveDef } from '../config/characters';

/**
 * 主动技能的运行时状态。
 *
 * 两个时间点都是**绝对时间**（与 `scene.time.now` 同源），因此战场解除冻结时
 * 必须整体平移（见 `GameScene.shiftBattleTimers`）；否则暂停 30 秒回来，
 * 冷却会凭空走完、持续窗口会立刻过期。
 *
 * `activeUntil` 对瞬发技能（`durationMs === 0`）恒等于释放那一刻，
 * 因此 `isSkillActive` 对它永远返回 false —— 瞬发技能没有"生效中"这个状态，
 * 它的效果在释放的同一帧就已经结算完毕。
 */
export interface CharacterSkillState {
  readyAt: number;
  activeUntil: number;
}

/** 开局即可用：`readyAt` 取 0 而不是 now，保证第一波就能按下去。 */
export function createCharacterSkillState(): CharacterSkillState {
  return { readyAt: 0, activeUntil: 0 };
}

export function isSkillReady(state: CharacterSkillState, now: number): boolean {
  return now >= state.readyAt;
}

export function isSkillActive(state: CharacterSkillState, now: number): boolean {
  return now < state.activeUntil;
}

/** 剩余冷却毫秒数；已就绪返回 0。 */
export function skillCooldownRemaining(state: CharacterSkillState, now: number): number {
  return Math.max(0, state.readyAt - now);
}

/**
 * 冷却进度 0~1：0 = 刚释放，1 = 已就绪。HUD 的冷却条直接读它。
 * 用配置的 `cooldownMs` 反推而不是记录释放时刻，少存一个必须参与平移的字段。
 */
export function skillCooldownProgress(
  state: CharacterSkillState,
  active: CharacterActiveDef,
  now: number,
): number {
  if (active.cooldownMs <= 0) return 1;
  const remaining = skillCooldownRemaining(state, now);
  if (remaining <= 0) return 1;
  return Math.min(1, Math.max(0, 1 - remaining / active.cooldownMs));
}

/** 持续窗口剩余毫秒数；瞬发或已结束返回 0。 */
export function skillActiveRemaining(state: CharacterSkillState, now: number): number {
  return Math.max(0, state.activeUntil - now);
}

/**
 * 按下技能键后的新状态。调用方必须先用 `isSkillReady` 判定，
 * 这里只负责推进时间点，不重复做资格判断——否则"能不能放"会有两处实现。
 */
export function beginSkill(
  active: CharacterActiveDef,
  now: number,
): CharacterSkillState {
  return {
    readyAt: now + Math.max(0, active.cooldownMs),
    activeUntil: now + Math.max(0, active.durationMs),
  };
}

export function shiftSkillTimers(
  state: CharacterSkillState,
  offset: number,
): CharacterSkillState {
  if (offset <= 0) return state;
  return {
    readyAt: state.readyAt + offset,
    activeUntil: state.activeUntil + offset,
  };
}

// ——— 生效中的技能对战斗结算的修正 ———
//
// 下面每个函数都遵循同一个约定：技能未生效、或当前角色的技能不是对应 kind 时，
// 返回**中性值**（倍率 1、加量 0）。这样调用方不需要在战斗热路径里写 kind 判断，
// 也不会因为漏判某个 kind 而静默丢掉一半效果。

/** 窗口期叠加的爆头率。上限仍由 `HEADSHOT_CHANCE_CAP` 统一收口。 */
export function skillHeadshotChanceBonus(active: CharacterActiveDef, skillActive: boolean): number {
  return skillActive && active.kind === 'focusWindow' ? active.headshotChanceBonus : 0;
}

export function skillHeadshotMultiplierBonus(
  active: CharacterActiveDef,
  skillActive: boolean,
): number {
  return skillActive && active.kind === 'focusWindow' ? active.headshotMultiplierBonus : 0;
}

export function skillPenetrationBonus(active: CharacterActiveDef, skillActive: boolean): number {
  return skillActive && active.kind === 'focusWindow' ? active.penetrationBonus : 0;
}

/** 窗口期的受伤倍率。与装甲板被动相乘，不取最强的一项：两者来源不同，叠加是设计意图。 */
export function skillIncomingDamageMultiplier(
  active: CharacterActiveDef,
  skillActive: boolean,
): number {
  return skillActive && active.kind === 'bulwark' ? active.incomingDamageMultiplier : 1;
}

export function skillMoveSpeedMultiplier(
  active: CharacterActiveDef,
  skillActive: boolean,
): number {
  return skillActive && active.kind === 'bulwark' ? active.moveSpeedMultiplier : 1;
}

/** 窗口期的伤害倍率。装甲过载与弹药过载都走这一条，两者互斥（同一角色只有一个技能）。 */
export function skillDamageMultiplier(active: CharacterActiveDef, skillActive: boolean): number {
  if (!skillActive) return 1;
  if (active.kind === 'bulwark') return active.damageMultiplier;
  if (active.kind === 'overload') return active.damageMultiplier;
  return 1;
}

export function skillFireRateFactor(active: CharacterActiveDef, skillActive: boolean): number {
  return skillActive && active.kind === 'overload' ? active.fireRateFactor : 1;
}

/** 窗口期是否免除弹药消耗。只有弹药过载给 true。 */
export function skillSuppressesAmmoCost(
  active: CharacterActiveDef,
  skillActive: boolean,
): boolean {
  return skillActive && active.kind === 'overload';
}
