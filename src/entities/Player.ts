import Phaser from 'phaser';
import { DEPTH } from '../constants';
import type { InputManager } from '../systems/InputManager';
import { angleBetween } from '../utils/math';
import type { CharacterGripAnchor } from '../config/characters';
import type { WeaponId } from '../config/weapons';
import {
  getWeaponGameplayVisual,
  resolveWeaponMount,
  type WeaponGameplayVisual,
  type WeaponMountOffsets,
} from '../systems/WeaponAssetManager';

const DEFAULT_PLAYER_SPEED = 120; // 角色配置缺失时的安全回退值
const PLAYER_SIZE = 28;        // 逻辑体尺寸(枪管落点、阴影用)
const PLAYER_RADIUS = 16;      // 物理碰撞半径
const INVULN_MS = 500;         // 受伤后无敌帧,防连扣
const SHADOW_BASE_ALPHA = 0.28;   // 无负重时的落地阴影不透明度
const SHADOW_LOAD_SPREAD = 0.55;  // 负重把阴影横向压开的最大比例
const SHADOW_LOAD_DEPTH = 0.35;   // 负重把阴影加深的最大比例
const SHADOW_LOAD_ALPHA = 0.3;    // 负重叠加到阴影不透明度上的最大值
const SPRITE_LOAD_SAG = 2.4;      // 负重把人物压低的最大像素数

/** 玩家实体需要的角色视觉数据。`CharacterDef` 天然满足这个形状。 */
export interface PlayerCharacterVisual {
  textureKey: string;
  handTextureKey: string | null;
  gripAnchor: CharacterGripAnchor;
  spriteScale: number;
}

/**
 * 玩家实体。
 *
 * 层序是 阴影 → 武器 → 躯干 → 持枪手，三层缺一不可：
 * 武器在躯干之下，枪托与机匣才会被身体压住而不是横穿胸口；
 * 持枪手在武器之上，握把才会被手掌盖住。少了最上面那层手，
 * 武器就会变成「浮在人物旁边的一把枪」（2026-08-18 到 2026-08-21 之间的表现）。
 *
 * 武器的落点由两侧锚点算出：人物锚点 `gripAnchor` 量在人物贴图上，
 * 武器锚点 `gripX / boreY / muzzleX` 量在武器贴图上，
 * 合成见 `resolveWeaponMount`。人物按鼠标瞄准角连续旋转；
 * Container、阴影和圆形物理体保持不旋转。
 */
export class Player extends Phaser.GameObjects.Container {
  declare body: Phaser.Physics.Arcade.Body;

  private invulnerableUntil = -Infinity;
  private sprite: Phaser.GameObjects.Image;
  /** 落地阴影。负重表现靠它「压在地上」，因此必须持有引用而不是构造时丢弃。 */
  private shadow: Phaser.GameObjects.Ellipse;
  /** 上一帧的负重值，用于跳过无变化的帧；重武器待机时每帧重设图层毫无意义。 */
  private encumbrance = -1;
  /** 压在武器之上的持枪手层；实机贴图自带拳头的角色没有这一层。 */
  private handSprite: Phaser.GameObjects.Image | null;
  private weaponSprite: Phaser.GameObjects.Image;
  /** 瞄准角(弧度)。容器本体不旋转，由此角驱动人物、枪身与枪口。 */
  private aimAngle = 0;
  private weaponId: WeaponId = 'pistol';
  private weaponVisual: WeaponGameplayVisual = getWeaponGameplayVisual('pistol');
  private readonly gripAnchor: CharacterGripAnchor;
  /**
   * 人物层显示缩放。取自角色配置而不是模块常量：Kenney 位图与自生成精灵的
   * 源画幅不同，要在实机上得到同样的体型必须给不同的倍率（说明见
   * `CharacterDef.spriteScale`）。武器锚点也按这个倍率换算，所以两者必须同源。
   */
  private readonly spriteScale: number;
  private mount: WeaponMountOffsets;

