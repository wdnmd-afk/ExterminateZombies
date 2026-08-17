import Phaser from 'phaser';
import { DEPTH, GAME_WIDTH, GAME_HEIGHT } from '../constants';
import type { DamageDropoffStop, EffectDef, MarkOnHitDef } from '../config/types';
import { ProjectileImpact } from '../systems/ProjectileImpact';
import { ENVIRONMENT_TEXTURE_KEYS } from '../systems/EnvironmentAssetManager';
import {
  resolveDropoffMultiplier,
  resolveObstacleBounce,
  resolvePierceDamage,
  type ObstacleBounds,
} from '../systems/WeaponCombatRules';

/**
 * 一次击发的全部参数。
 * 改用选项对象而不是位置参数：加入爽感字段后位置参数已超过十项、完全不可读，
 * 而调用点只有 `WeaponManager.tryFire` 一处，改造成本很低。
 */
export interface BulletFireOptions {
  x: number;
  y: number;
  angle: number;
  speed: number;
  /** 已含暴击倍率的基础伤害；距离衰减与穿透加成在命中期再算。 */
  damage: number;
  penetration: number;
  range: number;
  color: number;
  radius: number;
  impactEffect?: EffectDef;
  isCritical?: boolean;
  /** 每穿透一个目标后的伤害倍率。 */
  chainBonus?: number;
  /** 对非 Boss 造成致死命中时请求的慢动作档位。 */
  killSlowMotionTier?: 'A' | 'S';
  /** 命中障碍后的剩余反弹次数。 */
  bounceCount?: number;
  /** 命中后推开目标的基准距离。 */
  knockback?: number;
  /** 目标生命比例低于该值时直接处决。 */
  executeThreshold?: number;
  damageDropoff?: DamageDropoffStop[];
  markOnHit?: MarkOnHitDef;
}

export class Bullet extends Phaser.GameObjects.Image {
  declare body: Phaser.Physics.Arcade.Body;

  /** 基础伤害（已含暴击）。实际结算走 `resolveHitDamage`。 */
  damage = 0;
  penetration = 0;
  isCritical = false;
  knockback = 0;
  executeThreshold = 0;
  killSlowMotionTier: 'A' | 'S' | null = null;
  markOnHit: MarkOnHitDef | null = null;
  private bouncesRemaining = 0;
  private chainBonus = 1;
  private damageDropoff: DamageDropoffStop[] | undefined;
  /** 本颗子弹已经击中的目标数，用于穿透加成与穿透计数播报。 */
  private hitCount = 0;
  private lastPathX = 0;
  private lastPathY = 0;
  private traveledDistance = 0;
  private maxRange = 0;
  private readonly impact = new ProjectileImpact();
  readonly hitSet = new Set<Phaser.GameObjects.GameObject>();

  constructor(scene: Phaser.Scene) {
    super(scene, 0, 0, ENVIRONMENT_TEXTURE_KEYS.bulletFriendly);
    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.setDepth(DEPTH.bullet);
    this.setActive(false);
    this.setVisible(false);
    this.body.enable = false;
  }

  fire(options: BulletFireOptions): void {
    const { x, y, angle, radius } = options;
    this.setPosition(x, y);
    this.setRotation(angle);
    this.traveledDistance = 0;
    this.maxRange = options.range;
    this.damage = options.damage;
    this.penetration = options.penetration;
    this.isCritical = options.isCritical ?? false;
    this.knockback = options.knockback ?? 0;
    this.executeThreshold = options.executeThreshold ?? 0;
    this.killSlowMotionTier = options.killSlowMotionTier ?? null;
    this.markOnHit = options.markOnHit ? { ...options.markOnHit } : null;
    this.bouncesRemaining = Math.max(0, Math.round(options.bounceCount ?? 0));
    this.chainBonus = options.chainBonus ?? 1;
    this.damageDropoff = options.damageDropoff;
    this.hitCount = 0;
    this.impact.reset(options.impactEffect);
    this.hitSet.clear();

    const isExplosive = Boolean(options.impactEffect);
    const textureKey = isExplosive
      ? ENVIRONMENT_TEXTURE_KEYS.bulletExplosive
      : ENVIRONMENT_TEXTURE_KEYS.bulletFriendly;
    this.setTexture(textureKey);
    if (isExplosive) {
      this.setTint(0xffa45f);
      this.setBlendMode(Phaser.BlendModes.NORMAL);
      this.setDisplaySize(radius * 4.5, radius * 1.9);
    } else {
      // 暴击弹用高亮金色且更粗：玩家在弹道上就能看出这一发会打出暴击。
      this.setTintFill(this.isCritical ? 0xffd54a : options.color);
      this.setBlendMode(Phaser.BlendModes.ADD);
      this.setDisplaySize(
        Math.max(22, radius * (this.isCritical ? 6.5 : 5)),
        Math.max(9, radius * (this.isCritical ? 2.6 : 2)),
      );
    }
    this.setOrigin(0.5, 0.5);

    this.setActive(true);
    this.setVisible(true);
    this.body.enable = true;
    this.body.reset(x, y);
    this.body.setCircle(radius);
    this.lastPathX = this.body.center.x;
    this.lastPathY = this.body.center.y;
    this.scene.physics.velocityFromRotation(angle, options.speed, this.body.velocity);
  }

