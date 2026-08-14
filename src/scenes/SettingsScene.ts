import Phaser from 'phaser';
import { DEFAULT_KEYBINDS, MENU_KEY, formatKeybind, type GameAction, type Keybinds } from '../config/keybinds';
import { LEVELS } from '../config/levels';
import { GAME_HEIGHT, GAME_WIDTH, SCENES } from '../constants';
import { InputManager } from '../systems/InputManager';
import {
  DEFAULT_AUDIO_SETTINGS,
  SAVE_KEYS,
  SaveManager,
  type AudioSettings,
  DEFAULT_ACCESSIBILITY_SETTINGS,
  type AccessibilityLevel,
  type AccessibilitySettings,
} from '../systems/SaveManager';
import { configureHighResolutionScene } from '../systems/DisplayManager';
import { SoundManager } from '../systems/SoundManager';
import { UI_FONT_FAMILY } from '../ui/fonts';

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
};

/** 暂停菜单键固定为 ESC，不出现在这张表里，因此也无法被改绑。 */
const ACTIONS = Object.keys(DEFAULT_KEYBINDS) as GameAction[];

interface BindingRow {
  box: Phaser.GameObjects.Rectangle;
  label: Phaser.GameObjects.Text;
  value: Phaser.GameObjects.Text;
}

type AudioSettingKey = Exclude<keyof AudioSettings, 'enabled'>;

interface AudioRow {
  key: AudioSettingKey;
  fill: Phaser.GameObjects.Rectangle;
  knob: Phaser.GameObjects.Arc;
  value: Phaser.GameObjects.Text;
}

const AUDIO_LABELS: Record<AudioSettingKey, string> = {
  masterVolume: '总音量',
  effectsVolume: '音效',
  musicVolume: '音乐',
};

export class SettingsScene extends Phaser.Scene {
  private binds: Keybinds = { ...DEFAULT_KEYBINDS };
  private waitingAction: GameAction | null = null;
  private armCaptureAt = 0;
  private rows = new Map<GameAction, BindingRow>();
  private statusText!: Phaser.GameObjects.Text;
  private audioSettings: AudioSettings = { ...DEFAULT_AUDIO_SETTINGS };
  private audioRows = new Map<AudioSettingKey, AudioRow>();
  private progressResetArmed = false;
  private progressResetText!: Phaser.GameObjects.Text;
  private accessibilitySettings: AccessibilitySettings = { ...DEFAULT_ACCESSIBILITY_SETTINGS };
  private accessibilityBoxes = new Map<string, Phaser.GameObjects.Rectangle[]>();

  constructor() {
    super(SCENES.settings);
  }

  create(): void {
    configureHighResolutionScene(this);
    this.binds = SaveManager.load(SAVE_KEYS.keybinds, { ...DEFAULT_KEYBINDS });
    this.audioSettings = SaveManager.load(SAVE_KEYS.audioSettings, { ...DEFAULT_AUDIO_SETTINGS });
    this.accessibilitySettings = SaveManager.load(SAVE_KEYS.accessibilitySettings, { ...DEFAULT_ACCESSIBILITY_SETTINGS });
    SoundManager.setMusic('menu');
    SoundManager.pauseMusic(false);

    this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x121820);
    this.add.text(GAME_WIDTH / 2, 34, 'SETTINGS', {
      fontFamily: UI_FONT_FAMILY,
      fontSize: '60px',
      color: '#f4eedd',
      stroke: '#455a64',
      strokeThickness: 6,
    }).setOrigin(0.5, 0);

    this.add.text(GAME_WIDTH / 2, 122, [
      '点击任一动作后，按下新的键盘按键，或在空白区域点击鼠标键，或滚动滚轮完成绑定。',
      '若新按键已被其它动作占用，将自动与原动作交换。ESC 固定给暂停菜单不可改绑；未在监听时按 ESC 返回主菜单。',
    ].join('\n'), {
      fontFamily: UI_FONT_FAMILY,
      fontSize: '16px',
      lineSpacing: 6,
      align: 'center',
      color: '#f4eedd',
    }).setOrigin(0.5, 0);

    this.statusText = this.add.text(GAME_WIDTH / 2, 206, '', {
      fontFamily: UI_FONT_FAMILY,
      fontSize: '18px',
      color: '#fbc02d',
      align: 'center',
    }).setOrigin(0.5);

    this.createBindingGrid();
    this.createAudioControls();
    this.createAccessibilityControls();
    this.createProgressReset();

    const reset = this.add.rectangle(GAME_WIDTH / 2 - 180, 666, 300, 46, 0xfbc02d).setStrokeStyle(4, 0x0f0e13);
    reset.setData('settingsControl', true);
    const resetText = this.add.text(GAME_WIDTH / 2 - 180, 666, '恢复默认键位', {
      fontFamily: UI_FONT_FAMILY,
      fontSize: '22px',
      color: '#0f0e13',
    }).setOrigin(0.5);
    resetText.setData('settingsControl', true);

