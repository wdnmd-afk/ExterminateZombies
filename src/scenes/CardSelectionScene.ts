import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH, SCENES } from '../constants';
import type { EnhancementDef } from '../config/types';
import { configureHighResolutionScene } from '../systems/DisplayManager';
import { SoundManager } from '../systems/SoundManager';
import { getEnhancementWeaponLabel } from '../config/enhancements';

export const CARD_SELECTED_EVENT = 'card-selected';

/** 卡片尺寸按四张并排反推：4×246 + 3×26 = 1062，两侧各留 109 边距。 */
const CARD_WIDTH = 246;
const CARD_HEIGHT = 352;
const CARD_SPACING = 26;
/** 海克斯卡片的切角长度，八边形轮廓靠它成形。 */
const CARD_CUT = 22;
const CARD_CENTER_Y = GAME_HEIGHT / 2 + 26;
const BANNER_HEIGHT = 148;

/** 海克斯色板：深靛底、金色描边、青色能量点缀。 */
const PALETTE = {
  panel: 0x0a1428,
  panelHover: 0x122a44,
  banner: 0x06364a,
  bannerHover: 0x0a5a72,
  gold: 0xc8aa6e,
  goldBright: 0xf0e6d2,
  teal: 0x0acbe6,
} as const;

const SELECT_KEYS = ['ONE', 'TWO', 'THREE', 'FOUR'] as const;

interface CardRefs {
  container: Phaser.GameObjects.Container;
  frame: Phaser.GameObjects.Graphics;
  emblem: Phaser.GameObjects.Graphics;
  weaponTag: Phaser.GameObjects.Text;
  title: Phaser.GameObjects.Text;
  hint: Phaser.GameObjects.Text;
  baseY: number;
}

/**
 * 增强抽卡界面。四张海克斯风格卡片并排，支持鼠标点选和 1~4 数字键。
 * 结果通过 GameScene 的 card-selected 事件回传；无可用卡时回传 null。
 */
export class CardSelectionScene extends Phaser.Scene {
  private cards: EnhancementDef[] = [];
  private readonly refs: CardRefs[] = [];
  /** 防止连点或"点击 + 按键"同时结算两次。 */
  private resolved = false;

  constructor() {
    super(SCENES.cardSelection);
  }

  init(data: { cards?: EnhancementDef[] }): void {
    this.cards = data.cards ?? [];
    this.refs.length = 0;
    this.resolved = false;
  }

  create(): void {
    configureHighResolutionScene(this);

    this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x01030a, 0.82).setOrigin(0, 0);
    this.drawBackdropRays();

    this.add.text(GAME_WIDTH / 2, 96, 'HEXTECH AUGMENT', {
      fontFamily: 'Impact, "Arial Black", sans-serif',
      fontSize: '20px',
      color: '#0acbe6',
    }).setOrigin(0.5).setAlpha(0.9);

    this.add.text(GAME_WIDTH / 2, 136, '武器增强', {
      fontFamily: 'Impact, "Arial Black", sans-serif',
      fontSize: '52px',
      color: '#f0e6d2',
      stroke: '#0a1428',
      strokeThickness: 6,
    }).setOrigin(0.5);

    this.drawTitleFlourish(GAME_WIDTH / 2, 172);

    if (this.cards.length === 0) {
      this.createEmptyState();
      return;
    }

    this.add.text(GAME_WIDTH / 2, 202, '选择一项永久强化', {
      fontFamily: '"Microsoft YaHei", sans-serif',
      fontSize: '18px',
      color: '#8fa6bd',
    }).setOrigin(0.5);

    const count = this.cards.length;
    const totalWidth = count * CARD_WIDTH + (count - 1) * CARD_SPACING;
    const firstCenterX = (GAME_WIDTH - totalWidth) / 2 + CARD_WIDTH / 2;

    this.cards.forEach((card, index) => {
      const centerX = firstCenterX + index * (CARD_WIDTH + CARD_SPACING);
      this.refs.push(this.createCard(centerX, CARD_CENTER_Y, card, index));
    });

