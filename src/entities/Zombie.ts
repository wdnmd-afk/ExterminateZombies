import Phaser from 'phaser';
import { DEPTH } from '../constants';
import { ZOMBIES, type ZombieId } from '../config/zombies';
import type { BossPhaseDef, ZombieAbilityDef, ZombieDef } from '../config/types';
import { angleBetween } from '../utils/math';
import {
  getZombieAnimationKey,
  getZombieActionAnimationKey,
  getZombieActionLayout,
  getZombieVisual,
  type FacingDirection,
  type ZombieVisual,
} from '../systems/GameAssetManager';
import { canStartZombieAbility } from '../systems/EnemyAbilityRules';
import type { CorpseSnapshot } from '../systems/CorpseLayer';

export interface ZombieAbilityEvent {
  phase: 'windup' | 'execute';
  ability: ZombieAbilityDef;
  sourceX: number;
  sourceY: number;
  targetX: number;
  targetY: number;
}

interface AbilityState {
  ability: ZombieAbilityDef;
  abilityIndex: number;
  executeAt: number;
  targetX: number;
  targetY: number;
}

export interface BossPhaseStatus {
  phase: number;
  totalPhases: number;
  label: string;
}

export interface BossPhaseTransition extends BossPhaseStatus {
  previousPhase: number;
}

/**
 * 僵尸实体。走对象池复用。
 * 正式外观支持四方向行走表和俯视旋转帧条，由 GameAssetManager 统一描述。
 * AI:每帧朝玩家 seek;对邻近僵尸施加分离力避免叠成一点;
 * 若处于粉尘阻挡区则被挡住(速度归零)。
 * Boss(id 含 'boss')复用同一实体逻辑；独立或复用的视觉来源均由配置表决定。
 */
export class Zombie extends Phaser.GameObjects.Container {
  declare body: Phaser.Physics.Arcade.Body;

  def!: ZombieDef;
  health = 0;
  private lastAttackAt = -Infinity;
  private shadow: Phaser.GameObjects.Ellipse;
  private sprite: Phaser.GameObjects.Sprite;
  private typeId: ZombieId = 'walker';
  private visual!: ZombieVisual;
  private baseTint = 0xffffff;
  private baseScale = 1;
  private facing: FacingDirection = 'down';
  private abilityState: AbilityState | null = null;
  private abilityReadyAt: number[] = [];
  private recoveryUntil = -Infinity;
  private dashUntil = -Infinity;
  private dashVelocityX = 0;
  private dashVelocityY = 0;
  private knockbackUntil = -Infinity;
  private knockbackVelocityX = 0;
  private knockbackVelocityY = 0;
  private lifecycleToken = 0;
  private bossPhaseIndex = -1;
  private pendingBossPhaseTransition: BossPhaseTransition | null = null;
  private presentationState: 'move' | 'attack' | 'death' = 'move';
  private dying = false;
  /** 本帧是否被残留区阻挡(由 GameScene 在 update 前设置)。 */
  blocked = false;

  constructor(scene: Phaser.Scene) {
    super(scene, 0, 0);
    this.shadow = scene.add.ellipse(0, 14, 24, 10, 0x000000, 0.22);
    this.sprite = scene.add.sprite(0, 0, undefined as unknown as string, 0);
    this.sprite.setOrigin(0.5, 0.62);
    this.add([this.shadow, this.sprite]);
    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.setDepth(DEPTH.zombie);
    this.setActive(false);
    this.setVisible(false);
    this.body.enable = false;
  }

