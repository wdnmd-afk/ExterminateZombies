import { describe, expect, it } from 'vitest';
import { CHARACTERS, getCharacterDef, CHARACTER_IDS } from '../src/config/characters';
import {
  beginSkill,
  createCharacterSkillState,
  isSkillActive,
  isSkillReady,
  shiftSkillTimers,
  skillActiveRemaining,
  skillCooldownProgress,
  skillCooldownRemaining,
  skillDamageMultiplier,
  skillFireRateFactor,
  skillHeadshotChanceBonus,
  skillHeadshotMultiplierBonus,
  skillIncomingDamageMultiplier,
  skillMoveSpeedMultiplier,
  skillPenetrationBonus,
  skillSuppressesAmmoCost,
} from '../src/systems/CharacterSkillRules';
import { resolveDashTarget } from '../src/systems/CharacterSkillGeometry';
import {
  resolveHeadshotChance,
  resolveIncomingPlayerDamage,
  resolveWeaponDamageMultiplier,
  HEADSHOT_CHANCE_CAP,
} from '../src/systems/CharacterCombatRules';
import { WEAPONS } from '../src/config/weapons';

describe('主动技能状态机', () => {
  it('开局即就绪，且不处于生效窗口', () => {
    const state = createCharacterSkillState();
    expect(isSkillReady(state, 0)).toBe(true);
    expect(isSkillActive(state, 0)).toBe(false);
    expect(skillCooldownRemaining(state, 0)).toBe(0);
  });

  it('释放后进入冷却，冷却结束才重新就绪', () => {
    const active = CHARACTERS.bastion.active;
    const state = beginSkill(active, 1000);
    expect(isSkillReady(state, 1000)).toBe(false);
    expect(isSkillReady(state, 1000 + active.cooldownMs - 1)).toBe(false);
    expect(isSkillReady(state, 1000 + active.cooldownMs)).toBe(true);
  });

  it('持续技能在窗口内生效，窗口结束即失效', () => {
    const active = CHARACTERS.bastion.active;
    const state = beginSkill(active, 0);
    expect(isSkillActive(state, active.durationMs - 1)).toBe(true);
    expect(isSkillActive(state, active.durationMs)).toBe(false);
    expect(skillActiveRemaining(state, 0)).toBe(active.durationMs);
  });

  it('瞬发技能没有生效窗口', () => {
    // 压制脉冲的效果在释放的同一帧结算完毕，不该留下一段"亮着但什么都不做"的窗口。
    const state = beginSkill(CHARACTERS.watcher.active, 500);
    expect(isSkillActive(state, 500)).toBe(false);
    expect(skillActiveRemaining(state, 500)).toBe(0);
  });

  it('冷却进度从 0 单调回升到 1', () => {
    const active = CHARACTERS.runner.active;
    const state = beginSkill(active, 0);
    expect(skillCooldownProgress(state, active, 0)).toBeCloseTo(0);
    expect(skillCooldownProgress(state, active, active.cooldownMs / 2)).toBeCloseTo(0.5);
    expect(skillCooldownProgress(state, active, active.cooldownMs)).toBe(1);
    // 超过冷却后仍然是 1，不会继续增长。
    expect(skillCooldownProgress(state, active, active.cooldownMs * 3)).toBe(1);
  });

  it('平移把冷却与窗口整体后移，暂停不会白吃冷却', () => {
    const active = CHARACTERS.breacher.active;
    const state = beginSkill(active, 1000);
    const shifted = shiftSkillTimers(state, 30_000);
    // 平移 30 秒后，剩余冷却与平移前在各自时间轴上完全一致。
    expect(skillCooldownRemaining(shifted, 31_000)).toBe(skillCooldownRemaining(state, 1000));
    expect(skillActiveRemaining(shifted, 31_000)).toBe(skillActiveRemaining(state, 1000));
  });

  it('平移非正偏移时原样返回', () => {
    const state = beginSkill(CHARACTERS.watcher.active, 100);
    expect(shiftSkillTimers(state, 0)).toBe(state);
    expect(shiftSkillTimers(state, -50)).toBe(state);
  });
});

