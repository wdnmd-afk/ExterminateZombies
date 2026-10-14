import Phaser from 'phaser';
import { DEPTH } from '../constants';
import { CORRIDOR_CARDS, CORRIDOR_CARD_CULL_X, type CorridorCardDef, type CorridorCardKind } from '../config/corridor';
import { UI_FONT_FAMILY } from '../ui/fonts';

const CARD_WIDTH = 96;
const CARD_HEIGHT = 112;
const HP_BAR_WIDTH = 72;
const HP_BAR_HEIGHT = 5;

/**
 * 通道模式漂移卡片。
 *
 * 程序绘制(CardSelectionScene 同款 Graphics + Text 思路),零新图片素材。
 * 卡片有 HP:玩家必须把它打爆才能在下一帧拿走内容;漏看则飘出左缘消失。
 * 结构与 `Prop` 同一套「池化容器 + arcade body + applyDamage」约定。
 */
export class CorridorCard extends Phaser.GameObjects.Container {
  declare body: Phaser.Physics.Arcade.Body;

  def!: CorridorCardDef;
  kind!: CorridorCardKind;
  hp = 0;
  maxHp = 0;

  private frame: Phaser.GameObjects.Graphics;
  private titleText: Phaser.GameObjects.Text;
  private subtitleText: Phaser.GameObjects.Text;
  private hpBack: Phaser.GameObjects.Rectangle;
  private hpFill: Phaser.GameObjects.Rectangle;

  constructor(scene: Phaser.Scene) {
    super(scene, 0, 0);

    this.frame = scene.add.graphics();
    this.titleText = scene.add.text(0, -22, '', {
      fontFamily: UI_FONT_FAMILY, fontSize: '14px', color: '#f4eedd', fontStyle: 'bold',
    }).setOrigin(0.5);
    this.subtitleText = scene.add.text(0, 2, '', {
      fontFamily: UI_FONT_FAMILY, fontSize: '10px', color: '#bdb8af',
      align: 'center', wordWrap: { width: CARD_WIDTH - 12, useAdvancedWrap: true },
    }).setOrigin(0.5, 0);
    this.hpBack = scene.add.rectangle(0, -CARD_HEIGHT / 2 - 9, HP_BAR_WIDTH, HP_BAR_HEIGHT, 0x111116, 0.9);
    this.hpFill = scene.add.rectangle(0, -CARD_HEIGHT / 2 - 9, HP_BAR_WIDTH, HP_BAR_HEIGHT, 0xfbc02d);
    this.hpFill.setOrigin(0, 0.5).setPosition(-HP_BAR_WIDTH / 2, -CARD_HEIGHT / 2 - 9);

    this.add([
      this.hpBack,
      this.hpFill,
      this.frame,
      this.titleText,
      this.subtitleText,
    ]);
    scene.add.existing(this);
    scene.physics.add.existing(this);

    this.setDepth(DEPTH.pickup);
    this.setActive(false);
    this.setVisible(false);
    this.body.enable = false;
  }

  spawn(x: number, y: number, kind: CorridorCardKind): void {
    this.kind = kind;
    const def = CORRIDOR_CARDS[kind] as CorridorCardDef;
    this.def = def;
    this.hp = def.hp;
    this.maxHp = def.hp;

    this.setPosition(x, y);
    this.paint();

    this.setActive(true);
    this.setVisible(true);
    this.body.enable = true;
    this.body.reset(x, y);
    this.body.setSize(CARD_WIDTH, CARD_HEIGHT);
    this.body.setCircle(Math.max(CARD_WIDTH, CARD_HEIGHT) / 2, -CARD_WIDTH / 2, -CARD_HEIGHT / 2);
    this.body.setImmovable(true);
    this.body.setAllowGravity(false);
    this.body.setVelocityX(-def.driftSpeed);
  }

  /** 被子弹命中。返回 true 表示 HP 耗尽,应立即结算内容。 */
  applyDamage(amount: number): boolean {
    if (!this.active) return false;
    this.hp -= amount;
    this.scene.tweens.killTweensOf(this.frame);
    this.scene.tweens.add({ targets: this.frame, alpha: 0.35, duration: 40, yoyo: true });
    this.paintHp();
    return this.hp <= 0;
  }

  /** 漂移推进。返回 true 表示已飘出左缘,该卡作废。 */
  tick(): boolean {
    if (!this.active) return false;
    return this.x < CORRIDOR_CARD_CULL_X;
  }

  despawn(): void {
    this.scene.tweens.killTweensOf(this.frame);
    this.setActive(false);
    this.setVisible(false);
    this.body.enable = false;
    this.body.stop();
  }

  private paint(): void {
    this.paintHp();
    this.frame.clear();
    const accent = this.def.accent;
    this.frame.fillStyle(0x14141a, 0.94);
    this.frame.fillRoundedRect(-CARD_WIDTH / 2, -CARD_HEIGHT / 2, CARD_WIDTH, CARD_HEIGHT, 10);
    this.frame.lineStyle(2, accent, 0.9);
    this.frame.strokeRoundedRect(-CARD_WIDTH / 2, -CARD_HEIGHT / 2, CARD_WIDTH, CARD_HEIGHT, 10);
    this.frame.lineStyle(1, accent, 0.25);
    this.frame.strokeRoundedRect(-CARD_WIDTH / 2 + 4, -CARD_HEIGHT / 2 + 4, CARD_WIDTH - 8, CARD_HEIGHT - 8, 7);
    this.titleText.setText(this.def.title).setColor('#f4eedd');
    this.subtitleText.setText(this.def.subtitle);
  }

  private paintHp(): void {
    const ratio = this.maxHp > 0 ? Phaser.Math.Clamp(this.hp / this.maxHp, 0, 1) : 0;
    this.hpFill.setFillStyle(this.def?.accent ?? 0xfbc02d);
    this.hpFill.setOrigin(0, 0.5);
    this.hpFill.width = Math.max(0, HP_BAR_WIDTH * ratio);
    this.hpFill.setPosition(-HP_BAR_WIDTH / 2, -CARD_HEIGHT / 2 - 9);
  }
}
