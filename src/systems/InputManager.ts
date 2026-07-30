import Phaser from 'phaser';
import { SaveManager, SAVE_KEYS } from './SaveManager';
import { DEFAULT_KEYBINDS, type GameAction, type Keybinds } from '../config/keybinds';

/**
 * 输入层。业务代码只查语义化动作(isDown('moveUp')),从不直接读物理按键。
 * 键位从 SaveManager 读取(缺省用 DEFAULT_KEYBINDS),支持运行时重绑定。
 *
 * 按键代号约定见 keybinds.ts:
 *   键盘单字母/数字 -> Phaser.Input.Keyboard.KeyCodes 里的名字
 *   'MOUSE_LEFT'/'MOUSE_RIGHT' -> 鼠标键
 *   'WHEEL_UP'/'WHEEL_DOWN'   -> 滚轮,只作为"本帧触发一次"的脉冲
 */
export class InputManager {
  private static keyCodeNameByValue: Record<number, string> | null = null;

  private scene: Phaser.Scene;
  private binds: Keybinds;

  /** 键盘动作 -> Phaser Key 对象。 */
  private keys = new Map<GameAction, Phaser.Input.Keyboard.Key>();
  /** 鼠标按键当前是否按下:0=左键,2=右键。 */
  private mouseDown = new Set<number>();
  /** 本帧触发一次的脉冲动作(滚轮/鼠标点击的边沿),在 postUpdate 清空。 */
  private pulses = new Set<GameAction>();

  private pointerWorld = new Phaser.Math.Vector2();

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.binds = SaveManager.load<Keybinds>(SAVE_KEYS.keybinds, { ...DEFAULT_KEYBINDS });
    this.repairUnsupportedBindings();
    this.registerAll();

