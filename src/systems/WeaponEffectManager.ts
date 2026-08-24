import Phaser from 'phaser';
import { DEPTH } from '../constants';
import type { WeaponId } from '../config/weapons';
import {
  EFFECT_ASSET_KEYS,
  FLAME_JET_VISUAL,
  getMuzzleFlashProfile,
  type MuzzleFlashProfile,
} from '../config/effectVisuals';
import { accessibilityFactor } from './FeedbackRules';
import { DEFAULT_ACCESSIBILITY_SETTINGS, SaveManager, SAVE_KEYS } from './SaveManager';
import type { EffectSpritePool } from './EffectSpritePool';
import type { WeaponFireFeedback } from './WeaponManager';
import { ObjectPool } from '../utils/ObjectPool';
import { randRange } from '../utils/math';

/** 枪口世界坐标与朝向。与 `Player.getMuzzle()` 的返回同形。 */
export interface MuzzleTransform {
  x: number;
  y: number;
  angle: number;
}

/** 抛壳的尺寸与飞行参数。都是"看起来对"的量，没有物理依据，集中放在一处便于整体调。 */
const CASING = {
  length: 4,
  width: 2,
  /** 抛壳方向相对瞄准方向的基准偏转：正右偏后，模拟右侧抛壳口。 */
  baseAngle: Math.PI * 0.58,
  angleJitter: 0.34,
  minDistance: 16,
  maxDistance: 34,
  minDuration: 260,
  maxDuration: 420,
} as const;

/** 余烟的染色与飘散。冷灰而不是纯白：纯白在深色战场上比枪焰还抢眼。 */
const SMOKE = {
  tint: 0x9aa2ae,
  alpha: 0.5,
  /** 沿膛线方向的初始前移，让烟从枪口前方而不是握把处冒出。 */
  forwardOffset: 7,
  driftForward: 16,
  driftSide: 9,
  driftDuration: 420,
} as const;

/**
 * 武器开火表现。
 *
 * 改造前这一层是 `GameScene.spawnMuzzleFlash` 里的一个圆 + 若干矩形，十一把武器共用同一
 * 组图元，差别只有半径和颜色。本类把它换成按档位取的位图帧动画，并补上三类此前完全没有的
 * 表现：抛壳、余烟、持续开火积热。
 *
 * 三个必须由本类而不是 GameScene 承担的理由：
 * 1. **喷火器的火舌是跨帧状态**，不是一次性反馈。它必须每帧跟随枪口、按架枪进度伸缩，
 *    并在停火后延时收起；GameScene 的开火分支只在"这一帧真的击发了"时才进入。
 * 2. **积热同理**：加特林的枪口余热跟的是 `braceRatio` 这条连续曲线，不是离散的击发事件。
 * 3. 抛壳与余烟需要各自的对象池。放在 GameScene 里会让那个已经 1900 行的文件再多三个池。
 *
 * 素材缺失时全部回落到图元路径（见 `spawnPrimitiveFlash`）：预载失败不能让屏幕上出现
 * Phaser 的绿色缺失纹理方块，那比没有特效糟糕得多。
 */
export class WeaponEffectManager {
  private scene: Phaser.Scene;
  private sprites: EffectSpritePool;
  private casingPool: ObjectPool<Phaser.GameObjects.Rectangle>;
  /** 喷口火舌是跨帧常驻对象，不进池：全场同时最多一条。 */
  private flameJet: Phaser.GameObjects.Sprite | null = null;
  private heatGlow: Phaser.GameObjects.Arc | null = null;
  private lastFireAt = -Infinity;
  private flashFactorValue = 1;
  private flashFactorReadAt = -Infinity;

  constructor(scene: Phaser.Scene, sprites: EffectSpritePool) {
    this.scene = scene;
    this.sprites = sprites;
    this.casingPool = new ObjectPool(
      scene,
      (owner) => {
        const casing = owner.add.rectangle(0, 0, CASING.length, CASING.width, 0xe8c15c, 1);
        casing.setActive(false);
        casing.setVisible(false);
        return casing;
      },
      8,
    );
  }

