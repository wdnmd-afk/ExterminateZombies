import Phaser from 'phaser';
import { DEPTH, GAME_WIDTH, GAME_HEIGHT } from '../constants';
import type { EffectDef } from '../config/types';
import { ProjectileImpact } from '../systems/ProjectileImpact';

/**
 * 子弹。走对象池复用:despawn 后 setActive(false)+setVisible(false),
 * 由池的 acquire() 取回后调用 fire() 重置状态。
 *
 * 占位外观:一个小圆点(用 Graphics 生成的纹理或直接用 Arc)。这里用 Arcade Image
 * 需要纹理,为免预加载资源,改用一个带物理体的矩形贴图由场景在 Preload 生成;
 * 但为最小依赖,这里直接继承 Arc(Graphics 图元)并手动挂一个 Arcade Body。
 */
export class Bullet extends Phaser.GameObjects.Arc {
  declare body: Phaser.Physics.Arcade.Body;

  /** 单发伤害。 */
  damage = 0;
  /** 剩余可贯穿敌人数(0=命中即消失)。 */
  penetration = 0;
  /** 起点,用于计算飞行距离上限。 */
  private startX = 0;
  private startY = 0;
  /** 最大飞行距离。 */
  private maxRange = 0;
  private readonly impact = new ProjectileImpact();
  /** 已命中的僵尸集合,避免同一颗子弹对同一僵尸重复扣血。 */
  readonly hitSet = new Set<Phaser.GameObjects.GameObject>();

  constructor(scene: Phaser.Scene) {
    super(scene, 0, 0, 4, 0, 360, false, 0xffffff, 1);
    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.setDepth(DEPTH.bullet);
    this.setActive(false);
    this.setVisible(false);
    this.body.enable = false;
  }

  /** 发射:设置位置、朝向速度、伤害等,并激活。 */
  fire(
    x: number,
    y: number,
    angleRad: number,
    speed: number,
    damage: number,
    penetration: number,
    range: number,
    color: number,
    radius: number,
    impactEffect?: EffectDef,
  ): void {
    this.setPosition(x, y);
    this.startX = x;
    this.startY = y;
    this.maxRange = range;
    this.damage = damage;
    this.penetration = penetration;
    this.fillColor = color;
    this.impact.reset(impactEffect);
    this.hitSet.clear();
    this.setRadius(radius);

    this.setActive(true);
    this.setVisible(true);
    this.body.enable = true;
    this.body.reset(x, y);
    this.body.setCircle(radius, -radius, -radius);
    this.scene.physics.velocityFromRotation(angleRad, speed, this.body.velocity);
  }

  /** 消费命中效果；第一次返回配置，后续调用返回 null，防止同一弹体重复爆炸。 */
  consumeImpactEffect(): EffectDef | null {
    return this.impact.consume();
  }

  /** 回收到池。 */
  despawn(): void {
    this.setActive(false);
    this.setVisible(false);
    this.body.enable = false;
    this.body.stop();
  }

  /** 每帧由场景调用；返回 true 表示应由场景结算到期命中效果并回收。 */
  tick(): boolean {
    if (!this.active) return false;
    const dx = this.x - this.startX;
    const dy = this.y - this.startY;
    if (dx * dx + dy * dy >= this.maxRange * this.maxRange) {
      return true;
    }
    if (this.x < -20 || this.x > GAME_WIDTH + 20 || this.y < -20 || this.y > GAME_HEIGHT + 20) {
      return true;
    }
    return false;
  }
}
