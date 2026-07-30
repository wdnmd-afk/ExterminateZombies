import Phaser from 'phaser';
import { ITEMS, type ItemId } from '../config/items';
import type { ItemDef } from '../config/types';
import { DEPTH } from '../constants';
import { distanceSq } from '../utils/math';

/**
 * 场景物/可部署道具统一实体。
 * 目前覆盖油桶、面粉桶、地雷三类对象,都走同一套伤害与引爆接口。
 */
export class Prop extends Phaser.GameObjects.Container {
  declare body: Phaser.Physics.Arcade.Body;

  itemId!: ItemId;
  def!: ItemDef;
  health = 0;
  triggered = false;
  /** 无尽模式回收最早的未使用战术物件时使用。 */
  spawnedAt = 0;
  private lifecycleToken = 0;

  private shadow: Phaser.GameObjects.Ellipse;
  private art: Phaser.GameObjects.Graphics;
  private marker: Phaser.GameObjects.Rectangle;

  constructor(scene: Phaser.Scene) {
    super(scene, 0, 0);

    this.shadow = scene.add.ellipse(3, 12, 30, 12, 0x000000, 0.28);
    this.art = scene.add.graphics();
    this.marker = scene.add.rectangle(0, -8, 8, 5, 0xffcc33);

    this.add([this.shadow, this.art, this.marker]);
    scene.add.existing(this);
    scene.physics.add.existing(this);

    this.setDepth(DEPTH.prop);
    this.setActive(false);
    this.setVisible(false);
    this.body.enable = false;
  }

  spawn(x: number, y: number, itemId: ItemId): void {
    this.lifecycleToken += 1;
    this.scene.tweens.killTweensOf(this.list);
    const def = ITEMS[itemId] as ItemDef;
    const radius = def.radius ?? 16;

    this.itemId = itemId;
    this.def = def;
    this.health = def.health ?? 1;
    this.triggered = false;
    this.spawnedAt = this.scene.time.now;

    this.setPosition(x, y);
    this.drawVisual(itemId, radius, def.color);

    if (itemId === 'mine') {
      this.marker.setVisible(true);
      this.marker.fillColor = 0xff4444;
    } else if (itemId === 'barrel_flour') {
      this.marker.setVisible(true);
      this.marker.fillColor = 0x444444;
    } else {
      this.marker.setVisible(false);
    }

    this.setActive(true);
    this.setVisible(true);
    this.body.enable = true;
    this.body.reset(x, y);
    this.body.setCircle(radius, -radius, -radius);
    this.body.setImmovable(true);
    this.body.moves = false;
  }

  private drawVisual(itemId: ItemId, radius: number, color: number): void {
    this.art.clear();
    if (itemId === 'mine') {
      this.shadow.setDisplaySize(radius * 2.6, radius * 0.9).setY(radius * 0.55);
      this.art.fillStyle(0x24272a, 1);
      this.art.fillCircle(0, 0, radius);
      this.art.lineStyle(2, 0xb9bec2, 0.8);
      this.art.strokeCircle(0, 0, radius);
      this.art.lineStyle(3, 0x5d6368, 0.9);
      this.art.lineBetween(-radius * 0.7, 0, radius * 0.7, 0);
      this.art.lineBetween(0, -radius * 0.7, 0, radius * 0.7);
      return;
    }

    this.shadow.setDisplaySize(radius * 2.1, radius * 0.72).setY(radius * 0.85);
    const barrelWidth = radius * 1.45;
    const barrelHeight = radius * 2;
    this.art.fillStyle(0x000000, 0.2);
    this.art.fillRect(-barrelWidth / 2 + 3, -barrelHeight / 2 + 4, barrelWidth, barrelHeight);
    this.art.fillStyle(color, 1);
    this.art.fillRect(-barrelWidth / 2, -barrelHeight / 2, barrelWidth, barrelHeight);
    this.art.fillStyle(itemId === 'barrel_flour' ? 0x6e6558 : 0xf1bc45, 0.9);
    this.art.fillRect(-barrelWidth / 2, -3, barrelWidth, 6);
    this.art.fillStyle(0xffffff, 0.16);
    this.art.fillRect(-barrelWidth / 2 + 3, -barrelHeight / 2 + 3, 4, barrelHeight - 6);
    this.art.lineStyle(2, 0x111216, 0.9);
    this.art.strokeRect(-barrelWidth / 2, -barrelHeight / 2, barrelWidth, barrelHeight);
    this.art.lineBetween(-barrelWidth / 2, -barrelHeight * 0.32, barrelWidth / 2, -barrelHeight * 0.32);
    this.art.lineBetween(-barrelWidth / 2, barrelHeight * 0.32, barrelWidth / 2, barrelHeight * 0.32);
  }

  /** 被子弹或爆炸命中。返回 true 表示应立即触发自身效果。 */
  applyDamage(amount: number): boolean {
    if (!this.active) return false;
    this.health -= amount;
    this.scene.tweens.killTweensOf(this.list);
    this.scene.tweens.add({
      targets: this.list,
      alpha: 0.35,
      duration: 40,
      yoyo: true,
    });
    return this.health <= 0;
  }

  /** 标记已触发,防止重复爆炸。 */
  markTriggered(): boolean {
    if (!this.active || this.triggered) return false;
    this.triggered = true;
    return true;
  }

  /** 地雷的近距离触发检测。 */
  isWithinProximity(targetX: number, targetY: number): boolean {
    const proximity = this.def.proximity;
    if (!proximity) return false;
    return distanceSq(this.x, this.y, targetX, targetY) <= proximity * proximity;
  }

  despawn(): void {
    this.lifecycleToken += 1;
    this.scene.tweens.killTweensOf(this.list);
    this.triggered = false;
    this.setActive(false);
    this.setVisible(false);
    this.body.enable = false;
    this.body.stop();
  }
}