    this.bindSelectKeys();
  }

  private createEmptyState(): void {
    this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2, '暂无可用增强', {
      fontFamily: '"Microsoft YaHei", sans-serif',
      fontSize: '26px',
      color: '#c8aa6e',
    }).setOrigin(0.5);
    this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 44, '点击任意位置继续', {
      fontFamily: '"Microsoft YaHei", sans-serif',
      fontSize: '17px',
      color: '#7a8fa6',
    }).setOrigin(0.5);

    this.input.once('pointerdown', () => this.resolve(null));
    this.input.keyboard?.once('keydown-ESC', () => this.resolve(null));
    this.input.keyboard?.once('keydown-SPACE', () => this.resolve(null));
  }

  /** 背景放射线，营造海克斯抽卡的聚焦感。 */
  private drawBackdropRays(): void {
    const rays = this.add.graphics().setAlpha(0.16);
    rays.fillStyle(PALETTE.teal, 1);
    const centerX = GAME_WIDTH / 2;
    const centerY = CARD_CENTER_Y;
    for (let index = 0; index < 12; index++) {
      const angle = (Math.PI * 2 * index) / 12 + Math.PI / 24;
      const spread = 0.055;
      rays.beginPath();
      rays.moveTo(centerX, centerY);
      rays.lineTo(centerX + Math.cos(angle - spread) * 900, centerY + Math.sin(angle - spread) * 900);
      rays.lineTo(centerX + Math.cos(angle + spread) * 900, centerY + Math.sin(angle + spread) * 900);
      rays.closePath();
      rays.fillPath();
    }
  }

  private drawTitleFlourish(x: number, y: number): void {
    const flourish = this.add.graphics();
    flourish.lineStyle(2, PALETTE.gold, 0.75);
    flourish.lineBetween(x - 210, y, x - 26, y);
    flourish.lineBetween(x + 26, y, x + 210, y);
    flourish.fillStyle(PALETTE.gold, 0.95);
    flourish.fillPoints(diamondPoints(x, y, 9, 11), true);
  }

  private createCard(
    centerX: number,
    centerY: number,
    cardData: EnhancementDef,
    index: number,
  ): CardRefs {
    const container = this.add.container(centerX, centerY);

    const frame = this.add.graphics();
    const emblem = this.add.graphics();

    const weaponTag = this.add.text(
      0,
      -CARD_HEIGHT / 2 + 118,
      getEnhancementWeaponLabel(cardData.weaponId),
      {
        fontFamily: 'Impact, "Arial Black", sans-serif',
        fontSize: '17px',
        color: '#0acbe6',
        align: 'center',
        wordWrap: { width: CARD_WIDTH - 44 },
      },
    ).setOrigin(0.5);

    const title = this.add.text(0, -18, cardData.cardTitle, {
      fontFamily: 'Impact, "Arial Black", sans-serif',
      fontSize: '30px',
      color: '#f0e6d2',
      align: 'center',
      wordWrap: { width: CARD_WIDTH - 40 },
    }).setOrigin(0.5);

    const description = this.add.text(0, 58, cardData.cardDescription, {
      fontFamily: '"Microsoft YaHei", sans-serif',
      fontSize: '15px',
      color: '#a8bdd1',
      align: 'center',
      lineSpacing: 5,
      wordWrap: { width: CARD_WIDTH - 48 },
    }).setOrigin(0.5, 0);

    const hint = this.add.text(0, CARD_HEIGHT / 2 - 30, `[ ${index + 1} ] 选择`, {
      fontFamily: 'Impact, "Arial Black", sans-serif',
      fontSize: '15px',
      color: '#c8aa6e',
    }).setOrigin(0.5).setAlpha(0.75);

    container.add([frame, emblem, weaponTag, title, description, hint]);
    // Container 必须先 setSize 才能拿到矩形命中区，否则 Phaser 只打印告警且不可点。
    container.setSize(CARD_WIDTH, CARD_HEIGHT);
    container.setInteractive({ useHandCursor: true });

    const refs: CardRefs = { container, frame, emblem, weaponTag, title, hint, baseY: centerY };
    this.paintCard(refs, false);

    container.on('pointerover', () => this.setHovered(refs, true));
    container.on('pointerout', () => this.setHovered(refs, false));
    container.on('pointerdown', () => this.resolve(cardData.id));

    // 逐张入场，让四张卡有牌面依次翻开的节奏。
    container.setAlpha(0).setY(centerY + 34);
    this.tweens.add({
      targets: container,
      alpha: 1,
      y: centerY,
      duration: 240,
      delay: index * 70,
      ease: 'Back.Out',
    });

    return refs;
  }

  private setHovered(refs: CardRefs, hovered: boolean): void {
    if (this.resolved) return;
    if (hovered) SoundManager.play('uiMove');
    this.paintCard(refs, hovered);
    this.tweens.killTweensOf(refs.container);
    this.tweens.add({
      targets: refs.container,
      scale: hovered ? 1.045 : 1,
      y: hovered ? refs.baseY - 12 : refs.baseY,
      duration: 120,
      ease: 'Cubic.Out',
    });
  }

  /** 重绘卡框与徽记。hover 态换成亮金描边加青色能量芯。 */
  private paintCard(refs: CardRefs, hovered: boolean): void {
    const { frame, emblem } = refs;
    const halfWidth = CARD_WIDTH / 2;
    const halfHeight = CARD_HEIGHT / 2;
    const outline = cutCornerPoints(halfWidth, halfHeight, CARD_CUT);
    const bannerBottom = -halfHeight + BANNER_HEIGHT;

    frame.clear();
    // 外发光
    frame.fillStyle(hovered ? PALETTE.teal : 0x000000, hovered ? 0.2 : 0.35);
    frame.fillPoints(cutCornerPoints(halfWidth + 6, halfHeight + 6, CARD_CUT + 4), true);
    // 主面板
    frame.fillStyle(hovered ? PALETTE.panelHover : PALETTE.panel, 0.97);
    frame.fillPoints(outline, true);
    // 顶部铭牌区
    frame.fillStyle(hovered ? PALETTE.bannerHover : PALETTE.banner, 0.9);
    frame.beginPath();
    frame.moveTo(-halfWidth + CARD_CUT, -halfHeight);
    frame.lineTo(halfWidth - CARD_CUT, -halfHeight);
    frame.lineTo(halfWidth, -halfHeight + CARD_CUT);
    frame.lineTo(halfWidth, bannerBottom);
    frame.lineTo(-halfWidth, bannerBottom);
    frame.lineTo(-halfWidth, -halfHeight + CARD_CUT);
    frame.closePath();
    frame.fillPath();
    // 铭牌下沿金线
    frame.lineStyle(2, PALETTE.gold, hovered ? 1 : 0.7);
    frame.lineBetween(-halfWidth + 10, bannerBottom, halfWidth - 10, bannerBottom);
    // 双层描边
    frame.lineStyle(3, hovered ? PALETTE.goldBright : PALETTE.gold, 1);
    frame.strokePoints(outline, true, true);
    frame.lineStyle(1, PALETTE.gold, hovered ? 0.55 : 0.28);
    frame.strokePoints(cutCornerPoints(halfWidth - 7, halfHeight - 7, CARD_CUT - 5), true, true);

    // 六边形徽记
    const emblemY = -halfHeight + 62;
    emblem.clear();
    emblem.fillStyle(hovered ? PALETTE.teal : 0x0a1428, hovered ? 0.35 : 0.7);
    emblem.fillPoints(hexPoints(0, emblemY, 30), true);
    emblem.lineStyle(2.5, hovered ? PALETTE.goldBright : PALETTE.gold, 1);
    emblem.strokePoints(hexPoints(0, emblemY, 30), true, true);
    emblem.fillStyle(hovered ? PALETTE.goldBright : PALETTE.teal, hovered ? 1 : 0.85);
    emblem.fillPoints(diamondPoints(0, emblemY, 8, 13), true);

    refs.weaponTag.setColor(hovered ? '#f0e6d2' : '#0acbe6');
    refs.title.setColor(hovered ? '#ffffff' : '#f0e6d2');
    refs.hint.setAlpha(hovered ? 1 : 0.75);
  }

  private bindSelectKeys(): void {
    const keyboard = this.input.keyboard;
    if (!keyboard) return;
    this.cards.forEach((card, index) => {
      const keyName = SELECT_KEYS[index];
      if (!keyName) return;
      keyboard.on(`keydown-${keyName}`, () => this.resolve(card.id));
    });
  }

  private resolve(enhancementId: string | null): void {
    if (this.resolved) return;
    this.resolved = true;
    SoundManager.play('uiConfirm');
    this.scene.get(SCENES.game).events.emit(CARD_SELECTED_EVENT, enhancementId);
  }
}

