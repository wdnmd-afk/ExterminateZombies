import type Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from '../constants';
import { ARCHIVE_LAYOUTS, type ArchiveKind } from './archiveLayout';
import { UI_FONT_FAMILY } from './fonts';
import { fitTextWidth } from './layout';

export const ARCHIVE_FOOTER_HINT_WIDTH = 464;

const ARCHIVE_BACKDROPS = {
  weapon: {
    accent: 0xfbc02d, planeAlpha: 0.05, planeLeft: 1010, planeHeight: 194,
    stripeAlpha: 0.045, stripeStart: 1100, stripeHeight: 160, stripeSpan: 220,
    label: 'ARMORY',
  },
  monster: {
    accent: 0xd32f2f, planeAlpha: 0.07, planeLeft: 1008, planeHeight: 202,
    stripeAlpha: 0.05, stripeStart: 1090, stripeHeight: 170, stripeSpan: 240,
    label: 'INFECTED',
  },
} as const;

export interface ArchiveHeaderOptions {
  kind: ArchiveKind;
  kicker: string;
  title: string;
  subtitle: string;
  summary: string;
  onBack: () => void;
}

export interface ArchiveHeaderRefs {
  container: Phaser.GameObjects.Container;
  summary: Phaser.GameObjects.Text;
}

export interface ArchiveRowOptions {
  kind: ArchiveKind;
  position: { x: number; y: number };
  width: number;
  height: number;
  index: string;
  name: string;
  subtitle: string;
  status: string;
}

export interface ArchiveRowRefs {
  container: Phaser.GameObjects.Container;
  box: Phaser.GameObjects.Rectangle;
  marker: Phaser.GameObjects.Rectangle;
  index: Phaser.GameObjects.Text;
  name: Phaser.GameObjects.Text;
  subtitle: Phaser.GameObjects.Text;
  status: Phaser.GameObjects.Text;
  baseX: number;
}

export interface ArchiveDetailOptions {
  kind: ArchiveKind;
  panelLeft: number;
  panelRight: number;
  preview: { centerX: number; centerY: number; width: number; height: number };
}

export interface ArchiveDetailFrameRefs {
  objects: Phaser.GameObjects.GameObject[];
  index: Phaser.GameObjects.Text;
  name: Phaser.GameObjects.Text;
  subtitle: Phaser.GameObjects.Text;
  status: Phaser.GameObjects.Text;
  previewPlane: Phaser.GameObjects.Rectangle;
}

export interface ArchiveFooterOptions {
  kind: ArchiveKind;
  hint: string;
  shortcuts: string;
}

export interface ArchiveFooterRefs {
  container: Phaser.GameObjects.Container;
  hint: Phaser.GameObjects.Text;
}

export function createArchiveBackdrop(scene: Phaser.Scene, kind: ArchiveKind): void {
  const style = ARCHIVE_BACKDROPS[kind];
  scene.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x101014);
  scene.add.rectangle(8, GAME_HEIGHT / 2, 16, GAME_HEIGHT, style.accent);

  const grid = scene.add.graphics();
  grid.lineStyle(1, 0xf4eedd, 0.03);
  for (let columnX = 32; columnX <= GAME_WIDTH; columnX += 48) {
    grid.lineBetween(columnX, 0, columnX, GAME_HEIGHT);
  }
  for (let rowY = 0; rowY <= GAME_HEIGHT; rowY += 48) {
    grid.lineBetween(16, rowY, GAME_WIDTH, rowY);
  }

  const plane = scene.add.graphics();
  plane.fillStyle(style.accent, style.planeAlpha);
  plane.fillTriangle(style.planeLeft, 0, GAME_WIDTH, 0, GAME_WIDTH, style.planeHeight);
  plane.lineStyle(8, style.accent, style.stripeAlpha);
  for (let offset = 0; offset < style.stripeSpan; offset += 30) {
    plane.lineBetween(style.stripeStart + offset, 0, GAME_WIDTH, style.stripeHeight - offset);
  }

  scene.add.text(GAME_WIDTH - 18, GAME_HEIGHT / 2, style.label, {
    fontFamily: UI_FONT_FAMILY,
    fontSize: '17px',
    color: '#f4eedd',
    letterSpacing: 5,
  }).setOrigin(0.5).setRotation(Math.PI / 2).setAlpha(0.15);
}

