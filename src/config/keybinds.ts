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
  | 'useBandage' | 'useMedkit' | 'useEnergyDrink'
  | 'deployItem' | 'nextItem'
  | 'nextWeapon' | 'prevWeapon'
  | 'weapon1' | 'weapon2' | 'weapon3' | 'weapon4' | 'weapon5';

export type Keybinds = Record<GameAction, string>;

export const DEFAULT_KEYBINDS: Keybinds = {
  moveUp: 'W', moveDown: 'S', moveLeft: 'A', moveRight: 'D',
  fire: 'MOUSE_LEFT',
  reload: 'R',
  useBandage: 'Z',
  useMedkit: 'X',
  useEnergyDrink: 'C',
  deployItem: 'Q',
  nextItem: 'F',
  nextWeapon: 'WHEEL_UP', prevWeapon: 'WHEEL_DOWN',
  weapon1: 'ONE', weapon2: 'TWO', weapon3: 'THREE', weapon4: 'FOUR', weapon5: 'FIVE',
};

/**
 * 暂停菜单键，固定为 ESC 且不进入 `Keybinds`。
 * 菜单是战局唯一的暂停与退出通道，一旦允许改键，玩家把它绑到已占用的键上就会失去出口。
 */
export const MENU_KEY = 'ESC';

/** 统一展示按键名称，HUD、设置与帮助文案不得各自维护一份映射。 */
const KEYBIND_LABELS: Readonly<Record<string, string>> = {
  MOUSE_LEFT: '鼠标左键',
  MOUSE_RIGHT: '鼠标右键',
  WHEEL_UP: '滚轮上',
  WHEEL_DOWN: '滚轮下',
  ONE: '1',
  TWO: '2',
  THREE: '3',
  FOUR: '4',
  FIVE: '5',
  ESC: 'ESC',
};

export function isKnownKeybindCode(code: string): boolean {
  return code === 'MOUSE_LEFT' || code === 'MOUSE_RIGHT'
    || code === 'WHEEL_UP' || code === 'WHEEL_DOWN'
    || /^[A-Z][A-Z0-9_]*$/.test(code);
}

export function formatKeybind(code: string): string {
  return KEYBIND_LABELS[code] ?? code;
}
