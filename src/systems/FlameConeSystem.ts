import Phaser from 'phaser';
import { DEPTH } from '../constants';
import type { LingerDef } from '../config/types';
import type { Zombie } from '../entities/Zombie';
import type { AabbTile } from '../utils/geometry';
import { clamp, degToRad, randRange } from '../utils/math';
import type { ActiveConeAttack } from './WeaponManager';
import {
  isConeTargetBlocked,
  isTargetInsideCone,
  resolveConeTickDamage,
} from './WeaponCombatRules';

/** 枪口位姿。与 `Player.getMuzzle()` 的返回结构一致。 */
export interface MuzzleTransform {
  x: number;
  y: number;
  /** 瞄准方向(弧度)。 */
  angle: number;
}

export interface FlameConeSystemOptions {
  scene: Phaser.Scene;
  getZombies: () => Zombie[];
  /** 掩体碰撞砖，用于遮挡判定。只在结算跳的那一帧调用。 */
  getObstacleTiles: () => readonly AabbTile[];
  damageZombie: (zombie: Zombie, amount: number) => void;
  spawnLinger: (x: number, y: number, def: LingerDef) => void;
}

/** 火焰的三层：外焰最宽最淡，内焰最窄最亮。数值调出来的是「近处白热、远处散开」。 */
const FLAME_LAYERS = [
  { angleScale: 1, rangeScale: 1, color: 0xff4a1e, alpha: 0.3 },
  { angleScale: 0.78, rangeScale: 0.88, color: 0xff8c2b, alpha: 0.38 },
  { angleScale: 0.5, rangeScale: 0.66, color: 0xffe07a, alpha: 0.5 },
] as const;

/** 扇形边缘的锯齿段数。太少像纸片，太多每帧重画的顶点数不划算。 */
const EDGE_SEGMENTS = 11;

/** 边缘抖动幅度占射程的比例，让火舌逐帧翻滚而不是一块死板的扇形。 */
const EDGE_JITTER = 0.12;

/** 残留地火的刷新间隔(毫秒)。比伤害跳慢得多，否则地上会糊成一片。 */
const LINGER_INTERVAL = 260;

/**
 * 枪口前方的扇形火焰。喷火器不再发射弹丸，改由这套系统负责：
 * 每帧重画一片抖动的扇形，并按 `damagePerSecond` 给扇形内的目标连续掉血。
 *
 * 为什么伤害不复用 `AreaEffectFactory` 的燃烧区：燃烧区是圆形、跟枪口方向无关，
 * 而玩家看到的是一片跟着准心转的扇形，两者对不上就会出现「火没烧到却掉血」。
 * 残留地火仍然交给燃烧区，那部分本来就是圆形的地面痕迹。
 */
export class FlameConeSystem {
  private readonly scene: Phaser.Scene;
  private readonly getZombies: () => Zombie[];
  private readonly getObstacleTiles: () => readonly AabbTile[];
  private readonly damageZombie: (zombie: Zombie, amount: number) => void;
  private readonly spawnLinger: (x: number, y: number, def: LingerDef) => void;

  private graphics: Phaser.GameObjects.Graphics | null = null;
  private active = false;
  /** 上一次结算伤害的绝对时刻。用绝对时间，所以要跟着 `shiftTimers` 平移。 */
  private lastTickAt = 0;
  private lastLingerAt = 0;

  constructor(options: FlameConeSystemOptions) {
    this.scene = options.scene;
    this.getZombies = options.getZombies;
    this.getObstacleTiles = options.getObstacleTiles;
    this.damageZombie = options.damageZombie;
    this.spawnLinger = options.spawnLinger;
  }

  /**
   * 每帧调用一次。`cone` 为 `null`（松扳机/换弹/空弹匣/换成别的枪）时立即收火。
   * 必须在 `Player.update` 之后调用，否则火焰会挂在上一帧的枪口位置上。
   */
  update(now: number, cone: ActiveConeAttack | null, muzzle: MuzzleTransform): void {
    if (!cone) {
      this.stop();
      return;
    }
    if (!this.active) {
      // 刚开火：把计时基准对到当前帧，避免松手一段时间后重新按下时补一大跳伤害。
      this.active = true;
      this.lastTickAt = now;
      this.lastLingerAt = now - LINGER_INTERVAL;
    }

    this.draw(cone, muzzle);

    const elapsed = now - this.lastTickAt;
    if (elapsed >= cone.tickRate) {
      this.lastTickAt = now;
      this.applyDamage(cone, muzzle, elapsed);
    }
    if (cone.linger && now - this.lastLingerAt >= LINGER_INTERVAL) {
      this.lastLingerAt = now;
      this.spawnGroundFire(cone, muzzle);
    }
  }