export function createArchiveHeader(scene: Phaser.Scene, options: ArchiveHeaderOptions): ArchiveHeaderRefs {
  const kicker = scene.add.text(64, 28, options.kicker, {
    fontFamily: UI_FONT_FAMILY,
    fontSize: '14px',
    color: '#fbc02d',
    letterSpacing: 2,
  });
  const title = scene.add.text(62, 48, options.title, {
    fontFamily: UI_FONT_FAMILY,
    fontStyle: 'bold',
    fontSize: '56px',
    color: '#f4eedd',
    stroke: '#0f0e13',
    strokeThickness: 4,
  });
  const subtitle = scene.add.text(66, 112, options.subtitle, {
    fontFamily: UI_FONT_FAMILY,
    fontSize: '16px',
    color: '#98949b',
  });
  const summary = scene.add.text(1052, options.kind === 'weapon' ? 52 : 44, options.summary, {
    fontFamily: UI_FONT_FAMILY,
    fontSize: '13px',
    color: '#8f8b92',
    align: 'right',
    lineSpacing: options.kind === 'weapon' ? 0 : 4,
  }).setOrigin(1, 0);

  const backBox = scene.add.rectangle(1150, 76, 130, 42, 0x1c1c22)
    .setStrokeStyle(2, 0xf4eedd, 0.2)
    .setInteractive({ useHandCursor: true });
  const backLabel = scene.add.text(1150, 76, '←  返回', {
    fontFamily: UI_FONT_FAMILY,
    fontStyle: 'bold',
    fontSize: '16px',
    color: '#f4eedd',
  }).setOrigin(0.5);
  backBox
    .on('pointerover', () => {
      backBox.fillColor = 0xfbc02d;
      backBox.setStrokeStyle(2, 0xfbc02d, 1);
      backLabel.setColor('#0f0e13');
    })
    .on('pointerout', () => {
      backBox.fillColor = 0x1c1c22;
      backBox.setStrokeStyle(2, 0xf4eedd, 0.2);
      backLabel.setColor('#f4eedd');
    })
    .on('pointerup', options.onBack);

  const rule = scene.add.rectangle(GAME_WIDTH / 2 + 8, 148, GAME_WIDTH - 112, 2, 0xf4eedd, 0.13);
  const container = scene.add.container(0, 0, [kicker, title, subtitle, summary, backBox, backLabel, rule]);
  return { container, summary };
}

export function createArchiveIndexHeading(
  scene: Phaser.Scene,
  kind: ArchiveKind,
  title: string,
  summary: string,
): Phaser.GameObjects.Text[] {
  const layout = ARCHIVE_LAYOUTS[kind];
  const heading = scene.add.text(layout.indexLeft, 168, title, {
    fontFamily: UI_FONT_FAMILY,
    fontSize: '22px',
    color: '#f4eedd',
    letterSpacing: 1,
  });
  const hint = scene.add.text(layout.indexLeft + layout.indexWidth, 174, summary, {
    fontFamily: UI_FONT_FAMILY,
    fontSize: '13px',
    color: '#69666d',
  }).setOrigin(1, 0);
  return [heading, hint];
}

export function createArchiveRow(scene: Phaser.Scene, options: ArchiveRowOptions): ArchiveRowRefs {
  const weapon = options.kind === 'weapon';
  const left = -options.width / 2;
  // 盒高会随条目数收紧，文字偏移沿用各页原始比例，不能重新写死成像素值。
  const nameY = -options.height * (weapon ? 0.21 : 10 / 48);
  const subtitleY = options.height * (weapon ? 0.27 : 12 / 48);
  const box = scene.add.rectangle(0, 0, options.width, options.height, 0x19191f);
  const marker = scene.add.rectangle(left, 0, weapon ? 6 : 5, options.height, 0xfbc02d)
    .setOrigin(0, 0.5);
  const index = scene.add.text(left + (weapon ? 18 : 17), weapon ? 0 : nameY, options.index, {
    fontFamily: UI_FONT_FAMILY,
    fontStyle: weapon ? 'normal' : 'bold',
    fontSize: weapon ? '17px' : '11px',
    color: '#f4eedd',
  }).setOrigin(0, 0.5);
  const name = scene.add.text(left + (weapon ? 54 : 84), nameY, options.name, {
    fontFamily: UI_FONT_FAMILY,
    fontStyle: 'bold',
    fontSize: '16px',
    color: '#f4eedd',
  }).setOrigin(0, 0.5);
  const subtitle = scene.add.text(left + (weapon ? 54 : 17), subtitleY, options.subtitle, {
    fontFamily: UI_FONT_FAMILY,
    fontSize: weapon ? '10px' : '11px',
    color: '#8e8b92',
  }).setOrigin(0, 0.5);
  const status = scene.add.text(
    options.width / 2 - (weapon ? 14 : 16), weapon ? 0 : subtitleY, options.status,
    {
      fontFamily: UI_FONT_FAMILY,
      fontStyle: weapon ? 'normal' : 'bold',
      fontSize: '11px',
      color: '#fbc02d',
    },
  ).setOrigin(1, 0.5);
  if (weapon) {
    fitTextWidth(name, 156);
    fitTextWidth(subtitle, 156);
  }
  const container = scene.add.container(options.position.x, options.position.y, [
    box, marker, index, name, subtitle, status,
  ]);
  return { container, box, marker, index, name, subtitle, status, baseX: options.position.x };
}

