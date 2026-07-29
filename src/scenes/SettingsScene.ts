import Phaser from 'phaser';
import { DEFAULT_KEYBINDS, type GameAction, type Keybinds } from '../config/keybinds';
import { GAME_HEIGHT, GAME_WIDTH, SCENES } from '../constants';
import { InputManager } from '../systems/InputManager';
import { SAVE_KEYS, SaveManager } from '../systems/SaveManager';
import { configureHighResolutionScene } from '../systems/DisplayManager';

const ACTION_LABELS: Record<GameAction, string> = {
  moveUp: '向上移动',
  moveDown: '向下移动',
  moveLeft: '向左移动',
  moveRight: '向右移动',
  fire: '开火',
  reload: '换弹',
  deployItem: '布置道具',
  nextItem: '切换道具',
  nextWeapon: '下一把武器',
  prevWeapon: '上一把武器',
  weapon1: '武器栏 1',
  weapon2: '武器栏 2',
  weapon3: '武器栏 3',
  weapon4: '武器栏 4',
  pause: '暂停',
};

const ACTIONS = Object.keys(DEFAULT_KEYBINDS) as GameAction[];

interface BindingRow {
  box: Phaser.GameObjects.Rectangle;
  label: Phaser.GameObjects.Text;
  value: Phaser.GameObjects.Text;
}

export class SettingsScene extends Phaser.Scene {
  private binds: Keybinds = { ...DEFAULT_KEYBINDS };
  private waitingAction: GameAction | null = null;
  private armCaptureAt = 0;
  private rows = new Map<GameAction, BindingRow>();
  private statusText!: Phaser.GameObjects.Text;

  constructor() {
    super(SCENES.settings);
  }

  create(): void {
    configureHighResolutionScene(this);
    this.binds = SaveManager.load(SAVE_KEYS.keybinds, { ...DEFAULT_KEYBINDS });

    this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x121820);
    this.add.text(GAME_WIDTH / 2, 34, 'SETTINGS', {
      fontFamily: 'Impact, "Arial Black", sans-serif',
      fontSize: '60px',
      color: '#f4eedd',
      stroke: '#455a64',
      strokeThickness: 6,
    }).setOrigin(0.5, 0);

    this.add.text(GAME_WIDTH / 2, 122, [
      '点击任一动作后，按下新的键盘按键，或在空白区域点击鼠标键，或滚动滚轮完成绑定。',
      '若新按键已被其它动作占用，将自动与原动作交换。未进入监听时按 ESC 返回主菜单。',
    ].join('\n'), {
      fontFamily: '"Microsoft YaHei", sans-serif',
      fontSize: '18px',
      lineSpacing: 6,
      align: 'center',
      color: '#f4eedd',
    }).setOrigin(0.5, 0);

    this.statusText = this.add.text(GAME_WIDTH / 2, 206, '', {
      fontFamily: '"Microsoft YaHei", sans-serif',
      fontSize: '18px',
      color: '#fbc02d',
      align: 'center',
    }).setOrigin(0.5);

    this.createBindingGrid();

    const reset = this.add.rectangle(GAME_WIDTH / 2 - 180, 646, 300, 54, 0xfbc02d).setStrokeStyle(4, 0x0f0e13);
    reset.setData('settingsControl', true);
    const resetText = this.add.text(GAME_WIDTH / 2 - 180, 646, '恢复默认键位', {
      fontFamily: 'Impact, "Arial Black", sans-serif',
      fontSize: '26px',
      color: '#0f0e13',
    }).setOrigin(0.5);
    resetText.setData('settingsControl', true);

    const back = this.add.rectangle(GAME_WIDTH / 2 + 180, 646, 300, 54, 0xf4eedd).setStrokeStyle(4, 0x0f0e13);
    back.setData('settingsControl', true);
    const text = this.add.text(GAME_WIDTH / 2 + 180, 646, '返回主菜单', {
      fontFamily: 'Impact, "Arial Black", sans-serif',
      fontSize: '28px',
      color: '#0f0e13',
    }).setOrigin(0.5);
    text.setData('settingsControl', true);

    reset.setInteractive({ useHandCursor: true }).on('pointerup', () => {
      this.resetDefaults();
    });
    resetText.setInteractive({ useHandCursor: true }).on('pointerup', () => {
      this.resetDefaults();
    });
    back.setInteractive({ useHandCursor: true }).on('pointerup', () => {
      if (!this.waitingAction) this.scene.start(SCENES.mainMenu);
    });
    text.setInteractive({ useHandCursor: true }).on('pointerup', () => {
      if (!this.waitingAction) this.scene.start(SCENES.mainMenu);
    });

    this.input.keyboard?.on('keydown', this.handleKeyboardCapture, this);
    this.input.on(Phaser.Input.Events.POINTER_DOWN, this.handlePointerCapture, this);
    this.input.on(Phaser.Input.Events.POINTER_WHEEL, this.handleWheelCapture, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.handleShutdown, this);

