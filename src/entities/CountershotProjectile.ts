import Phaser from 'phaser';
import type { CountershotZombieAbility } from '../config/types';
import { TACTICAL_TEXTURE_KEYS } from '../config/tacticalDevices';
import { DEPTH, GAME_HEIGHT, GAME_WIDTH } from '../constants';
import { CountershotFlight, isCountershotSourceCurrent } from '../systems/CountershotRules';
import { UI_FONT_FAMILY } from '../ui/fonts';
import { distanceSq } from '../utils/math';
import type { Zombie } from './Zombie';

export class CountershotProjectile extends Phaser.GameObjects.Container {
  declare body: Phaser.Physics.Arcade.Body;
  readonly flight = new CountershotFlight();
  ability!: CountershotZombieAbility;
  private readonly image: Phaser.GameObjects.Image;
  private readonly core: Phaser.GameObjects.Arc;
  private readonly label: Phaser.GameObjects.Text;
  private source: Zombie | null = null;
  private sourceToken = -1;
  private sourceX = 0;
  private sourceY = 0;
  private startX = 0;
  private startY = 0;
  private maxRange = 0;

  constructor(scene: Phaser.Scene) {
    super(scene, 0, 0);
    this.image = scene.add.image(0, 0, TACTICAL_TEXTURE_KEYS.countershot).setScale(1.35);
    this.core = scene.add.circle(0, 0, 14).setStrokeStyle(2, 0xffe39b, 1);
    this.label = scene.add.text(0, -29, '击返', {
      fontFamily: UI_FONT_FAMILY,
      fontSize: '13px',
      color: '#fff0c3',
      backgroundColor: '#332017',
      padding: { x: 3, y: 1 },
    }).setOrigin(0.5);
    this.add([this.image, this.core, this.label]);
    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.setDepth(DEPTH.effect);
    this.despawn();
  }

  fire(source: Zombie, targetX: number, targetY: number, ability: CountershotZombieAbility): void {
    this.source = source;
    this.sourceToken = source.getLifecycleToken();
    this.sourceX = source.x;
    this.sourceY = source.y;
    this.ability = { ...ability };
    this.flight.launch();
    this.image.clearTint();
    this.label.setText('击返').setColor('#fff0c3').setBackgroundColor('#332017');
    this.core.setRadius(ability.projectileRadius).setStrokeStyle(2, 0xffe39b, 1);
    this.setPosition(source.x, source.y).setActive(true).setVisible(true);
    this.body.enable = true;
    this.body.setCircle(ability.projectileRadius, -ability.projectileRadius, -ability.projectileRadius);
    this.body.reset(source.x, source.y);
    this.aim(targetX, targetY, ability.projectileSpeed, ability.projectileRange);
  }

  reflect(): boolean {
    if (!this.active || !this.flight.reflect()) return false;
    const source = this.getCurrentSource();
    this.aim(source?.x ?? this.sourceX, source?.y ?? this.sourceY, this.ability.returnSpeed, this.ability.returnRange);
    this.image.setTint(0x92edff);
    this.core.setStrokeStyle(3, 0x8fe8ff, 1);
    this.label.setText('反击').setColor('#b4f4ff').setBackgroundColor('#123139');
    return true;
  }

  getCurrentSource(): Zombie | null {
    return this.source && isCountershotSourceCurrent(
      this.source.isCombatActive(), this.source.getLifecycleToken(), this.sourceToken,
    ) ? this.source : null;
  }

  private aim(targetX: number, targetY: number, speed: number, range: number): void {
    // 贴着发射者反打时两点可能重合，反向原航向，不能产生零速的永久弹体。
    const angle = distanceSq(this.x, this.y, targetX, targetY) < 1
      ? this.image.rotation + Math.PI
      : Phaser.Math.Angle.Between(this.x, this.y, targetX, targetY);
    this.image.setRotation(angle);
    this.startX = this.x;
    this.startY = this.y;
    this.maxRange = range;
    this.body.setVelocity(Math.cos(angle) * speed, Math.sin(angle) * speed);
  }

  hasExpired(): boolean {
    return this.active && (distanceSq(this.x, this.y, this.startX, this.startY) >= this.maxRange ** 2
      || this.x < -24 || this.x > GAME_WIDTH + 24 || this.y < -24 || this.y > GAME_HEIGHT + 24);
  }

  despawn(): void {
    this.flight.consume();
    this.source = null;
    this.sourceToken = -1;
    this.setActive(false).setVisible(false);
    this.body.enable = false;
    this.body.stop();
  }
}
