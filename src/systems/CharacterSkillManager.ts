import type Phaser from 'phaser';
import { getCharacterDef, type CharacterActiveDef } from '../config/characters';
import { EVENTS } from '../constants';
import type { GameState } from './GameState';
import type { InputManager } from './InputManager';
import { SoundManager } from './SoundManager';
import {
  beginSkill,
  isSkillActive,
  isSkillReady,
  shiftSkillTimers,
  skillCooldownProgress,
  skillCooldownRemaining,
  skillActiveRemaining,
} from './CharacterSkillRules';

/**
 * 技能释放时需要战场提供的能力。
 *
 * 用回调注入而不是让本类持有 `GameScene`：技能的效果全部由战场既有系统承担
 *（爆炸走 `AreaEffectFactory`、无敌走 `Player`、阻敌区走 linger），
 * 本类只负责"什么时候、按什么参数"调用它们。这样它可以在没有 Phaser 场景的
 * 环境里被推理和测试，也不会变成第二处伤害来源。
 */
export interface CharacterSkillHooks {
  /** 以玩家为中心的冲击波：范围伤害 + 径向击退。 */
  pulse: (radius: number, damage: number, knockback: number) => void;
  /** 给玩家一段无敌窗口。 */
  grantInvulnerability: (durationMs: number) => void;
  /** 沿当前瞄准方向位移，返回实际起点（可能被墙挡住而与请求距离不同）。 */
  dash: (distance: number) => { fromX: number; fromY: number };
  /** 在指定位置留下阻敌粉尘区。 */
  spawnBlockingTrail: (x: number, y: number, radius: number, durationMs: number) => void;
  /** 技能释放的画面反馈（光环、震屏）。 */
  presentActivation: (active: CharacterActiveDef) => void;
}

interface CharacterSkillManagerOptions {
  scene: Phaser.Scene;
  state: GameState;
  input: InputManager;
  hooks: CharacterSkillHooks;
}

/**
 * 主动技能系统。
 *
 * 只做四件事：读键、判定冷却、按 kind 触发一次效果、广播状态给 HUD。
 * 持续型技能的**效果**不在这里每帧施加——那样会和武器/伤害管线各写一份。
 * 它们统一由 `CharacterSkillRules` 的修正函数在真正结算的地方读取，
 * 本类只维护"窗口开着没有"这一个事实。
 */
export class CharacterSkillManager {
  private readonly scene: Phaser.Scene;
  private readonly state: GameState;
  private readonly input: InputManager;
  private readonly hooks: CharacterSkillHooks;
  /** 上一帧窗口是否开着，用于在窗口自然结束时补一次事件，让 HUD 收起高亮。 */
  private wasActive = false;

  constructor(options: CharacterSkillManagerOptions) {
    this.scene = options.scene;
    this.state = options.state;
    this.input = options.input;
    this.hooks = options.hooks;
  }

  /** `blocked` 为 true 时只推进状态、不接受输入（药品读条期间禁用技能）。 */
  update(blocked: boolean): void {
    const now = this.scene.time.now;
    const active = isSkillActive(this.state.player.characterSkill, now);
    if (this.wasActive && !active) {
      this.wasActive = false;
      this.emitChanged();
    } else if (active && !this.wasActive) {
      this.wasActive = true;
    }

    if (blocked) return;
    if (this.input.justPressed('useSkill')) this.tryActivate();
  }

  isActive(): boolean {
    return isSkillActive(this.state.player.characterSkill, this.scene.time.now);
  }

  /** HUD 读的完整快照。冷却与窗口都在这里一次算好，避免 HUD 自己重算出不同的数。 */
  getStatus(): {
    name: string;
    description: string;
    ready: boolean;
    active: boolean;
    cooldownRemaining: number;
    cooldownProgress: number;
    activeRemaining: number;
    activeDuration: number;
    accentColor: number;
  } {
    const character = getCharacterDef(this.state.player.characterId);
    const now = this.scene.time.now;
    const skill = this.state.player.characterSkill;
    return {
      name: character.active.name,
      description: character.active.description,
      ready: isSkillReady(skill, now),
      active: isSkillActive(skill, now),
      cooldownRemaining: skillCooldownRemaining(skill, now),
      cooldownProgress: skillCooldownProgress(skill, character.active, now),
      activeRemaining: skillActiveRemaining(skill, now),
      activeDuration: character.active.durationMs,
      accentColor: character.accentColor,
    };
  }

  shiftTimers(offset: number): void {
    this.state.player.characterSkill = shiftSkillTimers(this.state.player.characterSkill, offset);
  }

  private tryActivate(): void {
    const character = getCharacterDef(this.state.player.characterId);
    const now = this.scene.time.now;
    if (!isSkillReady(this.state.player.characterSkill, now)) {
      // 冷却中按键必须有反馈：没有提示的话玩家会以为按键没绑上。
      SoundManager.play('empty');
      this.scene.events.emit(EVENTS.pickupCollected, {
        title: `${character.active.name} · 冷却中 ${(skillCooldownRemaining(this.state.player.characterSkill, now) / 1000).toFixed(1)}s`,
        accent: 0x8d9298,
      });
      return;
    }

    this.state.player.characterSkill = beginSkill(character.active, now);
    this.wasActive = character.active.durationMs > 0;
    this.applyEffect(character.active);
    this.hooks.presentActivation(character.active);
    SoundManager.play('streak');
    this.scene.events.emit(EVENTS.waveAnnounced, {
      title: character.active.name.toUpperCase(),
      subtitle: `${character.codename} · ${character.active.name}`,
      accent: character.accentColor,
    });
    this.emitChanged();
  }

  /**
   * 释放瞬间的一次性效果。
   *
   * 持续型技能（focusWindow / bulwark / overload）在这里**没有分支**：
   * 它们的全部效果都是"窗口开着时被结算方读到"，在这里再补一次会变成双重生效。
   */
  private applyEffect(active: CharacterActiveDef): void {
    if (active.kind === 'suppressionPulse') {
      this.hooks.pulse(active.radius, active.damage, active.knockback);
      this.hooks.grantInvulnerability(active.invulnerabilityMs);
      return;
    }
    if (active.kind === 'phaseDash') {
      // 先给无敌再位移：位移过程中会穿过敌群，顺序颠倒会在起步那一帧被贴脸的敌人打到。
      this.hooks.grantInvulnerability(active.invulnerabilityMs);
      const origin = this.hooks.dash(active.distance);
      if (active.trailRadius > 0 && active.trailDurationMs > 0) {
        this.hooks.spawnBlockingTrail(
          origin.fromX,
          origin.fromY,
          active.trailRadius,
          active.trailDurationMs,
        );
      }
    }
  }

  private emitChanged(): void {
    this.scene.events.emit(EVENTS.characterSkillChanged);
  }
}