  /** 从池取出后初始化。 */
  spawn(x: number, y: number, typeId: ZombieId): void {
    this.lifecycleToken += 1;
    this.scene.tweens.killTweensOf(this.sprite);
    this.scene.tweens.killTweensOf(this.shadow);
    const def = ZOMBIES[typeId];
    const visual = getZombieVisual(typeId);
    const isBoss = typeId.includes('boss');

    this.def = def;
    this.typeId = typeId;
    this.visual = visual;
    this.health = def.health;
    this.lastAttackAt = -Infinity;
    this.blocked = false;
    this.facing = 'down';
    this.abilityState = null;
    this.abilityReadyAt = this.getAllAbilities().map(() => -Infinity);
    this.recoveryUntil = -Infinity;
    this.dashUntil = -Infinity;
    this.dashVelocityX = 0;
    this.dashVelocityY = 0;
    this.knockbackUntil = -Infinity;
    this.knockbackVelocityX = 0;
    this.knockbackVelocityY = 0;
    this.baseTint = visual.tint;
    this.baseScale = visual.scale;
    this.bossPhaseIndex = -1;
    this.pendingBossPhaseTransition = null;
    this.presentationState = 'move';
    this.dying = false;

    this.setPosition(x, y);

    this.sprite.setTexture(visual.textureKey);
    this.sprite.setOrigin(0.5, visual.originY);
    this.sprite.setRotation(0);
    this.sprite.setScale(visual.scale);
    this.sprite.setTint(visual.tint);
    this.sprite.play(getZombieAnimationKey(typeId, this.facing));
    const animationFrameRate = this.sprite.anims.currentAnim?.frameRate ?? visual.frameRate;
    this.sprite.anims.timeScale = visual.frameRate / animationFrameRate;

    const shadowScale = def.radius / 14;
    // 大体型 Boss 会使用更大的圆形命中框，但阴影不能跟着半径无限放大；
    // 用视觉缩放封顶，避免非方形帧条脚下出现远宽于身体的黑圈。
    const resolvedShadowScale = isBoss
      ? Math.min(shadowScale * 1.4, visual.scale * 1.4)
      : shadowScale;
    this.shadow.setScale(resolvedShadowScale);
    this.shadow.setAlpha(isBoss ? 0.3 : 0.22);

    this.setActive(true);
    this.setVisible(true);
    this.body.enable = true;
    this.body.reset(x, y);
    // 碰撞圆仍以玩法半径为准，只按美术映射修正纵向中心；否则不同来源帧条
    // 会因为透明留白而出现“瞄准可见身体却打不到”的区域。
    this.body.setCircle(
      def.radius,
      -def.radius,
      -def.radius + visual.collisionOffsetY,
    );

    // 生成缩放弹入,起点略小。
    this.sprite.setScale(visual.scale * 0.6);
    this.scene.tweens.add({
      targets: this.sprite,
      scaleX: visual.scale,
      scaleY: visual.scale,
      duration: 180,
      ease: 'Back.Out',
    });
  }

  despawn(): void {
    this.lifecycleToken += 1;
    this.scene.tweens.killTweensOf(this.sprite);
    this.scene.tweens.killTweensOf(this.shadow);
    this.abilityState = null;
    this.pendingBossPhaseTransition = null;
    this.dashUntil = -Infinity;
    this.knockbackUntil = -Infinity;
    this.dying = false;
    this.setActive(false);
    this.setVisible(false);
    this.body.enable = false;
    this.body.stop();
  }

  /** 追击玩家。separationX/Y 是外部算好的分离分量。 */
  seek(now: number, targetX: number, targetY: number, separationX: number, separationY: number): void {
    if (!this.active || this.dying) return;
    // 击退优先级最高：被霰弹轰飞和「自己走不进粉尘区」是两件事，
    // 打断冲刺也是霰弹的合法回报（Boss 在 applyKnockback 处已被排除）。
    if (now < this.knockbackUntil) {
      this.body.setVelocity(this.knockbackVelocityX, this.knockbackVelocityY);
      return;
    }
    if (this.blocked) {
      this.body.setVelocity(0, 0);
      return;
    }
    if (now < this.dashUntil) {
      this.body.setVelocity(this.dashVelocityX, this.dashVelocityY);
      this.updateFacing(this.dashVelocityX, this.dashVelocityY);
      return;
    }
    if (this.abilityState || now < this.recoveryUntil) {
      this.body.setVelocity(0, 0);
      return;
    }
    const moveSpeed = this.def.speed * (this.getActiveBossPhase()?.speedMultiplier ?? 1);
    const ang = angleBetween(this.x, this.y, targetX, targetY);
    let vx = Math.cos(ang) * moveSpeed + separationX;
    let vy = Math.sin(ang) * moveSpeed + separationY;
    // 限速到当前阶段速度附近。
    const sp = Math.hypot(vx, vy);
    if (sp > moveSpeed) {
      const k = moveSpeed / sp;
      vx *= k;
      vy *= k;
    }
    this.body.setVelocity(vx, vy);
    this.updateFacing(vx, vy);
  }