    const back = this.add.rectangle(GAME_WIDTH / 2 + 180, 666, 300, 46, 0xf4eedd).setStrokeStyle(4, 0x0f0e13);
    back.setData('settingsControl', true);
    const text = this.add.text(GAME_WIDTH / 2 + 180, 666, '返回主菜单', {
      fontFamily: UI_FONT_FAMILY,
      fontSize: '22px',
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
    const startY = 246;
    const rowHeight = 37;

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
        fontFamily: UI_FONT_FAMILY,
        fontSize: '20px',
        color: '#f4eedd',
      }).setOrigin(0, 0.5);
      label.setData('settingsControl', true);

      const value = this.add.text(boxX + boxWidth / 2, y, '', {
        fontFamily: UI_FONT_FAMILY,
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

  private createAudioControls(): void {
    this.add.text(700, 506, '音频设置', {
      fontFamily: UI_FONT_FAMILY,
      fontSize: '18px',
      color: '#f4eedd',
    });

    const trackX = 820;
    const trackWidth = 250;
    (Object.keys(AUDIO_LABELS) as AudioSettingKey[]).forEach((key, index) => {
      const y = 531 + index * 27;
      this.add.text(700, y, AUDIO_LABELS[key], {
        fontFamily: UI_FONT_FAMILY,
        fontSize: '14px',
        color: '#bfc9ce',
      }).setOrigin(0, 0.5);

      this.add.rectangle(trackX, y, trackWidth, 7, 0x455a64).setOrigin(0, 0.5);
      const fill = this.add.rectangle(trackX, y, 0, 7, 0xfbc02d).setOrigin(0, 0.5);
      const knob = this.add.circle(trackX, y, 7, 0xf4eedd).setStrokeStyle(2, 0x0f0e13);
      const value = this.add.text(trackX + trackWidth + 18, y, '', {
        fontFamily: UI_FONT_FAMILY,
        fontSize: '13px',
        color: '#fbc02d',
      }).setOrigin(0, 0.5);
      const hitZone = this.add.rectangle(trackX, y, trackWidth, 28, 0xffffff, 0).setOrigin(0, 0.5);
      hitZone.setInteractive({ useHandCursor: true });
      hitZone.setData('settingsControl', true);
      const updateFromLocalX = (localX: number): void => {
        // 使用交互对象局部坐标，避免 2x 渲染缓冲区让 Pointer.x 与逻辑坐标不一致。
        const next = Phaser.Math.Clamp(localX / trackWidth, 0, 1);
        this.audioSettings[key] = next;
        SoundManager.setSettings(this.audioSettings);
        this.refreshAudioRows();
      };
      hitZone.on('pointerdown', (_pointer: Phaser.Input.Pointer, localX: number) => updateFromLocalX(localX));
      hitZone.on('pointermove', (pointer: Phaser.Input.Pointer, localX: number) => {
        if (pointer.isDown) updateFromLocalX(localX);
      });
      this.audioRows.set(key, { key, fill, knob, value });
    });
    this.refreshAudioRows();
  }

  private createProgressReset(): void {
    const resetBox = this.add.rectangle(250, 580, 300, 42, 0x2b2528)
      .setStrokeStyle(2, 0xd32f2f, 0.8)
      .setInteractive({ useHandCursor: true });
    resetBox.setData('settingsControl', true);
    this.progressResetText = this.add.text(250, 580, '清除战役、军械许可与无尽纪录', {
      fontFamily: UI_FONT_FAMILY,
      fontSize: '15px',
      color: '#ffb5a6',
    }).setOrigin(0.5);
    this.progressResetText.setData('settingsControl', true);
    resetBox.on('pointerup', () => this.handleProgressReset());
    this.progressResetText.setInteractive({ useHandCursor: true }).on('pointerup', () => this.handleProgressReset());
  }

  private createAccessibilityControls(): void {
    this.add.text(930, 535, '辅助选项', { fontFamily: UI_FONT_FAMILY, fontSize: '18px', color: '#f4eedd' });
    const rows: Array<{ key: 'shake' | 'flash' | 'slowMotion'; label: string }> = [
      { key: 'shake', label: '震屏' }, { key: 'flash', label: '闪光' }, { key: 'slowMotion', label: '慢动作' },
    ];
    const levels: AccessibilityLevel[] = ['off', 'low', 'medium', 'high'];
    rows.forEach((row, index) => {
      const y = 557 + index * 22;
      this.add.text(850, y, row.label, {
        fontFamily: UI_FONT_FAMILY,
        fontSize: '13px',
        color: '#bfc9ce',
      }).setOrigin(0, 0.5);
      const boxes: Phaser.GameObjects.Rectangle[] = [];
      levels.forEach((level, levelIndex) => {
        const x = 910 + levelIndex * 55;
        const box = this.add.rectangle(x, y, 60, 20, 0x1f2a34).setStrokeStyle(1, 0x455a64).setInteractive({ useHandCursor: true });
        box.on('pointerup', () => {
          this.accessibilitySettings[row.key] = level;
          SaveManager.save(SAVE_KEYS.accessibilitySettings, this.accessibilitySettings);
          this.refreshAccessibilityControls();
        });
        boxes.push(box);
        this.add.text(x, y, level === 'off' ? '关' : level === 'low' ? '低' : level === 'medium' ? '中' : '高', { fontFamily: UI_FONT_FAMILY, fontSize: '11px', color: '#f4eedd' }).setOrigin(0.5);
      });
      this.accessibilityBoxes.set(row.key, boxes);
    });
    this.refreshAccessibilityControls();
  }

  private refreshAccessibilityControls(): void {
    for (const [key, boxes] of this.accessibilityBoxes) {
      const selected = this.accessibilitySettings[key as 'shake' | 'flash' | 'slowMotion'];
      const levels: AccessibilityLevel[] = ['off', 'low', 'medium', 'high'];
      boxes.forEach((box, index) => {
        box.fillColor = levels[index] === selected ? 0xfbc02d : 0x1f2a34;
      });
    }
  }

  private handleProgressReset(): void {
    if (!this.progressResetArmed) {
      this.progressResetArmed = true;
      this.progressResetText.setText('再次点击确认清除');
      this.statusText.setText('清除进度操作已待确认');
      this.time.delayedCall(2600, () => {
        this.progressResetArmed = false;
        if (this.progressResetText.active) this.progressResetText.setText('清除战役、军械许可与无尽纪录');
      });
      return;
    }

    SaveManager.resetProgress(LEVELS[0]?.id ?? 'level_1');
    this.progressResetArmed = false;
    this.progressResetText.setText('进度已清除');
    this.statusText.setText('关卡、军械许可与无尽纪录已恢复初始状态');
    SoundManager.play('uiConfirm');
  }

  private refreshAudioRows(): void {
    for (const [key, row] of this.audioRows) {
      const value = this.audioSettings[key];
      row.fill.width = 250 * value;
      row.knob.x = 820 + 250 * value;
      row.value.setText(`${Math.round(value * 100)}%`);
    }
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
        SoundManager.play('uiConfirm');
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

    // ESC 固定给暂停菜单：允许占用会让同一次按键既开菜单又触发玩法动作。
    // 监听态里顺手把它当成取消，否则玩家进了监听就没有退出键了。
    if (newCode === MENU_KEY) {
      this.waitingAction = null;
      this.refreshRows();
      this.statusText.setText(`${formatKeybind(MENU_KEY)} 保留给暂停菜单，已取消本次重绑`);
      return;
    }

    const oldCode = this.binds[action];
    for (const other of ACTIONS) {
      if (other !== action && this.binds[other] === newCode) {
        this.binds[other] = oldCode;
      }
    }
    this.binds[action] = newCode;
    this.waitingAction = null;
    SaveManager.save(SAVE_KEYS.keybinds, this.binds);
    SoundManager.play('uiConfirm');
    this.refreshRows();
  }

  private resetDefaults(): void {
    this.binds = { ...DEFAULT_KEYBINDS };
    this.waitingAction = null;
    SaveManager.save(SAVE_KEYS.keybinds, this.binds);
    SoundManager.play('uiConfirm');
    this.refreshRows();
  }

  private refreshRows(): void {
    for (const action of ACTIONS) {
      const row = this.rows.get(action);
      if (!row) continue;

      const active = this.waitingAction === action;
      row.box.fillColor = active ? 0x2d4252 : 0x1f2a34;
      row.box.setStrokeStyle(3, active ? 0xfbc02d : 0x455a64);
      row.value.setText(active ? '等待输入...' : formatKeybind(this.binds[action]));
      row.value.setColor(active ? '#fff3a2' : '#fbc02d');
    }

    if (this.waitingAction) {
      this.statusText.setText(`正在重绑: ${ACTION_LABELS[this.waitingAction]}`);
    } else {
      this.statusText.setText('点击某个动作开始重绑');
    }
  }

  private handleShutdown(): void {
    this.input.keyboard?.off('keydown', this.handleKeyboardCapture, this);
    this.input.off(Phaser.Input.Events.POINTER_DOWN, this.handlePointerCapture, this);
    this.input.off(Phaser.Input.Events.POINTER_WHEEL, this.handleWheelCapture, this);
  }
}
