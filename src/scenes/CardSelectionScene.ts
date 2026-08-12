import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH, SCENES } from '../constants';
import type { EnhancementDef } from '../config/types';
import type { WeaponId } from '../config/weapons';
import { configureHighResolutionScene } from '../systems/DisplayManager';
import { SoundManager } from '../systems/SoundManager';
import {
  EnhancementManager,
  type EnhancementStatDelta,
} from '../systems/EnhancementManager';
import { GAME_WEAPON_TEXTURE_KEYS } from '../systems/WeaponAssetManager';
import { getEnhancementWeaponLabel } from '../config/enhancements';
import { PIXEL_FONT_FAMILY } from '../ui/fonts';

export const CARD_SELECTED_EVENT = 'card-selected';

/** 卡片尺寸按四张并排反推：4×246 + 3×26 = 1062，两侧各留 109 边距。 */
const CARD_WIDTH = 246;
const CARD_HEIGHT = 460;
const CARD_SPACING = 26;
/** 海克斯卡片的切角长度，八边形轮廓靠它成形。 */
const CARD_CUT = 22;
const CARD_CENTER_Y = 420;
/** 顶部铭牌区高度：容纳武器贴图与武器名。 */
const BANNER_HEIGHT = 150;
/** 数值对比行最多显示几条，超出的截断以免压到底部提示。 */
const MAX_STAT_ROWS = 5;
const STAT_ROW_STEP = 22;

/** 海克斯色板：深靛底、金色描边、青色能量点缀。 */
const PALETTE = {
  panel: 0x0a1428,
  panelHover: 0x122a44,
  banner: 0x06364a,
  bannerHover: 0x0a5a72,
  plate: 0x03222f,
  gold: 0xc8aa6e,
  goldBright: 0xf0e6d2,
  teal: 0x0acbe6,
} as const;

const TREND_COLORS = { up: '#7ce08a', down: '#e8776a' } as const;

const SELECT_KEYS = ['ONE', 'TWO', 'THREE', 'FOUR'] as const;

interface CardRefs {
  container: Phaser.GameObjects.Container;
  frame: Phaser.GameObjects.Graphics;
  weaponTag: Phaser.GameObjects.Text;
  title: Phaser.GameObjects.Text;
  hint: Phaser.GameObjects.Text;
  baseY: number;
  /** 实际画出的对比行数，决定是否需要画数值区分隔线。 */
  statRows: number;
}

interface CardSelectionData {
  cards?: EnhancementDef[];
  /** 玩家已激活的强化ID。卡面涨幅以此为基准，而不是武器基础值。 */
  activeEnhancements?: string[];
}

/**
 * 增强抽卡界面。四张海克斯风格卡片并排，支持鼠标点选和 1~4 数字键。
 * 结果通过 GameScene 的 card-selected 事件回传；无可用卡时回传 null。
 *
 * 卡面同时给出武器贴图、该武器已叠加的强化层数，以及「当前值 → 强化后」
 * 的逐项对比——强化可以在同一把武器上无限叠加，只靠文字描述玩家算不清收益。
 */
export class CardSelectionScene extends Phaser.Scene {
  private cards: EnhancementDef[] = [];
  private activeEnhancements: ReadonlySet<string> = new Set();
  private readonly refs: CardRefs[] = [];
  /** 防止连点或"点击 + 按键"同时结算两次。 */
  private resolved = false;

  constructor() {
    super(SCENES.cardSelection);
  }

  init(data: CardSelectionData): void {
    this.cards = data.cards ?? [];
    this.activeEnhancements = new Set(data.activeEnhancements ?? []);
    this.refs.length = 0;
    this.resolved = false;
  }

  create(): void {
    configureHighResolutionScene(this);

    this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x01030a, 0.82).setOrigin(0, 0);
    this.drawBackdropRays();

    this.add.text(GAME_WIDTH / 2, 56, 'HEXTECH AUGMENT', {
      fontFamily: PIXEL_FONT_FAMILY,
      fontSize: '20px',
      color: '#0acbe6',
    }).setOrigin(0.5).setAlpha(0.9);

    this.add.text(GAME_WIDTH / 2, 94, '武器增强', {
      fontFamily: PIXEL_FONT_FAMILY,
      fontSize: '44px',
      color: '#f0e6d2',
      stroke: '#0a1428',
      strokeThickness: 6,
    }).setOrigin(0.5);