  /**
   * 一次击发的枪口表现。
   *
   * `sustainRatio` 是架枪进度 0~1（`WeaponManager.updateMobility` 的 `braceRatio`）。
   * 只有配了 `mobility.sustainedFire` 的三把武器会离开 0，所以"转得越快焰越大"这条
   * 对其余武器天然不生效，不需要额外分支。
   */
  playFire(feedback: WeaponFireFeedback, weaponId: WeaponId, sustainRatio: number): void {
    this.lastFireAt = this.scene.time.now;
    const factor = this.flashFactor();
    if (factor <= 0) return;

    const profile = getMuzzleFlashProfile(weaponId);
    // 强调色口径沿用改造前的 spawnMuzzleFlash：弹链青色、齐射亮金，普通开火不染色。
    // 不染色是刻意的——位图素材自带白热核心与橙红外缘，染色只会把它压成单色。
    const accent = feedback.ammoChainTriggered
      ? (weaponId === 'golden_m249' ? feedback.color : 0x0acbe6)
      : feedback.burstCount > 1
        ? 0xffd54a
        : undefined;
    const boost = (feedback.ammoChainTriggered ? 1.45 : feedback.burstCount > 1 ? 1.22 : 1)
      * (1 + 0.28 * sustainRatio);

    if (profile.textureKey !== null) {
      if (this.sprites.has(profile.textureKey)) {
        this.spawnFlashSprites(feedback, profile, accent, boost, factor);
      } else {
        this.spawnPrimitiveFlash(feedback, accent ?? feedback.color, boost);
      }
    }

    if (profile.smokeChance > 0 && Math.random() < profile.smokeChance * factor) {
      this.spawnMuzzleSmoke(feedback, profile, boost);
    }
    // 弹链触发时多抛两枚壳：那一发本来就是"多打出去一串"，抛壳量是最直观的表达。
    const casings = Math.round(profile.casings * factor) + (feedback.ammoChainTriggered ? 2 : 0);
    for (let index = 0; index < casings; index += 1) {
      this.spawnCasing(feedback, profile);
    }
  }

  /**
   * 每帧推进跨帧表现：喷口火舌与枪口积热。
   *
   * 必须在 `Player.update` 之后调用：`getMuzzle()` 读的是当帧的 `aimAngle`，
   * 早一步拿到的是上一帧的朝向，火舌会滞后一帧、在快速甩枪时明显脱离枪口。
   */
  update(now: number, weaponId: WeaponId, muzzle: MuzzleTransform, sustainRatio: number): void {
    const factor = this.flashFactor(now);
    const firing = now - this.lastFireAt <= FLAME_JET_VISUAL.holdMs;
    const profile = getMuzzleFlashProfile(weaponId);

    if (weaponId === 'flamethrower' && firing && factor > 0) {
      this.syncFlameJet(muzzle, sustainRatio);
    } else {
      this.hideFlameJet();
    }

    if (profile.heatRadius > 0 && firing && sustainRatio > 0.02 && factor > 0) {
      this.syncHeatGlow(muzzle, profile, sustainRatio, factor);
    } else if (this.heatGlow) {
      this.heatGlow.setVisible(false);
    }
  }

  /**
   * 把最后击发时间整体后移，供战场解除冻结时调用。
   * `lastFireAt` 是绝对时间点而场景时钟在冻结期间仍跟随真实时间前进，不平移的话
   * 恢复瞬间会判定为"很久没开火"，正在喷火的火舌会闪断一帧。
   * 初值是 -Infinity，加法后仍是 -Infinity，无需额外判断。
   */
  shiftTimers(offset: number): void {
    this.lastFireAt += offset;
    this.flashFactorReadAt += offset;
  }

  destroy(): void {
    this.hideFlameJet();
    this.flameJet?.destroy();
    this.flameJet = null;
    this.heatGlow?.destroy();
    this.heatGlow = null;
    this.casingPool.forEachActive((casing) => {
      this.scene.tweens.killTweensOf(casing);
      casing.setActive(false);
      casing.setVisible(false);
    });
    this.casingPool.phaserGroup.destroy(true);
  }