/** 八边形切角轮廓，海克斯卡框的基本形。 */
function cutCornerPoints(halfWidth: number, halfHeight: number, cut: number): Phaser.Geom.Point[] {
  return [
    new Phaser.Geom.Point(-halfWidth + cut, -halfHeight),
    new Phaser.Geom.Point(halfWidth - cut, -halfHeight),
    new Phaser.Geom.Point(halfWidth, -halfHeight + cut),
    new Phaser.Geom.Point(halfWidth, halfHeight - cut),
    new Phaser.Geom.Point(halfWidth - cut, halfHeight),
    new Phaser.Geom.Point(-halfWidth + cut, halfHeight),
    new Phaser.Geom.Point(-halfWidth, halfHeight - cut),
    new Phaser.Geom.Point(-halfWidth, -halfHeight + cut),
  ];
}

function hexPoints(x: number, y: number, radius: number): Phaser.Geom.Point[] {
  const points: Phaser.Geom.Point[] = [];
  for (let index = 0; index < 6; index++) {
    const angle = (Math.PI / 3) * index - Math.PI / 2;
    points.push(new Phaser.Geom.Point(x + Math.cos(angle) * radius, y + Math.sin(angle) * radius));
  }
  return points;
}

function diamondPoints(x: number, y: number, halfWidth: number, halfHeight: number): Phaser.Geom.Point[] {
  return [
    new Phaser.Geom.Point(x, y - halfHeight),
    new Phaser.Geom.Point(x + halfWidth, y),
    new Phaser.Geom.Point(x, y + halfHeight),
    new Phaser.Geom.Point(x - halfWidth, y),
  ];
}
