import Phaser from 'phaser';
import { fitTextWidth } from './layout';
import { UI_FONT_FAMILY } from './fonts';

export interface ActionButtonOptions {
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
  primary: boolean;
  onSelect: () => void;
  shortcut?: string;
  fontSize?: string;
}

export interface ActionButtonRefs {
  box: Phaser.GameObjects.Rectangle;
  label: Phaser.GameObjects.Text;
  shortcut: Phaser.GameObjects.Text | null;
}

/** 统一菜单/结算按钮的颜色、按压反馈和命中区，业务场景只提供文案与回调。 */
export function createActionButton(
  scene: Phaser.Scene,
  options: ActionButtonOptions,
): ActionButtonRefs {
  const { x, y, width, height, label: text, primary, onSelect, shortcut, fontSize } = options;
  const box = scene.add.rectangle(x, y, width, height, primary ? 0xfbc02d : 0x1d1d24);
  const applyIdleStyle = (): void => {
    box.fillColor = primary ? 0xfbc02d : 0x1d1d24;
    box.setStrokeStyle(primary ? 4 : 2, primary ? 0x0f0e13 : 0xf4eedd, primary ? 1 : 0.22);
  };
  applyIdleStyle();

  const label = scene.add.text(x, y, text, {
    fontFamily: UI_FONT_FAMILY,
    fontStyle: primary ? 'normal' : 'bold',
    fontSize: fontSize ?? (primary ? '25px' : '16px'),
    color: primary ? '#0f0e13' : '#f4eedd',
    letterSpacing: primary ? 1 : 0,
  }).setOrigin(0.5);
  const shortcutText = shortcut
    ? scene.add.text(x + width / 2 - 14, y, shortcut, {
      fontFamily: UI_FONT_FAMILY,
      fontSize: '13px',
      color: primary ? '#0f0e13' : '#fbc02d',
    }).setOrigin(1, 0.5)
    : null;
  if (shortcutText) shortcutText.setAlpha(primary ? 0.62 : 1);

  const moving: Phaser.GameObjects.GameObject[] = shortcutText
    ? [box, label, shortcutText]
    : [box, label];
  const scalable = shortcutText ? [box, label, shortcutText] : [box, label];
  fitTextWidth(label, width - (shortcutText ? 84 : 28));

  box.setInteractive({ useHandCursor: true })
    .on('pointerover', () => {
      box.fillColor = primary ? 0xf4eedd : 0x292931;
      box.setStrokeStyle(primary ? 4 : 2, primary ? 0x0f0e13 : 0xfbc02d, 1);
      scene.tweens.add({ targets: moving, y: y - 2, duration: 90, ease: 'Cubic.Out' });
    })
    .on('pointerout', () => {
      applyIdleStyle();
      for (const target of scalable) target.setScale(1);
      scene.tweens.add({ targets: moving, y, duration: 90, ease: 'Cubic.Out' });
    })
    .on('pointerdown', () => {
      for (const target of scalable) target.setScale(0.985);
    })
    .on('pointerup', () => {
      for (const target of scalable) target.setScale(1);
      onSelect();
    });
  label.setInteractive({ useHandCursor: true }).on('pointerup', onSelect);

  return { box, label, shortcut: shortcutText };
}
