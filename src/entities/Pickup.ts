import Phaser from 'phaser';
import { ITEMS } from '../config/items';
import type { WeaponId } from '../config/weapons';
import { DEPTH } from '../constants';
import type { DropDef } from '../config/types';

const PICKUP_LIFETIME_MS = 15000;

/**
 * 战利品掉落实体。当前使用圆形底座 + 简短标签占位展示。
 */
export class Pickup extends Phaser.GameObjects.Container {
  declare body: Phaser.Physics.Arcade.Body;

  drop!: DropDef;
  private expireAt = 0;
  private shell: Phaser.GameObjects.Arc;
  private label: Phaser.GameObjects.Text;

  constructor(scene: Phaser.Scene) {
    super(scene, 0, 0);

    this.shell = scene.add.circle(0, 0, 14, 0xffffff);
    this.shell.setStrokeStyle(2, 0x111111, 0.8);
    this.label = scene.add.text(0, -1, '', {
      fontFamily: 'Impact, "Arial Black", sans-serif',
      fontSize: '14px',
      color: '#111111',
    }).setOrigin(0.5);

    this.add([this.shell, this.label]);
    scene.add.existing(this);
    scene.physics.add.existing(this);

    this.setDepth(DEPTH.pickup);
    this.setActive(false);
    this.setVisible(false);
    this.body.enable = false;
  }

  spawn(x: number, y: number, drop: DropDef): void {
    this.drop = { ...drop };
    this.expireAt = this.scene.time.now + PICKUP_LIFETIME_MS;
    this.setPosition(x, y);

    const { color, text } = this.resolveVisual(drop);
    this.shell.fillColor = color;
    this.label.setText(text);

    this.setAlpha(1);
    this.setScale(1);
    this.setActive(true);
    this.setVisible(true);
    this.body.enable = true;
    this.body.reset(x, y);
    this.body.setCircle(14, -14, -14);
    this.body.setImmovable(true);
    this.body.moves = false;
  }

  tick(now: number): void {
    if (!this.active) return;
    if (now >= this.expireAt) {
      this.despawn();
      return;
    }

    // 临近消失时闪烁提示。
    if (this.expireAt - now < 2500) {
      const pulse = Math.floor((this.expireAt - now) / 120) % 2 === 0;
      this.setAlpha(pulse ? 0.35 : 1);
    }
  }

  despawn(): void {
    this.setActive(false);
    this.setVisible(false);
    this.body.enable = false;
    this.body.stop();
  }

  private resolveVisual(drop: DropDef): { color: number; text: string } {
    if (drop.type === 'ammo') {
      if (drop.ammoType === 'heavy') return { color: 0x8ecdf5, text: 'H' };
      if (drop.ammoType === 'shell') return { color: 0xffb17a, text: 'S' };
      return { color: 0xffef85, text: 'L' };
    }

    if (drop.type === 'health') {
      return { color: 0xff7482, text: '+' };
    }

    if (drop.type === 'item') {
      const itemId = drop.itemId as keyof typeof ITEMS | undefined;
      const item = itemId ? ITEMS[itemId] : undefined;
      return { color: item?.color ?? 0xbcbcbc, text: item?.name.slice(0, 1) ?? 'I' };
    }

    const weaponId = drop.itemId as WeaponId | undefined;
    return {
      color: 0x6b7c88,
      text: weaponId ? weaponId.slice(0, 1).toUpperCase() : 'W',
    };
  }
}