    this.refreshRows();
  }

  private createBindingGrid(): void {
    const rowsPerColumn = Math.ceil(ACTIONS.length / 2);
    const startX = 70;
    const columnGap = 620;
    const startY = 258;
    const rowHeight = 44;

    ACTIONS.forEach((action, index) => {
      const column = Math.floor(index / rowsPerColumn);
      const row = index % rowsPerColumn;
      const x = startX + column * columnGap;
      const y = startY + row * rowHeight;

      const labelWidth = 120;
      const boxX = x + labelWidth;
      const boxWidth = 360;

      const box = this.add.rectangle(boxX, y, boxWidth, 38, 0x1f2a34).setOrigin(0, 0.5).setStrokeStyle(3, 0x455a64);
      box.setInteractive({ useHandCursor: true });
      box.setData('settingsControl', true);

      const label = this.add.text(x, y, ACTION_LABELS[action], {
        fontFamily: '"Microsoft YaHei", sans-serif',
        fontSize: '20px',
        color: '#f4eedd',
      }).setOrigin(0, 0.5);
      label.setData('settingsControl', true);

      const value = this.add.text(boxX + boxWidth / 2, y, '', {
        fontFamily: 'Consolas, monospace',
        fontSize: '18px',
        color: '#fbc02d',
      }).setOrigin(0.5);
      value.setData('settingsControl', true);

      const beginWait = () => this.beginRebind(action);
      box.on('pointerup', beginWait);
      label.setInteractive({ useHandCursor: true }).on('pointerup', beginWait);
      value.setInteractive({ useHandCursor: true }).on('pointerup', beginWait);

      this.rows.set(action, { box, label, value });
    });
  }

  private beginRebind(action: GameAction): void {
    if (this.waitingAction === action) return;
    this.waitingAction = action;
    this.armCaptureAt = this.time.now + 120;
    this.refreshRows();
  }

  private handleKeyboardCapture(event: KeyboardEvent): void {
    if (!this.waitingAction) {
      if (event.keyCode === Phaser.Input.Keyboard.KeyCodes.ESC) {
        this.scene.start(SCENES.mainMenu);
      }
      return;
    }

    const code = InputManager.fromKeyCodeValue(event.keyCode);
    if (!code) return;
    event.preventDefault();
    this.commitBinding(code);
  }

  private handlePointerCapture(pointer: Phaser.Input.Pointer, currentlyOver: Phaser.GameObjects.GameObject[]): void {
    if (!this.waitingAction || this.time.now < this.armCaptureAt) return;
    if (currentlyOver.some((gameObject) => gameObject.getData('settingsControl'))) return;
    this.commitBinding(pointer.button === 2 ? 'MOUSE_RIGHT' : 'MOUSE_LEFT');
  }

  private handleWheelCapture(_pointer: Phaser.Input.Pointer, _currentlyOver: Phaser.GameObjects.GameObject[], _dx: number, dy: number): void {
    if (!this.waitingAction || this.time.now < this.armCaptureAt) return;
    this.commitBinding(dy < 0 ? 'WHEEL_UP' : 'WHEEL_DOWN');
  }

  private commitBinding(newCode: string): void {
    const action = this.waitingAction;
    if (!action) return;

    const oldCode = this.binds[action];
    for (const other of ACTIONS) {
      if (other !== action && this.binds[other] === newCode) {
        this.binds[other] = oldCode;
      }
    }
    this.binds[action] = newCode;
    this.waitingAction = null;
    SaveManager.save(SAVE_KEYS.keybinds, this.binds);
    this.refreshRows();
  }

  private resetDefaults(): void {
    this.binds = { ...DEFAULT_KEYBINDS };
    this.waitingAction = null;
    SaveManager.save(SAVE_KEYS.keybinds, this.binds);
    this.refreshRows();
  }

  private refreshRows(): void {
    for (const action of ACTIONS) {
      const row = this.rows.get(action);
      if (!row) continue;

      const active = this.waitingAction === action;
      row.box.fillColor = active ? 0x2d4252 : 0x1f2a34;
      row.box.setStrokeStyle(3, active ? 0xfbc02d : 0x455a64);
      row.value.setText(active ? '等待输入...' : this.formatCode(this.binds[action]));
      row.value.setColor(active ? '#fff3a2' : '#fbc02d');
    }

    if (this.waitingAction) {
      this.statusText.setText(`正在重绑: ${ACTION_LABELS[this.waitingAction]}`);
    } else {
      this.statusText.setText('点击某个动作开始重绑');
    }
  }

  private formatCode(code: string): string {
    const map: Record<string, string> = {
      MOUSE_LEFT: '鼠标左键',
      MOUSE_RIGHT: '鼠标右键',
      WHEEL_UP: '滚轮上',
      WHEEL_DOWN: '滚轮下',
      ONE: '1',
      TWO: '2',
      THREE: '3',
      FOUR: '4',
      ESC: 'ESC',
    };
    return map[code] ?? code;
  }

  private handleShutdown(): void {
    this.input.keyboard?.off('keydown', this.handleKeyboardCapture, this);
    this.input.off(Phaser.Input.Events.POINTER_DOWN, this.handlePointerCapture, this);
    this.input.off(Phaser.Input.Events.POINTER_WHEEL, this.handleWheelCapture, this);
  }
}