export function createArchiveDetailFrame(scene: Phaser.Scene, options: ArchiveDetailOptions): ArchiveDetailFrameRefs {
  const weapon = options.kind === 'weapon';
  const { panelLeft, panelRight, preview } = options;
  const dividerTop = weapon ? 157 : 159;
  const dividerBottom = ARCHIVE_LAYOUTS[options.kind].footerRuleY - (weapon ? 12 : 15);
  const divider = scene.add.rectangle(
    panelLeft - 38, (dividerTop + dividerBottom) / 2, 2, dividerBottom - dividerTop, 0xf4eedd, 0.13,
  );
  const eyebrow = scene.add.text(panelLeft, 168, weapon ? 'SELECTED WEAPON' : 'ACTIVE DOSSIER', {
    fontFamily: UI_FONT_FAMILY,
    fontSize: '13px',
    color: '#fbc02d',
    letterSpacing: 2,
  });
  const index = scene.add.text(panelRight, 168, '', {
    fontFamily: UI_FONT_FAMILY,
    fontSize: '13px',
    color: '#6f6c73',
  }).setOrigin(1, 0);
  const name = scene.add.text(panelLeft, weapon ? 194 : 193, '', {
    fontFamily: UI_FONT_FAMILY,
    fontStyle: weapon ? 'normal' : 'bold',
    fontSize: weapon ? '39px' : '38px',
    color: '#f4eedd',
    letterSpacing: weapon ? 1 : 0,
  });
  const subtitle = scene.add.text(panelLeft, weapon ? 242 : 241, '', {
    fontFamily: UI_FONT_FAMILY,
    fontSize: weapon ? '15px' : '13px',
    color: '#98949b',
    letterSpacing: weapon ? 0 : 1,
  });
  const status = scene.add.text(panelRight, weapon ? 205 : 242, '', {
    fontFamily: UI_FONT_FAMILY,
    fontStyle: weapon ? 'normal' : 'bold',
    fontSize: '12px',
    color: weapon ? '#fbc02d' : '#d32f2f',
    letterSpacing: 1,
  }).setOrigin(1, 0);
  const previewPlane = scene.add.rectangle(
    preview.centerX, preview.centerY, preview.width, preview.height, 0x16161b,
  ).setStrokeStyle(1, 0xf4eedd, 0.08);

  // 不在这里挂载容器，场景需把 Boss 徽标、预览底板和预览对象按原来的层级插入。
  const objects = [divider, eyebrow, index, name, subtitle, status];
  return { objects, index, name, subtitle, status, previewPlane };
}

export function createArchiveFooter(scene: Phaser.Scene, options: ArchiveFooterOptions): ArchiveFooterRefs {
  const layout = ARCHIVE_LAYOUTS[options.kind];
  const rule = scene.add.rectangle(GAME_WIDTH / 2 + 8, layout.footerRuleY, GAME_WIDTH - 112, 2, 0xf4eedd, 0.12);
  const hint = scene.add.text(64, layout.footerTextY, options.hint, {
    fontFamily: UI_FONT_FAMILY,
    fontSize: layout.footerFontSize,
    color: '#77747b',
  });
  const shortcuts = scene.add.text(GAME_WIDTH - 64, layout.footerTextY, options.shortcuts, {
    fontFamily: UI_FONT_FAMILY,
    fontSize: layout.footerFontSize,
    color: '#fbc02d',
  }).setOrigin(1, 0);
  // 为动态编队反馈和快捷键各自留出宽度，中间保留 32px，避免长武器名挤住操作提示。
  fitTextWidth(hint, ARCHIVE_FOOTER_HINT_WIDTH);
  fitTextWidth(shortcuts, GAME_WIDTH - 128 - ARCHIVE_FOOTER_HINT_WIDTH - 32);
  const container = scene.add.container(0, 0, [rule, hint, shortcuts]);
  return { container, hint };
}

export function playArchiveEntrance(
  scene: Phaser.Scene,
  sections: {
    header: Phaser.GameObjects.Container;
    index: Phaser.GameObjects.Container;
    detail: Phaser.GameObjects.Container;
    footer: Phaser.GameObjects.Container;
  },
): void {
  const groups = [
    { container: sections.header, delay: 40, offsetY: 12 },
    { container: sections.index, delay: 110, offsetY: 16 },
    { container: sections.detail, delay: 180, offsetY: 16 },
    { container: sections.footer, delay: 260, offsetY: 8 },
  ];
  for (const { container, delay, offsetY } of groups) {
    const targetY = container.y;
    container.setAlpha(0).setY(targetY + offsetY);
    scene.tweens.add({
      targets: container,
      alpha: 1,
      y: targetY,
      delay,
      duration: 340,
      ease: 'Cubic.Out',
    });
  }
}
