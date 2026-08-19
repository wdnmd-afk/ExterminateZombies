import Phaser from 'phaser';
import type { ItemId } from '../config/items';
import { WEAPONS, type WeaponId } from '../config/weapons';
import { DEPTH } from '../constants';
import type { DropDef } from '../config/types';
import {
  ENVIRONMENT_TEXTURE_KEYS,
  PROP_TEXTURE_KEYS,
} from '../systems/EnvironmentAssetManager';
import { GAME_WEAPON_TEXTURE_KEYS } from '../systems/WeaponAssetManager';
import { UI_FONT_FAMILY } from '../ui/fonts';
import { MEDICINES } from '../config/medicine';

const PICKUP_LIFETIME_MS = 15000;

interface PickupVisual {
  textureKey: string;
  text: string;
  width: number;
  height: number;
  glowColor: number;
  fitWeapon?: boolean;
}

function isWeaponId(value: string | undefined): value is WeaponId {
  return Boolean(
    value
    && Object.prototype.hasOwnProperty.call(GAME_WEAPON_TEXTURE_KEYS, value),
  );
}

function isItemId(value: string | undefined): value is ItemId {
  return Boolean(
    value
    && Object.prototype.hasOwnProperty.call(PROP_TEXTURE_KEYS, value),
  );
}

function assertNever(value: never): never {
  throw new Error(`未处理的掉落类型：${String(value)}`);
}

export class Pickup extends Phaser.GameObjects.Container {
  declare body: Phaser.Physics.Arcade.Body;

  drop!: DropDef;
  private expireAt = 0;
  private bobPhase = 0;
  private glow: Phaser.GameObjects.Ellipse;
  private art: Phaser.GameObjects.Image;
  private label: Phaser.GameObjects.Text;

  constructor(scene: Phaser.Scene) {
    super(scene, 0, 0);

    this.glow = scene.add.ellipse(0, 8, 40, 14, 0xe0b45a, 0.14)
      .setStrokeStyle(1, 0xe0b45a, 0.35);
    this.art = scene.add.image(0, 0, ENVIRONMENT_TEXTURE_KEYS.pickupAmmo);
    this.label = scene.add.text(0, 22, '', {
      fontFamily: UI_FONT_FAMILY,
      fontSize: '10px',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 3,
    }).setOrigin(0.5);

    this.add([this.glow, this.art, this.label]);
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

    const visual = this.resolveVisual(drop);
    this.art.setTexture(visual.textureKey);
    this.applyArtSize(visual);
    this.art.setY(0);
    this.glow
      .setDisplaySize(visual.width + 10, Math.max(12, visual.height * 0.42))
      .setFillStyle(visual.glowColor, 0.14)
      .setStrokeStyle(1, visual.glowColor, 0.35);
    this.label
      .setText(visual.text)
      .setY(Math.max(20, visual.height / 2 + 7));
    this.bobPhase = (x * 0.013 + y * 0.017) % (Math.PI * 2);

    this.setAlpha(1);
    this.setActive(true);
    this.setVisible(true);
    this.body.enable = true;
    this.body.reset(x, y);
    this.body.setCircle(14, -14, -14);
    this.body.setImmovable(true);
    this.body.moves = false;
  }

  /** 把过期时间点后移 `offset` 毫秒，供战场解除冻结时调用（说明见 GameScene.shiftBattleTimers）。 */
  shiftTimers(offset: number): void {
    this.expireAt += offset;
  }

  tick(now: number): void {
    if (!this.active) return;
    const wave = Math.sin(now * 0.005 + this.bobPhase);
    this.art.setY(wave * 1.5);
    this.glow.setAlpha(0.72 + (wave + 1) * 0.08);

    if (now >= this.expireAt) {
      this.despawn();
      return;
    }

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
    this.art.setY(0);
  }

  private applyArtSize(visual: PickupVisual): void {
    this.art.setScale(1);
    if (!visual.fitWeapon) {
      this.art.setDisplaySize(visual.width, visual.height);
      return;
    }

    const scale = Math.min(
      visual.width / this.art.width,
      visual.height / this.art.height,
    );
    this.art.setScale(scale);
  }

  private resolveVisual(drop: DropDef): PickupVisual {
    switch (drop.type) {
      case 'health':
        return {
          textureKey: ENVIRONMENT_TEXTURE_KEYS.pickupHealth,
          text: String(drop.amount ?? ''),
          width: 30,
          height: 30,
          glowColor: 0xd96058,
        };
      case 'ammo':
        return {
          textureKey: ENVIRONMENT_TEXTURE_KEYS.pickupAmmo,
          text: drop.ammoMode === 'fixed' ? String(drop.amount) : '',
          width: 32,
          height: 32,
          glowColor: 0xe0b45a,
        };
      case 'item': {
        if (!isItemId(drop.itemId)) {
          throw new Error(`未配置的道具掉落：${String(drop.itemId)}`);
        }
        return {
          textureKey: PROP_TEXTURE_KEYS[drop.itemId],
          text: drop.amount && drop.amount > 1 ? String(drop.amount) : '',
          width: 38,
          height: 32,
          glowColor: 0xe4a44d,
        };
      }
      case 'medicine': {
        const medicine = MEDICINES[drop.medicineId];
        if (!medicine) throw new Error(`未配置的药品掉落：${String(drop.medicineId)}`);
        return {
          // 本轮不新增药品美术，复用现有医疗补给图并用名称与辉光颜色区分。
          textureKey: ENVIRONMENT_TEXTURE_KEYS.pickupHealth,
          text: drop.amount > 1 ? `${medicine.name} ×${drop.amount}` : medicine.name,
          width: 30,
          height: 30,
          glowColor: medicine.color,
        };
      }
      case 'weapon': {
        if (!isWeaponId(drop.itemId)) {
          throw new Error(`未配置的武器掉落：${String(drop.itemId)}`);
        }
        return {
          textureKey: GAME_WEAPON_TEXTURE_KEYS[drop.itemId],
          text: WEAPONS[drop.itemId].name,
          width: 46,
          height: 26,
          glowColor: 0x78c8e8,
          fitWeapon: true,
        };
      }
      case 'enhancement_pack':
        return {
          textureKey: ENVIRONMENT_TEXTURE_KEYS.pickupEnhancement,
          text: '强化',
          width: 32,
          height: 32,
          glowColor: 0x58c9dd,
        };
      default:
        return assertNever(drop);
    }
  }
}
