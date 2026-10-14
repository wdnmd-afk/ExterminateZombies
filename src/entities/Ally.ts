import Phaser from 'phaser';
import { CORRIDOR_ALLY, CORRIDOR_MAX_ALLIES } from '../config/corridor';
import type { Zombie } from './Zombie';
import type { ObjectPool } from '../utils/ObjectPool';
import type { Bullet } from './Bullet';

const ALLY_VISUAL_RADIUS = 11;

/**
 * 通道模式队友:站在玩家柱位的自动火炮手。
 *
 * 刻意不做物理体:它不与任何东西碰撞,僵尸也永远不进队友通道,
 * 唯一的交互是每帧往主通道开火。子弹借用玩家的 `bulletPool`,
 * 命中结算、击杀归因、连杀与得分全部复用既有 bullet↔zombie overlap。
 */
export class Ally extends Phaser.GameObjects.Container {
  private core: Phaser.GameObjects.Arc;
  private ring: Phaser.GameObjects.Arc;
  private muzzleFlash: Phaser.GameObjects.Arc;
  private barrel: Phaser.GameObjects.Rectangle;
  private nextFireAt = 0;

  constructor(scene: Phaser.Scene, accentColor: number) {
    super(scene, 0, 0);

    this.core = scene.add.circle(0, 0, ALLY_VISUAL_RADIUS, accentColor, 0.85);
    this.ring = scene.add.circle(0, 0, ALLY_VISUAL_RADIUS + 5).setStrokeStyle(2, accentColor, 0.55);
    this.barrel = scene.add.rectangle(ALLY_VISUAL_RADIUS + 6, 0, 16, 3, accentColor, 0.9);
    this.muzzleFlash = scene.add.circle(ALLY_VISUAL_RADIUS + 16, 0, 5, 0xfff3c2, 0.9).setVisible(false);

    this.add([this.ring, this.core, this.barrel, this.muzzleFlash]);
    scene.add.existing(this);

    this.setActive(false);
    this.setVisible(false);
  }

  spawn(x: number, y: number): void {
    this.barrel.rotation = 0;
    this.nextFireAt = 0;
    this.setPosition(x, y);
    this.setActive(true);
    this.setVisible(true);
  }

  despawn(): void {
    this.setActive(false);
    this.setVisible(false);
  }

  /**
   * 索敌与开火。
   * `fire(angle, x, y)` 由持有方提供(封装 bulletPool 取用与 fire 参数),
   * 本类只负责选目标与旋转炮管,保证同一套射击口径不分叉。
   */
  update(
    now: number,
    elapsedMs: number,
    zombies: readonly Zombie[],
    fire: (angle: number, x: number, y: number) => void,
  ): void {
    if (!this.active) return;
    void now;
    let target: Zombie | null = null;
    let bestDistanceSq = CORRIDOR_ALLY.range * CORRIDOR_ALLY.range;
    for (const zombie of zombies) {
      if (!zombie.active) continue;
      const dx = zombie.x - this.x;
      const dy = zombie.y - this.y;
      const distanceSq = dx * dx + dy * dy;
      if (distanceSq > bestDistanceSq) continue;
      bestDistanceSq = distanceSq;
      target = zombie;
    }
    if (!target) return;
    const angle = Math.atan2(target.y - this.y, target.x - this.x);
    this.barrel.rotation = angle;
    if (elapsedMs < this.nextFireAt) return;
    this.nextFireAt = elapsedMs + CORRIDOR_ALLY.fireIntervalMs;
    const muzzleX = this.x + Math.cos(angle) * (ALLY_VISUAL_RADIUS + 16);
    const muzzleY = this.y + Math.sin(angle) * (ALLY_VISUAL_RADIUS + 16);
    this.muzzleFlash.setPosition(muzzleX - this.x, muzzleY - this.y).setVisible(true);
    this.scene.time.delayedCall(60, () => this.muzzleFlash.setVisible(false));
    fire(angle, muzzleX, muzzleY);
  }
}

export interface AllySquadHooks {
  scene: Phaser.Scene;
  bulletPool: ObjectPool<Bullet>;
  getZombies: () => readonly Zombie[];
  /** 战场是否仍在推进(未终局且未冻结);false 时全队停手。 */
  isAdvancing: () => boolean;
  /** 当前已推进的 run 时钟(elapsedMs 域),冷却挂在它上面暂停即冻结。 */
  getElapsedMs: () => number;
}

/** 队友管理:上限内依次落位;全部成员共用同一条 fire 管线。 */
export class AllySquad {
  private readonly members: Ally[] = [];

  constructor(private readonly hooks: AllySquadHooks) {}

  /** 满编返回 false(调用方转成补给补偿)。 */
  trySpawnAlly(): boolean {
    if (this.members.length >= CORRIDOR_MAX_ALLIES) return false;
    const index = this.members.length;
    const ally = new Ally(this.hooks.scene, CORRIDOR_ALLY.color);
    ally.spawn(108 + index * 30, 600);
    ally.setDepth(15);
    this.members.push(ally);
    return true;
  }

  get count(): number {
    return this.members.length;
  }

  update(): void {
    if (!this.hooks.isAdvancing()) return;
    const zombies = this.hooks.getZombies();
    const elapsedMs = this.hooks.getElapsedMs();
    const fire = (angle: number, x: number, y: number) => this.fireBullet(angle, x, y);
    for (const ally of this.members) {
      ally.update(this.hooks.scene.time.now, elapsedMs, zombies, fire);
    }
  }

  destroy(): void {
    for (const ally of this.members) ally.despawn();
    this.members.length = 0;
  }

  private fireBullet(angle: number, x: number, y: number): void {
    const bullet = this.hooks.bulletPool.tryAcquire();
    if (!bullet) return;
    bullet.fire({
      x,
      y,
      angle,
      speed: CORRIDOR_ALLY.bulletSpeed,
      damage: CORRIDOR_ALLY.damage,
      penetration: 0,
      range: CORRIDOR_ALLY.range,
      color: CORRIDOR_ALLY.color,
      radius: CORRIDOR_ALLY.bulletRadius,
      headshotChance: 0,
      headshotMultiplier: 1,
    });
  }
}