  constructor(scene: Phaser.Scene, x: number, y: number, character: PlayerCharacterVisual) {
    super(scene, x, y);

    this.gripAnchor = character.gripAnchor;
    this.spriteScale = character.spriteScale;
    this.mount = resolveWeaponMount(this.weaponVisual, this.gripAnchor, this.spriteScale);

    const shadow = scene.add.ellipse(0, 14, PLAYER_SIZE, 11, 0x000000, SHADOW_BASE_ALPHA);
    this.shadow = shadow;
    this.sprite = scene.add.image(0, 0, character.textureKey);
    this.sprite.setScale(this.spriteScale);
    this.weaponSprite = scene.add.image(0, 0, this.weaponVisual.textureKey, this.weaponVisual.frame);
    this.applyWeaponVisual(this.weaponVisual);
    // 手层画幅与躯干贴图共用同一几何中心（见 process_character_hand_layers.py），
    // 所以两层用同一位置、同一缩放、同一旋转角即可对齐，代码里不需要偏移量。
    this.handSprite = character.handTextureKey
      ? scene.add.image(0, 0, character.handTextureKey).setScale(this.spriteScale)
      : null;
    this.add([
      shadow,
      this.weaponSprite,
      this.sprite,
      ...(this.handSprite ? [this.handSprite] : []),
    ]);

    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.body.setCircle(PLAYER_RADIUS, -PLAYER_RADIUS, -PLAYER_RADIUS);
    this.body.setCollideWorldBounds(true);
    this.setDepth(DEPTH.player);
  }

  /** 枪口世界坐标。落在人物持枪中线上、沿瞄准方向前移一段枪管长度。 */
  getMuzzle(): { x: number; y: number; angle: number } {
    const offset = this.rotateOffset(this.mount.muzzleForward, this.mount.muzzleSide);
    return {
      x: this.x + offset.x,
      y: this.y + offset.y,
      angle: this.aimAngle,
    };
  }

  /** 将当前真实枪械贴图、锚点和缩放应用到玩家手部覆盖层。 */
  setWeaponVisual(weaponId: WeaponId): void {
    if (weaponId === this.weaponId) return;
    this.weaponId = weaponId;
    this.weaponVisual = getWeaponGameplayVisual(weaponId);
    this.applyWeaponVisual(this.weaponVisual);
  }

  /**
   * 负重表现。`load` = `1 - 移速倍率`，0 表示完全不受影响。
   *
   * 表达方式是「压在地上」而不是变色或加特效：阴影横向压开、加深，人物轻微下沉。
   * 玩家看到的是重量，而不是一个会被误读成「中了减速 debuff」的状态图标。
   * 不用 tween：这个值每帧连续变化，tween 会互相打断并和受击/开火的缩放动画抢同一批属性。
   */
  setEncumbrance(load: number): void {
    const safeLoad = Number.isFinite(load) ? Math.max(0, Math.min(1, load)) : 0;
    if (safeLoad === this.encumbrance) return;
    this.encumbrance = safeLoad;
    this.shadow
      .setScale(1 + safeLoad * SHADOW_LOAD_SPREAD, 1 + safeLoad * SHADOW_LOAD_DEPTH)
      .setAlpha(SHADOW_BASE_ALPHA + safeLoad * SHADOW_LOAD_ALPHA);
    // 躯干与持枪手是同一个人，下沉必须同步，否则手会从身上脱开。
    const sag = safeLoad * SPRITE_LOAD_SAG;
    for (const layer of this.characterLayers()) layer.setY(sag);
  }

  /**
   * 本帧是否处于移动状态，供武器计算移动射击散射惩罚。
   * 读物理速度而不是输入：`GameScene` 在 `player.update` 之后才调 `WeaponManager.update`，
   * 此时速度已是本帧最终值，且撞墙被挡停时也能正确判定为"未移动"。
   */
  isMoving(): boolean {
    return this.body.velocity.lengthSq() > 0;
  }