  /**
   * 推进配置化特殊攻击。调用方在收到 windup 时渲染预警，收到 execute 时生成投射物或范围攻击。
   * 触发距离、前摇、恢复和冷却全部来自配置，避免按敌人 ID 堆叠行为分支。
   */
  updateAbility(now: number, targetX: number, targetY: number): ZombieAbilityEvent | null {
    if (!this.active || this.dying) return null;
    // 被击退期间不进入新的前摇；已经读条中的能力照常结算，避免击退变成无限打断。
    if (!this.abilityState && now < this.knockbackUntil) return null;

    if (this.abilityState) {
      if (now < this.abilityState.executeAt) return null;

      const executing = this.abilityState;
      this.abilityState = null;
      this.abilityReadyAt[executing.abilityIndex] = now + executing.ability.cooldown;
      this.recoveryUntil = now + executing.ability.recovery;

      if (executing.ability.kind === 'dash') {
        const angle = angleBetween(this.x, this.y, executing.targetX, executing.targetY);
        this.dashVelocityX = Math.cos(angle) * executing.ability.dashSpeed;
        this.dashVelocityY = Math.sin(angle) * executing.ability.dashSpeed;
        this.dashUntil = now + executing.ability.dashDuration;
        this.recoveryUntil = this.dashUntil + executing.ability.recovery;
      }

      return {
        phase: 'execute',
        ability: executing.ability,
        sourceX: this.x,
        sourceY: this.y,
        targetX: executing.targetX,
        targetY: executing.targetY,
      };
    }

    const distance = Phaser.Math.Distance.Between(this.x, this.y, targetX, targetY);
    const availableAbilities = this.getAvailableAbilities();
    // 后续阶段解锁的能力优先检查；巨型坦克的冲锋和震荡距离互补，不会随机抢占。
    const candidate = availableAbilities
      .map((ability, abilityIndex) => ({
        ability: this.resolveAbilityForPhase(ability, abilityIndex),
        abilityIndex,
      }))
      .reverse()
      .find(({ ability, abilityIndex }) => canStartZombieAbility(
        ability,
        distance,
        now,
        this.abilityReadyAt[abilityIndex] ?? -Infinity,
        this.recoveryUntil,
        this.dashUntil,
      ));
    if (!candidate) return null;

    this.abilityState = {
      ability: candidate.ability,
      abilityIndex: candidate.abilityIndex,
      executeAt: now + candidate.ability.windup,
      targetX,
      targetY,
    };
    return {
      phase: 'windup',
      ability: candidate.ability,
      sourceX: this.x,
      sourceY: this.y,
      targetX,
      targetY,
    };
  }

  /** 根据速度向量更新四方向动画或俯视精灵旋转。 */
  private updateFacing(vx: number, vy: number): void {
    if (vx === 0 && vy === 0) return;

    if (this.visual.facingMode === 'rotating') {
      // 只旋转精灵，Container 与圆形物理体保持不变，避免碰撞体随美术朝向抖动。
      this.sprite.setRotation(Math.atan2(vy, vx) + this.visual.rotationOffset);
      return;
    }

    const next: FacingDirection = Math.abs(vx) > Math.abs(vy)
      ? (vx < 0 ? 'left' : 'right')
      : (vy < 0 ? 'up' : 'down');
    if (next === this.facing) return;
    this.facing = next;
    this.sprite.play(getZombieAnimationKey(this.typeId, next), true);
  }

  /** 技能前摇使用归档攻击帧；未配置动作素材的感染体继续保持移动帧。 */
  playAbilityWindup(targetX: number, targetY: number, duration: number): void {
    if (!this.active || this.dying) return;
    this.updateFacing(targetX - this.x, targetY - this.y);
    const layout = getZombieActionLayout(this.typeId, 'attack');
    const animationKey = getZombieActionAnimationKey(this.typeId, 'attack');
    if (!layout || !animationKey || !this.scene.anims.exists(animationKey)) return;

    this.presentationState = 'attack';
    this.sprite.play(animationKey, true);
    const sourceDuration = layout.frameCount / layout.frameRate * 1000;
    this.sprite.anims.timeScale = sourceDuration / Math.max(1, duration);
    const lifecycleToken = this.lifecycleToken;
    this.scene.time.delayedCall(duration, () => {
      if (!this.active || this.dying || this.lifecycleToken !== lifecycleToken) return;
      if (this.presentationState === 'attack') this.restoreMovementAnimation();
    });
  }