    this.drawTitleFlourish(GAME_WIDTH / 2, 126);

    if (this.cards.length === 0) {
      this.createEmptyState();
      return;
    }

    this.add.text(GAME_WIDTH / 2, 152, '选择一项永久强化 · 同一武器可持续叠加', {
      fontFamily: PIXEL_FONT_FAMILY,
      fontSize: '17px',
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
      fontFamily: PIXEL_FONT_FAMILY,
      fontSize: '26px',
      color: '#c8aa6e',
    }).setOrigin(0.5);
    this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 44, '点击任意位置继续', {
      fontFamily: PIXEL_FONT_FAMILY,
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
    const halfHeight = CARD_HEIGHT / 2;
    const container = this.add.container(centerX, centerY);
    const frame = this.add.graphics();
    const children: Phaser.GameObjects.GameObject[] = [frame];

    // 已经叠了几层，决定玩家愿不愿意继续往同一把枪上投资。
    const stackCount = EnhancementManager.countActiveForWeapon(
      cardData.weaponId,
      this.activeEnhancements,
    );
    if (stackCount > 0) {
      children.push(this.add.text(0, -halfHeight + 18, `已强化 ×${stackCount}`, {
        fontFamily: PIXEL_FONT_FAMILY,
        fontSize: '12px',
        color: '#c8aa6e',
      }).setOrigin(0.5));
    }

    const artTextureKey = weaponTextureKey(cardData.weaponId);
    if (artTextureKey) {
      const art = this.add.image(0, -halfHeight + 66, artTextureKey);
      // 八把枪贴图长宽差别很大，等比缩放塞进统一画框，避免长枪被压扁。
      art.setScale(Math.min(104 / art.width, 54 / art.height));
      children.push(art);
    }

    const weaponTag = this.add.text(
      0,
      -halfHeight + 122,
      getEnhancementWeaponLabel(cardData.weaponId),
      {
        fontFamily: PIXEL_FONT_FAMILY,
        fontSize: '17px',
        color: '#0acbe6',
        align: 'center',
        // 中文没有空格，Phaser 默认的按空格断行会把整段当成一个超长单词直接溢出；
        // useAdvancedWrap 才会在单词本身超宽时逐字换行。
        wordWrap: { width: CARD_WIDTH - 44, useAdvancedWrap: true },
      },
    ).setOrigin(0.5);

    const title = this.add.text(0, -halfHeight + 186, cardData.cardTitle, {
      fontFamily: PIXEL_FONT_FAMILY,
      fontSize: '27px',
      color: '#f0e6d2',
      align: 'center',
      wordWrap: { width: CARD_WIDTH - 40, useAdvancedWrap: true },
    }).setOrigin(0.5);

    const description = this.add.text(0, -halfHeight + 216, cardData.cardDescription, {
      fontFamily: PIXEL_FONT_FAMILY,
      fontSize: '14px',
      color: '#a8bdd1',
      align: 'center',
      lineSpacing: 5,
      wordWrap: { width: CARD_WIDTH - 48, useAdvancedWrap: true },
    }).setOrigin(0.5, 0);

    const hint = this.add.text(0, halfHeight - 26, `[ ${index + 1} ] 选择`, {
      fontFamily: PIXEL_FONT_FAMILY,
      fontSize: '15px',
      color: '#c8aa6e',
    }).setOrigin(0.5).setAlpha(0.75);

    const statRows = this.createStatRows(cardData);
    children.push(weaponTag, title, description, hint, ...statRows.texts);

    container.add(children);
    // Container 必须先 setSize 才能拿到矩形命中区，否则 Phaser 只打印告警且不可点。
    container.setSize(CARD_WIDTH, CARD_HEIGHT);
    container.setInteractive({ useHandCursor: true });

    const refs: CardRefs = {
      container, frame, weaponTag, title, hint, baseY: centerY, statRows: statRows.count,
    };
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

  /**
   * 「当前值 → 强化后」对比行。
   * 基准是玩家现在的实际数值，所以同一张卡在不同叠加层数下会显示不同涨幅。
   */
  private createStatRows(cardData: EnhancementDef): {
    texts: Phaser.GameObjects.Text[];
    count: number;
  } {
    const halfHeight = CARD_HEIGHT / 2;
    const halfWidth = CARD_WIDTH / 2;
    const deltas = EnhancementManager
      .previewEnhancement(cardData, this.activeEnhancements)
      .slice(0, MAX_STAT_ROWS);

    const texts: Phaser.GameObjects.Text[] = [];
    deltas.forEach((delta, row) => {
      const y = -halfHeight + 324 + row * STAT_ROW_STEP;
      texts.push(...this.createStatRow(delta, y, halfWidth));
    });

    return { texts, count: deltas.length };
  }

  private createStatRow(
    delta: EnhancementStatDelta,
    y: number,
    halfWidth: number,
  ): Phaser.GameObjects.Text[] {
    const label = this.add.text(-halfWidth + 22, y, delta.label, {
      fontFamily: PIXEL_FONT_FAMILY,
      fontSize: '13px',
      color: '#8fa6bd',
    }).setOrigin(0, 0.5);

    // 强化后的值右对齐锁在卡片右缘，原值再贴到它左边：
    // 四张卡的数值列因此天然对齐，扫一眼就能横向比价。
    const after = this.add.text(halfWidth - 22, y, delta.after, {
      fontFamily: PIXEL_FONT_FAMILY,
      fontSize: '14px',
      color: TREND_COLORS[delta.trend],
    }).setOrigin(1, 0.5);

    const before = this.add.text(after.x - after.width - 8, y, `${delta.before} →`, {
      fontFamily: PIXEL_FONT_FAMILY,
      fontSize: '13px',
      color: '#6f8399',
    }).setOrigin(1, 0.5);

    return [label, before, after];
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

  /** 重绘卡框与武器画框。hover 态换成亮金描边加青色底光。 */
  private paintCard(refs: CardRefs, hovered: boolean): void {
    const { frame } = refs;
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
    // 武器贴图底衬：把八把轮廓迥异的枪统一到同一块画框里
    const plate = offsetPoints(cutCornerPoints(58, 31, 10), -halfHeight + 66);
    frame.fillStyle(PALETTE.plate, hovered ? 0.9 : 0.75);
    frame.fillPoints(plate, true);
    frame.lineStyle(1, PALETTE.gold, hovered ? 0.6 : 0.35);
    frame.strokePoints(plate, true, true);
    // 铭牌下沿金线
    frame.lineStyle(2, PALETTE.gold, hovered ? 1 : 0.7);
    frame.lineBetween(-halfWidth + 10, bannerBottom, halfWidth - 10, bannerBottom);
    // 数值对比区的分隔线；没有可展示差异时不画，免得留一段空栏
    if (refs.statRows > 0) {
      const dividerY = -halfHeight + 310;
      frame.lineStyle(1, PALETTE.gold, hovered ? 0.45 : 0.24);
      frame.lineBetween(-halfWidth + 22, dividerY, halfWidth - 22, dividerY);
    }
    // 双层描边
    frame.lineStyle(3, hovered ? PALETTE.goldBright : PALETTE.gold, 1);
    frame.strokePoints(outline, true, true);
    frame.lineStyle(1, PALETTE.gold, hovered ? 0.55 : 0.28);
    frame.strokePoints(cutCornerPoints(halfWidth - 7, halfHeight - 7, CARD_CUT - 5), true, true);

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

/** 卡池里的 weaponId 是宽泛的 string，取贴图前先确认它真的在贴图表里。 */
function weaponTextureKey(weaponId: string): string | null {
  if (!Object.prototype.hasOwnProperty.call(GAME_WEAPON_TEXTURE_KEYS, weaponId)) {
    return null;
  }
  return GAME_WEAPON_TEXTURE_KEYS[weaponId as WeaponId];
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

/** 把以原点为中心的轮廓整体下移，用于画武器底衬这类偏心部件。 */
function offsetPoints(points: Phaser.Geom.Point[], offsetY: number): Phaser.Geom.Point[] {
  return points.map((point) => new Phaser.Geom.Point(point.x, point.y + offsetY));
}

function diamondPoints(x: number, y: number, halfWidth: number, halfHeight: number): Phaser.Geom.Point[] {
  return [
    new Phaser.Geom.Point(x, y - halfHeight),
    new Phaser.Geom.Point(x + halfWidth, y),
    new Phaser.Geom.Point(x, y + halfHeight),
    new Phaser.Geom.Point(x - halfWidth, y),
  ];
}
