/**
 * 键位配置。值使用统一的按键代号字符串:
 *   键盘:'W' 'S' 'A' 'D' 'R' 'ONE'..'NINE' 'ESC' 'Q' 'F'
 *   鼠标:'MOUSE_LEFT' 'MOUSE_RIGHT'
 *   滚轮:'WHEEL_UP' 'WHEEL_DOWN'
 * InputManager 负责把代号解析成 Phaser 的监听。
 */
export type GameAction =
  | 'moveUp' | 'moveDown' | 'moveLeft' | 'moveRight'
  | 'fire' | 'reload'
  | 'deployItem' | 'nextItem'
  | 'nextWeapon' | 'prevWeapon'
  | 'weapon1' | 'weapon2' | 'weapon3' | 'weapon4'
  | 'pause';

export type Keybinds = Record<GameAction, string>;

export const DEFAULT_KEYBINDS: Keybinds = {
  moveUp: 'W', moveDown: 'S', moveLeft: 'A', moveRight: 'D',
  fire: 'MOUSE_LEFT',
  reload: 'R',
  deployItem: 'Q',
  nextItem: 'F',
  nextWeapon: 'WHEEL_UP', prevWeapon: 'WHEEL_DOWN',
  weapon1: 'ONE', weapon2: 'TWO', weapon3: 'THREE', weapon4: 'FOUR',
  pause: 'ESC',
};
