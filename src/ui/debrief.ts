import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from '../constants';
import { UI_FONT_FAMILY } from './fonts';
import { fitTextWidth } from './layout';

/**
 * 结算页共享版式。
 *
 * 为什么要单独一个模块：`GameOverScene` 与 `LevelClearScene` 此前各自把全部统计
 * 塞进**一个居中的多行 Text**，再用 `fitTextBlock` 整体缩放塞进标题与按钮之间。
 * 那种做法有三个实际问题：
 *
 * 1. 行数一多就整体缩字，17 行统计在 720 高里被压到十几 px，还全部居中对齐，
 *    没有任何分组或层级——玩家想找"我打了多少击杀"要逐行扫。
 * 2. 两个场景把 `formatDuration` / `formatWeaponUsage` / `formatAmmoEconomy`
 *    逐字复制了两份，改一处必然漏另一处。
 * 3. 按钮用米白底板 `0xf4eedd` + 深色字，与主菜单、武器库、怪物图鉴确立的
 *    "黑色战术台面 + 旧纸白信息层 + 警戒黄操作焦点"口径不一致
 *    （口径来源：`docs/playDesign/角色与战前整备系统.md` §8.1）。
 *
 * 这里把底板、标题、统计卡片网格和按钮抽成共享构件，两个场景只提供数据。
 * 按钮的配色、描边、hover 与按下位移**刻意逐项对齐 `MainMenuScene.createActionButton`**，
 * 因为那是全项目最成熟的一屏，不应该再有第二套按钮语言。
 *
 * 注意：本文件不使用 `letterSpacing`。它不在 Phaser 3.80.1 的 `TextStyle` 类型里，
 * 仓库既有的 24 个类型错误全部来自它，新代码不再新增同类错误。
 */

/** 左右内容边距，与 `MainMenuScene` 的页脚同轴。 */
const MARGIN_X = 64;
const CONTENT_WIDTH = GAME_WIDTH - MARGIN_X * 2;

const CARD_COLUMNS = 4;
const CARD_GAP = 16;
const CARD_WIDTH = (CONTENT_WIDTH - CARD_GAP * (CARD_COLUMNS - 1)) / CARD_COLUMNS;
const CARD_HEIGHT = 82;
const CARD_TOP = 188;

const FOOTER_TOP = 486;
const FOOTER_ROW_HEIGHT = 26;
const FOOTER_LABEL_WIDTH = 88;

const BUTTON_WIDTH = 300;
const BUTTON_HEIGHT = 56;
const BUTTON_Y = 616;
const BUTTON_GAP = 16;

const SURFACE = 0x0f0e13;
const CARD_FILL = 0x15151b;
const PAPER = '#f4eedd';
const MUTED = '#8e8b92';
const FAINT = '#6f6c73';
const ALERT = '#fbc02d';

export interface DebriefStatCard {
  /** 中文主标签，例如「得分」。 */
  label: string;
  /** 英文副标签，例如 `SCORE`；与图鉴的 `生命 // HEALTH` 同一形态。 */
  tag: string;
  value: string;
  /** 可选第二行细分，例如环境利用的「油桶 4 / 粉尘 1 / 地雷 7」。 */
  detail?: string;
  /** true 时数值用警戒黄，用于本局最值得看的一项。 */
  highlight?: boolean;
}

export interface DebriefFooterRow {
  label: string;
  value: string;
  highlight?: boolean;
}

export interface DebriefButtonSpec {
  label: string;
  shortcut?: string;
  primary: boolean;
  onSelect: () => void;
}

export interface DebriefLayoutSpec {
  /** 强调色。失败用暗红，通关用绿，与标题描边和左侧色条同源。 */
  accent: number;
  eyebrow: string;
  title: string;
  /** 右上角的模式/关卡信息。 */
  meta: string;
  /** 右上角第二行，例如无尽最佳或新解锁关卡；无则省略。 */
  metaSub?: string;
  /** 竖排水印文字，与主菜单的 `OUTBREAK` 同一手法。 */
  watermark: string;
  cards: DebriefStatCard[];
  footerRows: DebriefFooterRow[];
  buttons: DebriefButtonSpec[];
  hint: string;
}