  /** 从枪口到当前位置的飞行距离。 */
  travelDistance(): number {
    return this.traveledDistance
      + Phaser.Math.Distance.Between(this.lastPathX, this.lastPathY, this.body.center.x, this.body.center.y);
  }

  /**
   * 是否属于「以穿透为签名」的武器。
   * 用来决定要不要播报穿透计数：霰弹每颗弹丸也有 1 点穿透，
   * 不加这道闸门一次开火会刷出十几条 `×2 PIERCE!`，把真正的穿透爽感稀释掉。
   */
  get hasChainBonus(): boolean {
    return this.chainBonus > 1;
  }

  /**
   * 本次命中的实际伤害：基础伤害 × 距离衰减 × 穿透加成。
   * 只做计算不改状态；命中确认后由调用方 `registerHit()` 推进穿透计数。
   */
  resolveHitDamage(): number {
    const dropoff = resolveDropoffMultiplier(this.damageDropoff, this.travelDistance());
    return resolvePierceDamage(this.damage * dropoff, this.chainBonus, this.hitCount);
  }

  /** 记录一次命中并返回累计命中数，供穿透计数播报使用。 */
  registerHit(): number {
    this.hitCount += 1;
    return this.hitCount;
  }

  consumeImpactEffect(): EffectDef | null {
    return this.impact.consume();
  }

  /**
   * 爆炸弹命中障碍时的反弹。
   * Arcade 静态体不提供可靠的碰撞法线，这里用上一物理步到当前刚体圆心的扫掠线段判断入口面。
   * 反弹后按刚体圆心移出障碍 AABB，并重置路径采样点，避免把纠正位置算进真实射程。
   */
  tryBounceFromObstacle(
    obstacleBounds: ObstacleBounds,
  ): boolean {
    if (this.bouncesRemaining <= 0 || !this.body) return false;
    this.bouncesRemaining -= 1;

    const velocity = this.body.velocity;
    const radius = this.body.halfWidth;
    const currentCenterX = this.body.center.x;
    const currentCenterY = this.body.center.y;
    const resolution = resolveObstacleBounce(
      this.body.prev.x + this.body.halfWidth,
      this.body.prev.y + this.body.halfHeight,
      currentCenterX,
      currentCenterY,
      velocity.x,
      velocity.y,
      obstacleBounds,
      radius,
    );
    this.commitTravelToCurrentPosition();
    const reflectedX = resolution.velocityX;
    const reflectedY = resolution.velocityY;
    this.setRotation(Math.atan2(reflectedY, reflectedX));
    // 碰撞回调发生在 Arcade Physics 把本步位移回写给 GameObject 之前；只修正刚体位置，
    // 由 postUpdate 正常平移贴图，不能在这里 body.reset() 抹掉已经走过的物理步。
    this.body.position.set(
      resolution.centerX - this.body.halfWidth,
      resolution.centerY - this.body.halfHeight,
    );
    this.body.updateCenter();
    this.body.setVelocity(reflectedX, reflectedY);
    this.lastPathX = resolution.centerX;
    this.lastPathY = resolution.centerY;
    return true;
  }

  despawn(): void {
    this.setActive(false);
    this.setVisible(false);
    this.body.enable = false;
    this.body.stop();
  }

  tick(): boolean {
    if (!this.active) return false;
    this.commitTravelToCurrentPosition();
    if (this.traveledDistance >= this.maxRange) {
      return true;
    }
    if (this.x < -20 || this.x > GAME_WIDTH + 20 || this.y < -20 || this.y > GAME_HEIGHT + 20) {
      return true;
    }
    return false;
  }

  private commitTravelToCurrentPosition(): void {
    this.traveledDistance += Phaser.Math.Distance.Between(
      this.lastPathX,
      this.lastPathY,
      this.body.center.x,
      this.body.center.y,
    );
    this.lastPathX = this.body.center.x;
    this.lastPathY = this.body.center.y;
  }
}