  /**
   * 死亡期间保持 active 让 WaveManager 等待动画，但关闭物理和全部攻击。
   * 返回 false 表示同一实体已经进入死亡流程，供同帧多弹丸命中做幂等保护。
   */
  beginDeathAnimation(onComplete: () => void): boolean {
    if (!this.active || this.dying) return false;
    this.dying = true;
    this.presentationState = 'death';
    this.abilityState = null;
    this.pendingBossPhaseTransition = null;
    this.body.enable = false;
    this.body.stop();
    this.scene.tweens.killTweensOf(this.sprite);
    this.sprite.setScale(this.baseScale);
    this.scene.tweens.add({ targets: this.shadow, alpha: 0, duration: 260 });

    const layout = getZombieActionLayout(this.typeId, 'death');
    const animationKey = getZombieActionAnimationKey(this.typeId, 'death');
    if (!layout || !animationKey || !this.scene.anims.exists(animationKey)) {
      onComplete();
      return true;
    }

    this.sprite.play(animationKey, true);
    this.sprite.anims.timeScale = 1;
    const duration = layout.frameCount / layout.frameRate * 1000;
    const lifecycleToken = this.lifecycleToken;
    this.scene.time.delayedCall(duration, () => {
      if (this.active && this.dying && this.lifecycleToken === lifecycleToken) onComplete();
    });
    return true;
  }

  getBossPhaseStatus(): BossPhaseStatus | null {
    const phases = this.def.bossPhases ?? [];
    if (!this.def.bossPhaseLabel && phases.length === 0) return null;
    const activePhase = this.getActiveBossPhase();
    return {
      phase: this.bossPhaseIndex + 2,
      totalPhases: phases.length + 1,
      label: activePhase?.label ?? this.def.bossPhaseLabel ?? '基础阶段',
    };
  }

  consumeBossPhaseTransition(): BossPhaseTransition | null {
    const transition = this.pendingBossPhaseTransition;
    this.pendingBossPhaseTransition = null;
    return transition;
  }

  /** 死亡动画期间实体仍保持 active 供波次等待，但不能再结算已读条能力。 */
  isCombatActive(): boolean {
    return this.active && !this.dying;
  }

  /**
   * 取一份当前视觉快照供尸体残影层使用。
   * 必须在实体回池前调用：回池后 sprite 会被下一只感染体覆写。
   */
  getCorpseSnapshot(): CorpseSnapshot {
    return {
      textureKey: this.sprite.texture.key,
      frameName: this.sprite.frame.name,
      scale: this.baseScale,
      rotation: this.sprite.rotation,
      originY: this.sprite.originY,
      tint: this.baseTint,
    };
  }

  /**
   * 把攻击冷却、能力冷却、前摇与冲刺的时间点整体后移 `offset` 毫秒，
   * 供战场解除冻结时调用。场景时钟在冻结期间仍跟随真实时间前进，不平移的话
   * 恢复瞬间会结算掉玩家没看到的前摇，冷却也会全部变成就绪。
   * 各字段初值是 -Infinity，加法后仍是 -Infinity，无需额外判断。
   */
  shiftTimers(offset: number): void {
    this.lastAttackAt += offset;
    this.abilityReadyAt = this.abilityReadyAt.map((readyAt) => readyAt + offset);
    this.recoveryUntil += offset;
    this.dashUntil += offset;
    this.knockbackUntil += offset;
    if (this.abilityState) {
      this.abilityState.executeAt += offset;
    }
  }

  /**
   * 沿 `angle` 把目标推开 `distance` 像素。
   * 走短时 velocity 覆写而不是直接改坐标：`seek()` 每帧都会重设 velocity，
   * 改坐标会在下一帧被追击逻辑抹平，而且会穿过障碍物碰撞。
   */
  applyKnockback(angle: number, distance: number): void {
    if (!this.active || this.dying || distance <= 0) return;
    const durationMs = 140;
    const speed = distance / (durationMs / 1000);
    this.knockbackVelocityX = Math.cos(angle) * speed;
    this.knockbackVelocityY = Math.sin(angle) * speed;
    this.knockbackUntil = this.scene.time.now + durationMs;
  }