/** 画出结算页的黑色战术台面：底色、细网格、左侧强调色条与竖排水印。 */
function createSurface(scene: Phaser.Scene, spec: DebriefLayoutSpec): void {
  scene.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, SURFACE);

  // 48px 网格与主菜单同参数（1px、旧纸白、0.035 透明度），保证两屏是同一张台面。
  const grid = scene.add.graphics();
  grid.lineStyle(1, 0xf4eedd, 0.035);
  for (let x = 0; x <= GAME_WIDTH; x += 48) grid.lineBetween(x, 0, x, GAME_HEIGHT);
  for (let y = 0; y <= GAME_HEIGHT; y += 48) grid.lineBetween(0, y, GAME_WIDTH, y);

  // 左侧色条：武器库用黄、怪物图鉴用红，结算页用各自的结果色，形成同一族标识。
  scene.add.rectangle(0, GAME_HEIGHT / 2, 8, GAME_HEIGHT, spec.accent).setOrigin(0, 0.5);

  scene.add.text(GAME_WIDTH - 22, GAME_HEIGHT / 2, spec.watermark, {
    fontFamily: UI_FONT_FAMILY,
    fontSize: '18px',
    color: PAPER,
  })
    .setOrigin(0.5)
    .setRotation(Math.PI / 2)
    .setAlpha(0.22);
}

function createHeader(scene: Phaser.Scene, spec: DebriefLayoutSpec): void {
  scene.add.text(MARGIN_X, 44, spec.eyebrow, {
    fontFamily: UI_FONT_FAMILY,
    fontSize: '15px',
    color: ALERT,
  });
  const title = scene.add.text(MARGIN_X - 4, 66, spec.title, {
    fontFamily: UI_FONT_FAMILY,
    fontStyle: 'bold',
    fontSize: '62px',
    color: PAPER,
    stroke: numberToHex(spec.accent),
    strokeThickness: 6,
  });
  // 标题右侧要留出 meta 的空间，长关卡名不能顶到一起。
  fitTextWidth(title, CONTENT_WIDTH - 300);

  const meta = scene.add.text(GAME_WIDTH - MARGIN_X, 52, spec.meta, {
    fontFamily: UI_FONT_FAMILY,
    fontSize: '20px',
    color: PAPER,
    align: 'right',
  }).setOrigin(1, 0);
  fitTextWidth(meta, 280);

  if (spec.metaSub) {
    const metaSub = scene.add.text(GAME_WIDTH - MARGIN_X, 82, spec.metaSub, {
      fontFamily: UI_FONT_FAMILY,
      fontSize: '15px',
      color: ALERT,
      align: 'right',
    }).setOrigin(1, 0);
    fitTextWidth(metaSub, 280);
  }

  scene.add.rectangle(MARGIN_X, 162, CONTENT_WIDTH, 2, 0xf4eedd, 0.16).setOrigin(0, 0.5);
}