  /** 收火：隐藏火焰。下一次开火会重新对齐计时基准。 */
  stop(): void {
    this.active = false;
    this.graphics?.clear().setVisible(false);
  }

  /** 战场解除冻结时平移绝对时间戳，否则会立刻补一跳伤害。 */
  shiftTimers(offset: number): void {
    this.lastTickAt += offset;
    this.lastLingerAt += offset;
  }

  destroy(): void {
    this.graphics?.destroy();
    this.graphics = null;
    this.active = false;
  }

  private applyDamage(cone: ActiveConeAttack, muzzle: MuzzleTransform, elapsedMs: number): void {
    const damage = resolveConeTickDamage(cone.damagePerSecond, elapsedMs, cone.tickRate);
    if (damage <= 0) return;
    const zombies = this.getZombies();
    if (zombies.length === 0) return;
    const tiles = this.getObstacleTiles();

    for (const zombie of zombies) {
      if (!zombie.active) continue;
      const radius = zombie.def?.radius ?? 0;
      if (!isTargetInsideCone(
        muzzle.x,
        muzzle.y,
        muzzle.angle,
        cone.range,
        cone.angle,
        zombie.x,
        zombie.y,
        radius,
      )) continue;
      // 弹丸时代躲在掩体后就淋不到火，扇形不做遮挡判定的话掩体会直接失效。
      if (isConeTargetBlocked(muzzle.x, muzzle.y, zombie.x, zombie.y, tiles)) continue;
      this.damageZombie(zombie, damage);
      // 减速与伤害共用同一次命中判定：分开判会让"被烧到但没被冻到"这种
      // 玩家无法理解的状态出现在同一片扇形里。
      if (cone.slow) zombie.applySlow(cone.slow.speedMultiplier, cone.slow.duration);
    }
  }

  /** 在扇形内侧随机落一处残留地火，模拟被点燃的地面。 */
  private spawnGroundFire(cone: ActiveConeAttack, muzzle: MuzzleTransform): void {
    const linger = cone.linger;
    if (!linger) return;
    const half = degToRad(cone.angle) / 2;
    const angle = muzzle.angle + randRange(-half, half);
    const distance = cone.range * randRange(0.45, 0.95);
    this.spawnLinger(
      muzzle.x + Math.cos(angle) * distance,
      muzzle.y + Math.sin(angle) * distance,
      linger,
    );
  }

  private draw(cone: ActiveConeAttack, muzzle: MuzzleTransform): void {
    const g = this.ensureGraphics();
    g.setVisible(true);
    g.clear();
    for (const layer of FLAME_LAYERS) {
      g.fillStyle(layer.color, layer.alpha);
      g.beginPath();
      g.moveTo(muzzle.x, muzzle.y);
      const half = degToRad(cone.angle * layer.angleScale) / 2;
      const reach = cone.range * layer.rangeScale;
      for (let i = 0; i <= EDGE_SEGMENTS; i++) {
        const t = i / EDGE_SEGMENTS;
        const angle = muzzle.angle - half + half * 2 * t;
        // 中轴喷得最远、两侧收窄，再叠一层逐帧抖动，火舌才会翻滚。
        const taper = 0.72 + 0.28 * Math.cos((t - 0.5) * Math.PI);
        const jitter = 1 + randRange(-EDGE_JITTER, EDGE_JITTER);
        const r = reach * clamp(taper * jitter, 0.2, 1.15);
        g.lineTo(muzzle.x + Math.cos(angle) * r, muzzle.y + Math.sin(angle) * r);
      }
      g.closePath();
      g.fillPath();
    }
    // 枪口白热核心：给持续喷火一个稳定的亮点，否则整片火看起来在原地闪烁。
    g.fillStyle(0xfff3c4, 0.6);
    g.fillCircle(muzzle.x, muzzle.y, 7 + randRange(0, 3));
  }

  private ensureGraphics(): Phaser.GameObjects.Graphics {
    if (!this.graphics) {
      this.graphics = this.scene.add.graphics();
      // 压在僵尸之下：火焰盖住敌人会看不清自己在烧谁，也挡掉血条。
      this.graphics.setDepth(DEPTH.lingerZone + 1);
      this.graphics.setBlendMode(Phaser.BlendModes.ADD);
    }
    return this.graphics;
  }
}

/** 仅供测试用：让用例不必依赖具体数值也能断言残留地火节奏。 */
export const FLAME_CONE_LINGER_INTERVAL = LINGER_INTERVAL;
