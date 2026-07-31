import Phaser from 'phaser';
import { ITEMS, type ItemId } from '../config/items';
import type { ItemDef } from '../config/types';
import { DEPTH } from '../constants';
import { PROP_TEXTURE_KEYS } from '../systems/EnvironmentAssetManager';
import { distanceSq } from '../utils/math';

interface PropVisualMetrics {
  widthFactor: number;
  heightFactor: number;
  shadowWidthFactor: number;
  shadowHeightFactor: number;
  shadowYFactor: number;
}

const PROP_VISUAL_METRICS = {
  barrel_oil: {
    widthFactor: 2.75,
    heightFactor: 2.45,
    shadowWidthFactor: 2.25,
    shadowHeightFactor: 0.7,
    shadowYFactor: 0.86,
  },
  barrel_flour: {
    widthFactor: 2.65,
    heightFactor: 2.45,
    shadowWidthFactor: 2.2,
    shadowHeightFactor: 0.7,
    shadowYFactor: 0.86,
  },
  mine: {
    widthFactor: 3.8,
    heightFactor: 3.2,
    shadowWidthFactor: 3.4,
    shadowHeightFactor: 0.82,
    shadowYFactor: 0.45,
  },
} satisfies Record<ItemId, PropVisualMetrics>;

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
  private art: Phaser.GameObjects.Image;

  constructor(scene: Phaser.Scene) {
    super(scene, 0, 0);

    this.shadow = scene.add.ellipse(3, 12, 30, 12, 0x000000, 0.28);
    this.art = scene.add.image(0, 0, PROP_TEXTURE_KEYS.barrel_oil);

    this.add([this.shadow, this.art]);
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
    this.applyVisual(itemId, radius);

    this.setActive(true);
    this.setVisible(true);
    this.body.enable = true;
    this.body.reset(x, y);
    this.body.setCircle(radius, -radius, -radius);
    this.body.setImmovable(true);
    this.body.moves = false;
  }

  private applyVisual(itemId: ItemId, radius: number): void {
    const metrics = PROP_VISUAL_METRICS[itemId];
    this.art.clearTint().setTexture(PROP_TEXTURE_KEYS[itemId]);
    this.shadow
      .setDisplaySize(radius * metrics.shadowWidthFactor, radius * metrics.shadowHeightFactor)
      .setY(radius * metrics.shadowYFactor);
    this.art.setDisplaySize(radius * metrics.widthFactor, radius * metrics.heightFactor);
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