function createStatCards(scene: Phaser.Scene, cards: DebriefStatCard[]): void {
  cards.forEach((card, index) => {
    const column = index % CARD_COLUMNS;
    const row = Math.floor(index / CARD_COLUMNS);
    const left = MARGIN_X + column * (CARD_WIDTH + CARD_GAP);
    const top = CARD_TOP + row * (CARD_HEIGHT + CARD_GAP);

    scene.add.rectangle(left, top, CARD_WIDTH, CARD_HEIGHT, CARD_FILL)
      .setOrigin(0, 0)
      .setStrokeStyle(2, 0xf4eedd, 0.1);
    // 强调卡在左缘加一道色条，不靠改底色——底色一变，卡片网格的节奏就散了。
    if (card.highlight) {
      scene.add.rectangle(left, top, 3, CARD_HEIGHT, 0xfbc02d).setOrigin(0, 0);
    }

    const heading = scene.add.text(left + 14, top + 12, `${card.label}  //  ${card.tag}`, {
      fontFamily: UI_FONT_FAMILY,
      fontSize: '12px',
      color: MUTED,
    });
    fitTextWidth(heading, CARD_WIDTH - 28);

    const value = scene.add.text(left + 14, top + 32, card.value, {
      fontFamily: UI_FONT_FAMILY,
      fontStyle: 'bold',
      fontSize: '30px',
      color: card.highlight ? ALERT : PAPER,
    });
    fitTextWidth(value, CARD_WIDTH - 28);

    if (card.detail) {
      const detail = scene.add.text(left + 14, top + 64, card.detail, {
        fontFamily: UI_FONT_FAMILY,
        fontSize: '11px',
        color: FAINT,
      });
      fitTextWidth(detail, CARD_WIDTH - 28);
    }
  });
}

function createFooterRows(scene: Phaser.Scene, rows: DebriefFooterRow[]): void {
  rows.forEach((row, index) => {
    const top = FOOTER_TOP + index * FOOTER_ROW_HEIGHT;
    scene.add.text(MARGIN_X, top, row.label, {
      fontFamily: UI_FONT_FAMILY,
      fontSize: '13px',
      color: MUTED,
    });
    const value = scene.add.text(MARGIN_X + FOOTER_LABEL_WIDTH, top, row.value, {
      fontFamily: UI_FONT_FAMILY,
      fontSize: '14px',
      color: row.highlight ? ALERT : PAPER,
    });
    // 武器占比与补给经济都会随玩法变长，超宽只缩这一行，不影响其它行的行位。
    fitTextWidth(value, CONTENT_WIDTH - FOOTER_LABEL_WIDTH);
  });
}

/**
 * 结算页按钮。配色、描边、hover 上浮 2px 与按下 0.985 缩放逐项对齐
 * `MainMenuScene.createActionButton`，不引入第二套按钮语言。
 */
function createButton(
  scene: Phaser.Scene,
  centerX: number,
  spec: DebriefButtonSpec,
): void {
  const { primary } = spec;
  const box = scene.add.rectangle(
    centerX,
    BUTTON_Y,
    BUTTON_WIDTH,
    BUTTON_HEIGHT,
    primary ? 0xfbc02d : 0x1d1d24,
  );
  const applyIdleStyle = (): void => {
    box.fillColor = primary ? 0xfbc02d : 0x1d1d24;
    box.setStrokeStyle(primary ? 4 : 2, primary ? 0x0f0e13 : 0xf4eedd, primary ? 1 : 0.22);
  };
  applyIdleStyle();

  const label = scene.add.text(centerX, BUTTON_Y, spec.label, {
    fontFamily: UI_FONT_FAMILY,
    fontStyle: primary ? 'normal' : 'bold',
    fontSize: primary ? '25px' : '20px',
    color: primary ? '#0f0e13' : PAPER,
  }).setOrigin(0.5);

  const shortcut = spec.shortcut
    ? scene.add.text(centerX + BUTTON_WIDTH / 2 - 14, BUTTON_Y, spec.shortcut, {
      fontFamily: UI_FONT_FAMILY,
      fontSize: '13px',
      color: primary ? '#0f0e13' : ALERT,
    }).setOrigin(1, 0.5)
    : null;
  if (shortcut) shortcut.setAlpha(primary ? 0.62 : 1);

  const moving: Phaser.GameObjects.GameObject[] = shortcut
    ? [box, label, shortcut]
    : [box, label];
  const scalable = shortcut ? [box, label, shortcut] : [box, label];
  fitTextWidth(label, BUTTON_WIDTH - (shortcut ? 84 : 28));

  box.setInteractive({ useHandCursor: true })
    .on('pointerover', () => {
      box.fillColor = primary ? 0xf4eedd : 0x292931;
      box.setStrokeStyle(primary ? 4 : 2, primary ? 0x0f0e13 : 0xfbc02d, 1);
      scene.tweens.add({ targets: moving, y: BUTTON_Y - 2, duration: 90, ease: 'Cubic.Out' });
    })
    .on('pointerout', () => {
      applyIdleStyle();
      for (const target of scalable) target.setScale(1);
      scene.tweens.add({ targets: moving, y: BUTTON_Y, duration: 90, ease: 'Cubic.Out' });
    })
    .on('pointerdown', () => {
      for (const target of scalable) target.setScale(0.985);
    })
    .on('pointerup', () => {
      for (const target of scalable) target.setScale(1);
      spec.onSelect();
    });
  // 文字层也要能点：按钮内部命中区被文字挡住时，只给底板挂监听会出现"点字没反应"。
  label.setInteractive({ useHandCursor: true }).on('pointerup', () => spec.onSelect());
}