  /** 接触玩家时尝试攻击,返回造成的伤害(冷却未到返回 0)。 */
  tryAttack(now: number): number {
    if (this.dying) return 0;
    // 被击退期间不能咬人：霰弹换来的那点呼吸空间不能被同帧的接触伤害吃掉。
    if (now < this.knockbackUntil) return 0;
    const isDashing = now < this.dashUntil;
    if (this.abilityState || (!isDashing && now < this.recoveryUntil)) return 0;
    if (now - this.lastAttackAt < this.def.attackRate) return 0;
    this.lastAttackAt = now;
    return this.def.damage;
  }

  /** 扣血,返回是否死亡。 */
  hurt(amount: number): boolean {
    if (this.dying) return false;
    this.health -= amount;
    this.scene.tweens.killTweensOf(this.sprite);
    // 受击闪白
    this.sprite.setTintFill(0xffffff);
    this.scene.tweens.add({
      targets: this.sprite,
      scaleX: this.baseScale * 1.08,
      scaleY: this.baseScale * 0.92,
      duration: 45,
      yoyo: true,
    });
    const lifecycleToken = this.lifecycleToken;
    this.scene.time.delayedCall(50, () => {
      if (this.active && this.lifecycleToken === lifecycleToken) this.sprite.setTint(this.baseTint);
    });
    if (this.health > 0) this.updateBossPhase();
    return this.health <= 0;
  }

  private getAllAbilities(): ZombieAbilityDef[] {
    const abilities: ZombieAbilityDef[] = [];
    if (this.def.ability) abilities.push(this.def.ability);
    for (const phase of this.def.bossPhases ?? []) {
      abilities.push(...(phase.unlockAbilities ?? []));
    }
    return abilities;
  }

  private getAvailableAbilities(): ZombieAbilityDef[] {
    const abilities: ZombieAbilityDef[] = [];
    if (this.def.ability) abilities.push(this.def.ability);
    for (let index = 0; index <= this.bossPhaseIndex; index++) {
      abilities.push(...(this.def.bossPhases?.[index]?.unlockAbilities ?? []));
    }
    return abilities;
  }

  private getActiveBossPhase(): BossPhaseDef | null {
    return this.bossPhaseIndex >= 0 ? this.def.bossPhases?.[this.bossPhaseIndex] ?? null : null;
  }

  private resolveAbilityForPhase(ability: ZombieAbilityDef, abilityIndex: number): ZombieAbilityDef {
    if (abilityIndex !== 0) return ability;
    const phase = this.getActiveBossPhase();
    const cooldownMultiplier = phase?.baseAbilityCooldownMultiplier ?? 1;
    const recoveryMultiplier = phase?.baseAbilityRecoveryMultiplier ?? 1;
    if (cooldownMultiplier === 1 && recoveryMultiplier === 1) return ability;
    return {
      ...ability,
      cooldown: ability.cooldown * cooldownMultiplier,
      recovery: ability.recovery * recoveryMultiplier,
    };
  }

  private updateBossPhase(): void {
    const phases = this.def.bossPhases ?? [];
    if (phases.length === 0 || this.def.health <= 0) return;
    const healthRatio = this.health / this.def.health;
    let nextPhaseIndex = this.bossPhaseIndex;
    for (let index = this.bossPhaseIndex + 1; index < phases.length; index++) {
      if (healthRatio <= phases[index].healthRatio) nextPhaseIndex = index;
    }
    if (nextPhaseIndex === this.bossPhaseIndex) return;

    const previousPhase = this.bossPhaseIndex + 2;
    this.bossPhaseIndex = nextPhaseIndex;
    const status = this.getBossPhaseStatus();
    if (status) this.pendingBossPhaseTransition = { ...status, previousPhase };
  }

  private restoreMovementAnimation(): void {
    this.presentationState = 'move';
    this.sprite.setTexture(this.visual.textureKey);
    this.sprite.play(getZombieAnimationKey(this.typeId, this.facing), true);
    const animationFrameRate = this.sprite.anims.currentAnim?.frameRate ?? this.visual.frameRate;
    this.sprite.anims.timeScale = this.visual.frameRate / animationFrameRate;
  }
}
