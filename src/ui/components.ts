import Phaser from 'phaser';
import { fitTextWidth } from './layout';
import { UI_FONT_FAMILY } from './fonts';
import { createBitmapFrame } from './bitmapFrame';
import { UI_ICON_KEYS } from '../config/uiVisuals';

export function bindPressAction(
  target: Phaser.GameObjects.GameObject,
  onSelect: () => void,
  options: { isEnabled?: () => boolean; onPressChange?: (pressed: boolean) => void } = {},
): void {
  let pointerId: number | null = null;
  const cancel = (): void => { pointerId = null; options.onPressChange?.(false); };
  target.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
    if (options.isEnabled && !options.isEnabled()) return;
    pointerId = pointer.id;
    options.onPressChange?.(true);
  });
  target.on('pointerup', (pointer: Phaser.Input.Pointer) => {
    const selected = pointerId === pointer.id && (!options.isEnabled || options.isEnabled());
    cancel();
    if (selected) onSelect();
  });
  target.on('pointerout', cancel);
  target.on('pointerupoutside', cancel);
}

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
  icon?: keyof typeof UI_ICON_KEYS;
  isEnabled?: () => boolean;
}

export interface ActionButtonRefs {
  box: Phaser.GameObjects.Rectangle;
  label: Phaser.GameObjects.Text;
  shortcut: Phaser.GameObjects.Text | null;
  objects: Phaser.GameObjects.GameObject[];
  setSelected: (selected: boolean) => void;
}

/** 统一菜单/结算按钮的颜色、按压反馈和命中区，业务场景只提供文案与回调。 */
export function createActionButton(
  scene: Phaser.Scene,
  options: ActionButtonOptions,
): ActionButtonRefs {
  const { x, y, width, height, label: text, primary, onSelect, shortcut, fontSize } = options;
  const box = scene.add.rectangle(x, y, width, height, primary ? 0xfbc02d : 0x1d1d24);
  let selected = false;
  const applyIdleStyle = (): void => {
    box.fillColor = primary ? 0xfbc02d : 0x1d1d24;
    box.setStrokeStyle(primary ? 4 : 2, primary ? 0x0f0e13 : selected ? 0xfbc02d : 0xf4eedd, primary || selected ? 1 : 0.22);
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
  const scalable: Array<Phaser.GameObjects.Rectangle | Phaser.GameObjects.Text | Phaser.GameObjects.Container> = shortcutText ? [box, label, shortcutText] : [box, label];
  const frame = createBitmapFrame(scene, x, y, width - 4, height - 4, primary ? 0x0f0e13 : 0xf4eedd);
  if (frame) { moving.push(frame); scalable.push(frame); }
  if (options.icon && scene.textures.exists(UI_ICON_KEYS[options.icon])) {
    const icon = scene.add.image(-width / 2 + 24, 0, UI_ICON_KEYS[options.icon]).setDisplaySize(18, 18)
      .setTint(primary ? 0x0f0e13 : 0xfbc02d);
    const holder = scene.add.container(x, y, [icon]);
    moving.push(holder); scalable.push(holder);
  }
  fitTextWidth(label, width - (shortcutText ? 84 : 28) - (options.icon ? 36 : 0));

  box.setInteractive({ useHandCursor: true })
    .on('pointerover', () => {
      box.fillColor = primary ? 0xf4eedd : 0x292931;
      box.setStrokeStyle(primary ? 4 : 2, primary ? 0x0f0e13 : 0xfbc02d, 1);
      scene.tweens.add({ targets: moving, y: y - 2, duration: 90, ease: 'Cubic.Out' });
    })
    .on('pointerout', () => {
      applyIdleStyle();
      scene.tweens.add({ targets: moving, y, duration: 90, ease: 'Cubic.Out' });
    });
  bindPressAction(box, onSelect, { isEnabled: options.isEnabled, onPressChange: pressed => {
    for (const target of scalable) target.setScale(pressed ? 0.985 : 1);
  } });

  return { box, label, shortcut: shortcutText, objects: moving, setSelected(value) {
    selected = value;
    applyIdleStyle();
    label.setColor(primary ? '#0f0e13' : selected ? '#fbc02d' : '#f4eedd');
  } };
}