/** 按规格铺出整个结算页。返回值无用，场景只需要副作用。 */
export function createDebriefLayout(scene: Phaser.Scene, spec: DebriefLayoutSpec): void {
  createSurface(scene, spec);
  createHeader(scene, spec);
  createStatCards(scene, spec.cards);
  createFooterRows(scene, spec.footerRows);

  scene.add.rectangle(MARGIN_X, 574, CONTENT_WIDTH, 2, 0xf4eedd, 0.12).setOrigin(0, 0.5);
  spec.buttons.forEach((button, index) => {
    createButton(scene, MARGIN_X + BUTTON_WIDTH / 2 + index * (BUTTON_WIDTH + BUTTON_GAP), button);
  });

  scene.add.text(GAME_WIDTH - MARGIN_X, BUTTON_Y, spec.hint, {
    fontFamily: UI_FONT_FAMILY,
    fontSize: '13px',
    color: FAINT,
    align: 'right',
  }).setOrigin(1, 0.5);
}

function numberToHex(color: number): string {
  return `#${color.toString(16).padStart(6, '0')}`;
}

// ——— 共享格式化。此前 GameOverScene 与 LevelClearScene 各存一份逐字相同的副本。 ———

export function formatDuration(elapsedMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(elapsedMs / 1000));
  return `${Math.floor(totalSeconds / 60)}:${String(totalSeconds % 60).padStart(2, '0')}`;
}

export function formatWeaponUsage(usage: Record<string, number>): string {
  const total = Object.values(usage).reduce((sum, value) => sum + Math.max(0, value), 0);
  if (total <= 0) return '暂无';
  return Object.entries(usage)
    .filter(([, value]) => value > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([id, value]) => `${id} ${Math.round(value / total * 100)}%`)
    .join('  /  ');
}

export interface AmmoEconomySource {
  ammoAmountsByType: Record<string, number>;
  weaponEmptyEvents: Record<string, number>;
  ammoPityTriggers: number;
  finiteWeaponsUnavailableMs: number;
}

export function formatAmmoEconomy(data: AmmoEconomySource): string {
  const amounts = data.ammoAmountsByType;
  const emptyEvents = Object.values(data.weaponEmptyEvents)
    .reduce((sum, value) => sum + Math.max(0, value), 0);
  return [
    `轻 ${amounts.light ?? 0}`,
    `重 ${amounts.heavy ?? 0}`,
    `霰 ${amounts.shell ?? 0}`,
    `爆 ${amounts.explosive ?? 0}`,
    `弹链 ${amounts.belt ?? 0}`,
    `燃料 ${amounts.fuel ?? 0}`,
  ].join(' / ')
    + `  ·  保底 ${data.ammoPityTriggers}`
    + `  ·  空弹 ${emptyEvents}`
    + `  ·  全空 ${(data.finiteWeaponsUnavailableMs / 1000).toFixed(1)}s`;
}