  update(input: InputManager, moveSpeed = DEFAULT_PLAYER_SPEED): void {
    // —— 移动:合成方向向量并归一化,避免斜向更快 ——
    let vx = 0;
    let vy = 0;
    if (input.isDown('moveUp')) vy -= 1;
    if (input.isDown('moveDown')) vy += 1;
    if (input.isDown('moveLeft')) vx -= 1;
    if (input.isDown('moveRight')) vx += 1;
    const isMoving = vx !== 0 || vy !== 0;
    if (isMoving) {
      const inv = 1 / Math.hypot(vx, vy);
      this.body.setVelocity(vx * inv * moveSpeed, vy * inv * moveSpeed);
    } else {
      this.body.setVelocity(0, 0);
    }

    // —— 瞄准:躯干、持枪手、枪身与枪口共同跟随鼠标，容器与物理体保持不转。 ——
    const p = input.getPointerWorld();
    this.aimAngle = angleBetween(this.x, this.y, p.x, p.y);
    const grip = this.rotateOffset(this.mount.gripForward, this.mount.gripSide);
    // 直接读躯干的 y 当作负重下沉量：枪握在手里，人沉多少枪就得沉多少，
    // 各自算一遍迟早会分叉（受击与开火动画只动缩放，不动 y，所以这个值是可信的）。
    this.weaponSprite.setPosition(grip.x, grip.y + this.sprite.y).setRotation(this.aimAngle);
    this.sprite.setFlipX(false).setRotation(this.aimAngle);
    this.handSprite?.setRotation(this.aimAngle);
  }

  playFireFeedback(accentColor: number): void {
    this.scene.tweens.killTweensOf(this.weaponSprite);
    const baseScale = this.weaponVisual.scale;
    this.weaponSprite.setTint(accentColor);
    this.scene.tweens.add({
      targets: this.weaponSprite,
      scaleX: baseScale * 1.12,
      scaleY: baseScale * 0.92,
      duration: 35,
      yoyo: true,
      onComplete: () => {
        this.weaponSprite.setScale(baseScale);
        this.weaponSprite.clearTint();
      },
    });
    // 躯干与持枪手是同一个人，挤压必须同步，否则手会从身上脱开。
    this.scene.tweens.add({
      targets: this.characterLayers(),
      scaleX: this.spriteScale * 0.94,
      scaleY: this.spriteScale * 1.05,
      duration: 35,
      yoyo: true,
    });
  }

  private applyWeaponVisual(visual: WeaponGameplayVisual): void {
    this.scene.tweens.killTweensOf(this.weaponSprite);
    this.weaponSprite
      .clearTint()
      .setTexture(visual.textureKey, visual.frame)
      .setScale(visual.scale);
    // setTexture 会按 origin 比例重算锚点，因此必须在换贴图之后再按像素设锚点。
    this.weaponSprite.setDisplayOrigin(visual.gripX, visual.boreY);
    this.mount = resolveWeaponMount(visual, this.gripAnchor, this.spriteScale);
  }

  /** 把「沿瞄准方向 / 侧向」的偏移旋转成容器内的 x / y 偏移。 */
  private rotateOffset(forward: number, side: number): { x: number; y: number } {
    const cos = Math.cos(this.aimAngle);
    const sin = Math.sin(this.aimAngle);
    return {
      x: cos * forward - sin * side,
      y: sin * forward + cos * side,
    };
  }

  /** 属于「人物本体」的图层。受击与开火反馈要整体作用，不能只动躯干。 */
  private characterLayers(): Phaser.GameObjects.Image[] {
    return this.handSprite ? [this.sprite, this.handSprite] : [this.sprite];
  }

  /** 把无敌帧时间点后移 `offset` 毫秒，供战场解除冻结时调用（说明见 GameScene.shiftBattleTimers）。 */
  shiftTimers(offset: number): void {
    this.invulnerableUntil += offset;
  }

  /** 尝试受伤;处于无敌帧内则忽略。返回是否实际扣血。 */
  takeDamage(_amount: number, now: number): boolean {
    if (now < this.invulnerableUntil) return false;
    this.invulnerableUntil = now + INVULN_MS;
    // 受击闪红只作用于人物，武器保留原色以免影响枪型辨识。
    const layers = this.characterLayers();
    for (const layer of layers) layer.setTint(0xff5555);
    this.scene.tweens.add({
      targets: layers,
      alpha: 0.35,
      duration: 60,
      yoyo: true,
      onComplete: () => {
        for (const layer of layers) {
          layer.clearTint();
          layer.setAlpha(1);
        }
      },
    });
    this.scene.tweens.add({
      targets: layers,
      scaleX: this.spriteScale * 1.08,
      scaleY: this.spriteScale * 0.92,
      duration: 55,
      yoyo: true,
    });
    return true;
  }

  /** 延长当前无敌窗口；守望者的致命保护使用它覆盖普通受伤无敌帧。 */
  grantInvulnerability(now: number, durationMs: number): void {
    this.invulnerableUntil = Math.max(this.invulnerableUntil, now + Math.max(0, durationMs));
  }
}