  private spawnFlashSprites(
    feedback: WeaponFireFeedback,
    profile: MuzzleFlashProfile,
    accent: number | undefined,
    boost: number,
    factor: number,
  ): void {
    if (profile.textureKey === null) return;
    // 齐射每束一片焰，角度微散：改造前用矩形拖影表达齐射，位图焰本身就有方向性，
    // 复制多份再各自偏转比叠加拖影更能读出"同时打出了几束"。
    for (let index = 0; index < feedback.burstCount; index += 1) {
      const offset = (index - (feedback.burstCount - 1) / 2) * 0.05;
      this.sprites.spawn(profile.textureKey, {
        x: feedback.x,
        y: feedback.y,
        rotation: feedback.angle + offset,
        width: profile.length * boost * randRange(0.9, 1.1),
        blend: 'add',
        tint: accent,
        alpha: 0.55 + 0.45 * factor,
        depth: DEPTH.effect,
      });
    }
  }

  /**
   * 素材缺失时的图元回落，形态与改造前的 `spawnMuzzleFlash` 一致。
   * 保留它不是为了"两套表现都要维护"，而是为了让一次预载失败退化成"特效变糙"
   * 而不是"屏幕上出现绿色方块"。
   */
  private spawnPrimitiveFlash(feedback: WeaponFireFeedback, accent: number, boost: number): void {
    const flash = this.scene.add.circle(
      feedback.x,
      feedback.y,
      Math.max(8, 6 + feedback.pellets) * boost,
      accent,
      0.78,
    );
    flash.setDepth(DEPTH.effect);
    const streaks = Array.from({ length: feedback.burstCount }, (_, index) => {
      const streak = this.scene.add.rectangle(
        feedback.x,
        feedback.y,
        (22 + feedback.pellets * 2) * boost,
        4 * boost,
        accent,
        0.92,
      );
      streak.setDepth(DEPTH.effect);
      streak.setRotation(feedback.angle + (index - (feedback.burstCount - 1) / 2) * 0.045);
      return streak;
    });
    this.scene.tweens.add({
      targets: [flash, ...streaks],
      alpha: 0,
      scaleX: 1.8,
      scaleY: 0.2,
      duration: 90,
      onComplete: () => {
        flash.destroy();
        streaks.forEach((streak) => streak.destroy());
      },
    });
  }

  private spawnMuzzleSmoke(
    feedback: WeaponFireFeedback,
    profile: MuzzleFlashProfile,
    boost: number,
  ): void {
    const forward = { x: Math.cos(feedback.angle), y: Math.sin(feedback.angle) };
    const smoke = this.sprites.spawn(EFFECT_ASSET_KEYS.smokePuff, {
      x: feedback.x + forward.x * SMOKE.forwardOffset,
      y: feedback.y + forward.y * SMOKE.forwardOffset,
      rotation: randRange(0, Math.PI * 2),
      width: profile.smokeSize * boost,
      blend: 'normal',
      tint: SMOKE.tint,
      alpha: SMOKE.alpha,
      // 压在枪焰之下：烟必须被焰盖住，反过来会让每一枪先亮后被一团灰糊掉。
      depth: DEPTH.effect - 1,
    });
    if (!smoke) return;
    const side = randRange(-SMOKE.driftSide, SMOKE.driftSide);
    this.scene.tweens.add({
      targets: smoke,
      x: smoke.x + forward.x * SMOKE.driftForward - forward.y * side,
      y: smoke.y + forward.y * SMOKE.driftForward + forward.x * side,
      alpha: 0,
      duration: SMOKE.driftDuration,
      ease: 'Quad.Out',
    });
  }