    // 帧末清空脉冲。用 events 而非 input 事件,保证在所有 update 之后执行。
    scene.events.on(Phaser.Scenes.Events.POST_UPDATE, this.clearPulses, this);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, this.destroy, this);
  }

  // ——— 注册 ———

  private registerAll(): void {
    const kb = this.scene.input.keyboard;
    if (kb) {
      for (const action of Object.keys(this.binds) as GameAction[]) {
        const code = this.binds[action];
        const keyCode = this.toKeyboardCode(code);
        if (keyCode !== null) {
          this.keys.set(action, kb.addKey(keyCode, false));
        }
      }
    }

    this.scene.input.on(Phaser.Input.Events.POINTER_DOWN, this.onPointerDown, this);
    this.scene.input.on(Phaser.Input.Events.POINTER_UP, this.onPointerUp, this);
    this.scene.input.on(Phaser.Input.Events.POINTER_MOVE, this.onPointerMove, this);
    this.scene.input.on(Phaser.Input.Events.POINTER_WHEEL, this.onWheel, this);
  }

  /** 存档层负责结构校验，这里再用 Phaser 的真实 KeyCodes 修复语义无效代号。 */
  private repairUnsupportedBindings(): void {
    let repaired = false;
    for (const action of Object.keys(DEFAULT_KEYBINDS) as GameAction[]) {
      const code = this.binds[action];
      const supported = code.startsWith('MOUSE_') || code.startsWith('WHEEL_')
        || this.toKeyboardCode(code) !== null;
      if (!supported) {
        this.binds[action] = DEFAULT_KEYBINDS[action];
        repaired = true;
      }
    }
    if (repaired) SaveManager.save(SAVE_KEYS.keybinds, this.binds);
  }

  /** 把代号转成 Phaser 键盘 KeyCode 数值;非键盘代号返回 null。 */
  private toKeyboardCode(code: string): number | null {
    if (code.startsWith('MOUSE_') || code.startsWith('WHEEL_')) return null;
    const codes = Phaser.Input.Keyboard.KeyCodes as unknown as Record<string, number>;
    return codes[code] ?? null;
  }

  /** 将浏览器/Phaser 键值反查为统一绑定代号,设置界面录入时复用。 */
  static fromKeyCodeValue(keyCode: number): string | null {
    if (!this.keyCodeNameByValue) {
      const codes = Phaser.Input.Keyboard.KeyCodes as unknown as Record<string, number>;
      const reversed: Record<number, string> = {};
      for (const [name, value] of Object.entries(codes)) {
        if (typeof value === 'number' && reversed[value] === undefined) {
          reversed[value] = name;
        }
      }
      this.keyCodeNameByValue = reversed;
    }

    return this.keyCodeNameByValue[keyCode] ?? null;
  }

  // ——— 鼠标/滚轮回调 ———

  private onPointerDown(p: Phaser.Input.Pointer): void {
    this.mouseDown.add(p.button);
    // 边沿:为绑定到该鼠标键的动作打一个脉冲
    const code = p.button === 2 ? 'MOUSE_RIGHT' : 'MOUSE_LEFT';
    this.pulseForCode(code);
  }

  private onPointerUp(p: Phaser.Input.Pointer): void {
    this.mouseDown.delete(p.button);
  }

  private onPointerMove(p: Phaser.Input.Pointer): void {
    this.updatePointerWorld(p);
  }

  private onWheel(_p: Phaser.Input.Pointer, _dx: number, dy: number): void {
    this.pulseForCode(dy < 0 ? 'WHEEL_UP' : 'WHEEL_DOWN');
  }

  /** 给所有绑定到该代号的动作打脉冲。 */
  private pulseForCode(code: string): void {
    for (const action of Object.keys(this.binds) as GameAction[]) {
      if (this.binds[action] === code) this.pulses.add(action);
    }
  }

  private clearPulses(): void {
    this.pulses.clear();
  }

  // ——— 对外查询 ———

  /** 动作是否处于按下状态(持续)。 */
  isDown(action: GameAction): boolean {
    const code = this.binds[action];
    if (code === 'MOUSE_LEFT') return this.mouseDown.has(0);
    if (code === 'MOUSE_RIGHT') return this.mouseDown.has(2);
    const key = this.keys.get(action);
    return key ? key.isDown : false;
  }

  /** 动作本帧是否刚触发(边沿:键盘 justDown / 鼠标点击 / 滚轮脉冲)。 */
  justPressed(action: GameAction): boolean {
    if (this.pulses.has(action)) return true;
    const key = this.keys.get(action);
    return key ? Phaser.Input.Keyboard.JustDown(key) : false;
  }

  /** 指针世界坐标(瞄准用)。 */
  getPointerWorld(): Phaser.Math.Vector2 {
    const p = this.scene.input.activePointer;
    this.updatePointerWorld(p);
    return this.pointerWorld;
  }

  /**
   * 显式使用 GameScene 的主摄像机换算坐标。
   * HUD 与高清缩放摄像机并行时，Pointer.worldX/worldY 可能属于最后处理输入的其它场景。
   */
  private updatePointerWorld(pointer: Phaser.Input.Pointer): void {
    pointer.positionToCamera(this.scene.cameras.main, this.pointerWorld);
  }

  // ——— 重绑定(设置界面用) ———

  rebind(action: GameAction, newCode: string): void {
    const oldCode = this.binds[action];
    for (const other of Object.keys(this.binds) as GameAction[]) {
      if (other !== action && this.binds[other] === newCode) {
        this.binds[other] = oldCode;
      }
    }
    this.binds[action] = newCode;
    SaveManager.save(SAVE_KEYS.keybinds, this.binds);
    // 简单起见:清空后全量重注册键盘键。
    this.scene.input.keyboard?.removeAllKeys(true);
    this.keys.clear();
    const kb = this.scene.input.keyboard;
    if (kb) {
      for (const a of Object.keys(this.binds) as GameAction[]) {
        const keyCode = this.toKeyboardCode(this.binds[a]);
        if (keyCode !== null) this.keys.set(a, kb.addKey(keyCode, false));
      }
    }
  }

  getBinds(): Readonly<Keybinds> {
    return this.binds;
  }

  destroy(): void {
    this.scene.input.off(Phaser.Input.Events.POINTER_DOWN, this.onPointerDown, this);
    this.scene.input.off(Phaser.Input.Events.POINTER_UP, this.onPointerUp, this);
    this.scene.input.off(Phaser.Input.Events.POINTER_MOVE, this.onPointerMove, this);
    this.scene.input.off(Phaser.Input.Events.POINTER_WHEEL, this.onWheel, this);
    this.scene.events.off(Phaser.Scenes.Events.POST_UPDATE, this.clearPulses, this);
  }
}