describe('技能修正函数只对对应 kind 生效', () => {
  it('窗口未开时全部返回中性值', () => {
    for (const characterId of CHARACTER_IDS) {
      const active = getCharacterDef(characterId).active;
      expect(skillHeadshotChanceBonus(active, false)).toBe(0);
      expect(skillHeadshotMultiplierBonus(active, false)).toBe(0);
      expect(skillPenetrationBonus(active, false)).toBe(0);
      expect(skillIncomingDamageMultiplier(active, false)).toBe(1);
      expect(skillMoveSpeedMultiplier(active, false)).toBe(1);
      expect(skillDamageMultiplier(active, false)).toBe(1);
      expect(skillFireRateFactor(active, false)).toBe(1);
      expect(skillSuppressesAmmoCost(active, false)).toBe(false);
    }
  });

  it('每个修正只被恰好一个角色的技能激活', () => {
    // 这条不变量防止"给 A 角色加的效果被 B 角色顺带吃到"：
    // 五个技能各自负责一组互不重叠的修正。
    const activated = (predicate: (kind: string) => boolean) => CHARACTER_IDS.filter(
      (characterId) => predicate(getCharacterDef(characterId).active.kind),
    );
    expect(activated((kind) => kind === 'focusWindow')).toEqual(['eagle_eye']);
    expect(activated((kind) => kind === 'bulwark')).toEqual(['bastion']);
    expect(activated((kind) => kind === 'overload')).toEqual(['breacher']);
    expect(activated((kind) => kind === 'suppressionPulse')).toEqual(['watcher']);
    expect(activated((kind) => kind === 'phaseDash')).toEqual(['runner']);
  });

  it('猎杀视界把爆头率顶到上限并叠加穿透', () => {
    const eagleEye = CHARACTERS.eagle_eye;
    const withoutSkill = resolveHeadshotChance(
      eagleEye.headshotChance,
      eagleEye,
      WEAPONS.rifle,
      false,
      false,
    );
    const withSkill = resolveHeadshotChance(
      eagleEye.headshotChance,
      eagleEye,
      WEAPONS.rifle,
      false,
      true,
    );
    expect(withoutSkill).toBeLessThan(HEADSHOT_CHANCE_CAP);
    expect(withSkill).toBe(HEADSHOT_CHANCE_CAP);
    expect(skillPenetrationBonus(eagleEye.active, true)).toBe(3);
  });

  it('不可爆头武器在窗口期仍然不能爆头', () => {
    // 爆头资格由武器决定，技能只提高概率与倍率，不能把 RPG 变成可爆头武器。
    expect(
      resolveHeadshotChance(0.3, CHARACTERS.eagle_eye, WEAPONS.rpg, true, true),
    ).toBe(0);
  });

  it('装甲过载与装甲板被动相乘', () => {
    const bastion = CHARACTERS.bastion;
    const passiveOnly = resolveIncomingPlayerDamage(bastion, 100, 'melee', false);
    const withSkill = resolveIncomingPlayerDamage(bastion, 100, 'melee', true);
    // 0.78 被动 × 0.5 主动 = 0.39
    expect(passiveOnly).toBe(78);
    expect(withSkill).toBe(39);
  });

  it('装甲过载对被动不覆盖的伤害来源同样生效', () => {
    // 装甲板只覆盖近战/投射物/敌方技能；主动是玩家花冷却换来的，
    // 不该被"这一下算不算装甲范围"这种玩家看不见的分类判掉。
    const bastion = CHARACTERS.bastion;
    expect(resolveIncomingPlayerDamage(bastion, 100, 'fire', false)).toBe(100);
    expect(resolveIncomingPlayerDamage(bastion, 100, 'fire', true)).toBe(50);
  });

  it('弹药过载在窗口期免除弹药消耗并提高伤害', () => {
    const breacher = CHARACTERS.breacher;
    expect(skillSuppressesAmmoCost(breacher.active, true)).toBe(true);
    expect(skillFireRateFactor(breacher.active, true)).toBeLessThan(1);
    // 满弹匣时被动不生效，此时的倍率差异只来自主动。
    const base = resolveWeaponDamageMultiplier(1, breacher, 30, 30, false);
    const boosted = resolveWeaponDamageMultiplier(1, breacher, 30, 30, true);
    expect(boosted / base).toBeCloseTo(1.2);
  });

  it('末段火力被动与弹药过载主动可以同时生效', () => {
    const breacher = CHARACTERS.breacher;
    // 弹匣剩 3/30 = 10%，低于 30% 阈值，被动生效。
    const passiveOnly = resolveWeaponDamageMultiplier(1, breacher, 3, 30, false);
    const both = resolveWeaponDamageMultiplier(1, breacher, 3, 30, true);
    expect(passiveOnly).toBeCloseTo(1.25);
    expect(both).toBeCloseTo(1.25 * 1.2);
  });

  it('其它角色的技能不会改变伤害与受伤倍率', () => {
    for (const characterId of ['watcher', 'eagle_eye', 'runner'] as const) {
      const character = getCharacterDef(characterId);
      expect(skillDamageMultiplier(character.active, true)).toBe(1);
      expect(skillIncomingDamageMultiplier(character.active, true)).toBe(1);
      expect(skillFireRateFactor(character.active, true)).toBe(1);
    }
  });
});

