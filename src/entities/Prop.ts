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

  private shell: Phaser.GameObjects.Arc;
  private stripe: Phaser.GameObjects.Rectangle;
  private marker: Phaser.GameObjects.Rectangle;

  constructor(scene: Phaser.Scene) {
    super(scene, 0, 0);

    this.shell = scene.add.circle(0, 0, 16, 0xffffff);
    this.shell.setStrokeStyle(2, 0x111111, 0.8);
    this.stripe = scene.add.rectangle(0, 0, 18, 6, 0x111111, 0.18);
    this.marker = scene.add.rectangle(0, -8, 8, 5, 0xffcc33);

    this.add([this.shell, this.stripe, this.marker]);
    scene.add.existing(this);
    scene.physics.add.existing(this);

    this.setDepth(DEPTH.prop);
    this.setActive(false);
    this.setVisible(false);
    this.body.enable = false;
  }

  spawn(x: number, y: number, itemId: ItemId): void {
    const def = ITEMS[itemId] as ItemDef;
    const radius = def.radius ?? 16;

    this.itemId = itemId;
    this.def = def;
    this.health = def.health ?? 1;
    this.triggered = false;

    this.setPosition(x, y);
    this.shell.setRadius(radius);
    this.shell.fillColor = def.color;
    this.stripe.width = radius * 1.2;
    this.stripe.height = Math.max(6, radius * 0.35);

    if (itemId === 'mine') {
      this.marker.setVisible(true);
      this.marker.fillColor = 0xff4444;
      this.stripe.rotation = Math.PI / 4;
    } else if (itemId === 'barrel_flour') {
      this.marker.setVisible(true);
      this.marker.fillColor = 0x444444;
      this.stripe.rotation = 0;
    } else {
      this.marker.setVisible(false);
      this.stripe.rotation = 0;
    }

    this.setActive(true);
    this.setVisible(true);
    this.body.enable = true;
    this.body.reset(x, y);
    this.body.setCircle(radius, -radius, -radius);
    this.body.setImmovable(true);
    this.body.moves = false;
  }

  /** 被子弹或爆炸命中。返回 true 表示应立即触发自身效果。 */
  applyDamage(amount: number): boolean {
    if (!this.active) return false;
    this.health -= amount;
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
    this.triggered = false;
    this.setActive(false);
    this.setVisible(false);
    this.body.enable = false;
    this.body.stop();
  }
}