  private spawnCasing(feedback: WeaponFireFeedback, profile: MuzzleFlashProfile): void {
    const casing = this.casingPool.acquire();
    this.scene.tweens.killTweensOf(casing);
    casing.setFillStyle(profile.casingColor, 1);
    casing.setSize(CASING.length, CASING.width);
    casing.setPosition(feedback.x, feedback.y);
    casing.setRotation(feedback.angle);
    casing.setAlpha(1);
    casing.setDepth(DEPTH.effect - 2);
    casing.setActive(true);
    casing.setVisible(true);

    const direction = feedback.angle + CASING.baseAngle
      + randRange(-CASING.angleJitter, CASING.angleJitter);
    const distance = randRange(CASING.minDistance, CASING.maxDistance);
    this.scene.tweens.add({
      targets: casing,
      x: feedback.x + Math.cos(direction) * distance,
      y: feedback.y + Math.sin(direction) * distance,
      rotation: casing.rotation + randRange(6, 11),
      alpha: 0,
      duration: randRange(CASING.minDuration, CASING.maxDuration),
      ease: 'Quad.Out',
      onComplete: () => {
        casing.setActive(false);
        casing.setVisible(false);
      },
    });
  }

  private syncFlameJet(muzzle: MuzzleTransform, sustainRatio: number): void {
    if (!this.flameJet) {
      this.flameJet = this.sprites.spawn(EFFECT_ASSET_KEYS.flameJet, {
        x: muzzle.x,
        y: muzzle.y,
        rotation: muzzle.angle,
        width: FLAME_JET_VISUAL.length,
        blend: 'add',
        depth: DEPTH.effect,
      });
      if (!this.flameJet) return;
    }
    const ratio = FLAME_JET_VISUAL.minLengthRatio
      + (1 - FLAME_JET_VISUAL.minLengthRatio) * sustainRatio;
    const jitter = 1 + randRange(-FLAME_JET_VISUAL.lengthJitter, FLAME_JET_VISUAL.lengthJitter);
    this.flameJet.setVisible(true);
    this.flameJet.setActive(true);
    this.flameJet.setPosition(muzzle.x, muzzle.y);
    this.flameJet.setRotation(muzzle.angle);
    // 只改缩放不改 displayWidth：等比缩放才能保住像素颗粒度，
    // 拉伸宽度会让火舌在长短变化时像被压扁。
    this.flameJet.setScale(
      (FLAME_JET_VISUAL.length * ratio * jitter) / this.flameJet.frame.width,
    );
  }

  private hideFlameJet(): void {
    if (!this.flameJet) return;
    this.flameJet.setVisible(false);
  }

  private syncHeatGlow(
    muzzle: MuzzleTransform,
    profile: MuzzleFlashProfile,
    sustainRatio: number,
    factor: number,
  ): void {
    if (!this.heatGlow) {
      // 半径固定建一次、之后只改缩放：Arc 改半径要重建几何，而这个对象每帧都在变。
      this.heatGlow = this.scene.add.circle(muzzle.x, muzzle.y, 16, 0xffffff, 0.5);
      this.heatGlow.setBlendMode(Phaser.BlendModes.ADD);
      this.heatGlow.setDepth(DEPTH.effect - 1);
    }
    this.heatGlow.setFillStyle(profile.heatColor, 0.12 + 0.26 * sustainRatio * factor);
    this.heatGlow.setPosition(muzzle.x, muzzle.y);
    this.heatGlow.setScale((profile.heatRadius * (0.45 + 0.55 * sustainRatio)) / 16);
    this.heatGlow.setVisible(true);
  }

  /**
   * 无障碍闪光强度，带 400ms 缓存。
   *
   * 不能只在构造时读一次：暂停菜单可以进设置改这一项，改完必须当场生效。
   * 也不该每帧读：`SaveManager.load` 每次都要解析一次 localStorage JSON，
   * 而 `update` 是每帧调用、`playFire` 在 MP5 上每秒 20 次。
   */
  private flashFactor(now = this.scene.time.now): number {
    if (now - this.flashFactorReadAt < 400) return this.flashFactorValue;
    this.flashFactorReadAt = now;
    const settings = SaveManager.load(SAVE_KEYS.accessibilitySettings, DEFAULT_ACCESSIBILITY_SETTINGS);
    this.flashFactorValue = accessibilityFactor(settings.flash);
    return this.flashFactorValue;
  }
}