describe('相位疾冲落点解析', () => {
  const bounds = { width: 1280, height: 720, radius: 16 };

  it('空场时走满请求距离', () => {
    const target = resolveDashTarget(200, 300, 0, 240, [], bounds);
    expect(target.x).toBeCloseTo(440);
    expect(target.y).toBeCloseTo(300);
  });

  it('落点被夹在世界边界内，不会半个身子出界', () => {
    const target = resolveDashTarget(1200, 300, 0, 240, [], bounds);
    expect(target.x).toBeLessThanOrEqual(bounds.width - bounds.radius);
    expect(target.x).toBeGreaterThan(1200);
  });

  it('朝墙冲时贴到墙前停下，而不是穿过去', () => {
    const wall = { x: 400, y: 300, width: 40, height: 200 };
    const target = resolveDashTarget(200, 300, 0, 240, [wall], bounds);
    // 必须停在墙的近侧面之前。
    expect(target.x).toBeLessThan(wall.x - wall.width / 2);
    // 也必须真的往前挪了一段：原地不动会白吃一次冷却。
    expect(target.x).toBeGreaterThan(200);
  });

  it('薄墙不会被步进跨过', () => {
    // 步长 8px，墙厚 6px：只判端点会直接跳过它，必须按线段判定。
    const thinWall = { x: 260, y: 300, width: 6, height: 200 };
    const target = resolveDashTarget(200, 300, 0, 240, [thinWall], bounds);
    expect(target.x).toBeLessThan(thinWall.x - thinWall.width / 2);
  });

  it('起点就贴着墙时返回起点，不会被塞进墙里', () => {
    const wall = { x: 216, y: 300, width: 40, height: 200 };
    const target = resolveDashTarget(200, 300, 0, 240, [wall], bounds);
    expect(target.x).toBeCloseTo(200);
    expect(target.y).toBeCloseTo(300);
  });

  it('斜向位移同时受两个轴的边界约束', () => {
    const target = resolveDashTarget(60, 60, Math.PI * 1.25, 240, [], bounds);
    expect(target.x).toBeGreaterThanOrEqual(bounds.radius);
    expect(target.y).toBeGreaterThanOrEqual(bounds.radius);
  });
});
