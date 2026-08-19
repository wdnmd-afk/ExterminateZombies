import type Phaser from 'phaser';
import {
  MEDICINES,
  type MedicineId,
} from '../config/medicine';
import type { GameAction } from '../config/keybinds';
import { EVENTS } from '../constants';
import type { GameState } from './GameState';
import type { InputManager } from './InputManager';

interface MedicineManagerOptions {
  scene: Phaser.Scene;
  state: GameState;
  input: InputManager;
}

const MEDICINE_ACTIONS = [
  { medicineId: 'bandage', action: 'useBandage' },
  { medicineId: 'medkit', action: 'useMedkit' },
  { medicineId: 'energy_drink', action: 'useEnergyDrink' },
] as const satisfies ReadonlyArray<{ medicineId: MedicineId; action: GameAction }>;

/** 管理药品库存、使用读条、主动取消与能量饮料持续效果。 */
export class MedicineManager {
  private readonly scene: Phaser.Scene;
  private readonly state: GameState;
  private readonly input: InputManager;

  constructor(options: MedicineManagerOptions) {
    this.scene = options.scene;
    this.state = options.state;
    this.input = options.input;
  }

  update(delta: number): void {
    this.handleInput();
    const safeDelta = Number.isFinite(delta) ? Math.max(0, delta) : 0;
    // 先推进已有 HoT，再推进读条，避免饮料完成的同一帧重复吃到整帧治疗时间。
    this.advanceOverTimeHeal(safeDelta);
    this.advanceUse(safeDelta);
  }

  addMedicine(medicineId: MedicineId, amount: number): number {
    const def = MEDICINES[medicineId];
    const requested = Math.floor(amount);
    if (requested <= 0) return 0;

    const current = this.state.player.medicines[medicineId] ?? 0;
    // 读条中的药已经从库存扣除，但仍占携带名额；否则读条时拾满再取消会突破上限。
    const reserved = this.state.player.medicineUse?.medicineId === medicineId ? 1 : 0;
    const inventoryLimit = Math.max(0, def.carryMax - reserved);
    const next = Math.min(inventoryLimit, current + requested);
    const added = next - current;
    if (added <= 0) return 0;

    this.state.player.medicines[medicineId] = next;
    this.emitChanged();
    return added;
  }

  getMoveSpeedMultiplier(): number {
    const channelingMultiplier = this.isChanneling() ? 0.5 : 1;
    const overTimeMultiplier = this.state.player.overTimeHeal?.moveSpeedMultiplier ?? 1;
    return channelingMultiplier * overTimeMultiplier;
  }

  isChanneling(): boolean {
    return this.state.player.medicineUse !== null;
  }

  /** 主动取消必须归还开始读条时预扣的库存。 */
  cancelUse(): void {
    const activeUse = this.state.player.medicineUse;
    if (!activeUse) return;

    this.state.player.medicineUse = null;
    this.state.player.medicines[activeUse.medicineId] += 1;
    this.emitChanged();
  }

  /** 死亡或战局结束会消耗已经开始使用的药品，不执行取消回滚。 */
  clearOnDeath(): void {
    if (!this.state.player.medicineUse && !this.state.player.overTimeHeal) return;
    this.state.player.medicineUse = null;
    this.state.player.overTimeHeal = null;
    this.emitChanged();
  }

  private handleInput(): void {
    const activeUse = this.state.player.medicineUse;
    if (activeUse) {
      const activeAction = MEDICINE_ACTIONS.find(
        (entry) => entry.medicineId === activeUse.medicineId,
      )?.action;
      if (activeAction && this.input.justPressed(activeAction)) this.cancelUse();
      return;
    }

    const requested = MEDICINE_ACTIONS.find((entry) => this.input.justPressed(entry.action));
    if (requested) this.startUse(requested.medicineId);
  }

  private startUse(medicineId: MedicineId): void {
    const def = MEDICINES[medicineId];
    const count = this.state.player.medicines[medicineId] ?? 0;
    if (count <= 0) return;

    if (def.instantHeal > 0 && this.state.player.health >= this.state.player.maxHealth) {
      this.scene.events.emit(EVENTS.pickupCollected, {
        title: `${def.name} · 生命已满`,
        accent: def.color,
      });
      return;
    }

    // 开始时预扣，防止连点让同一件药品进入多次结算；主动取消由 cancelUse 统一回滚。
    this.state.player.medicines[medicineId] = count - 1;
    this.state.player.medicineUse = {
      medicineId,
      elapsedMs: 0,
      durationMs: def.useDurationMs,
    };
    this.emitChanged();
  }

  private advanceUse(delta: number): void {
    const activeUse = this.state.player.medicineUse;
    if (!activeUse) return;

    activeUse.elapsedMs = Math.min(activeUse.durationMs, activeUse.elapsedMs + delta);
    if (activeUse.elapsedMs < activeUse.durationMs) return;
    this.completeUse(activeUse.medicineId);
  }

  private completeUse(medicineId: MedicineId): void {
    const def = MEDICINES[medicineId];
    this.state.player.medicineUse = null;

    if (def.instantHeal > 0) {
      const previousHealth = this.state.player.health;
      this.state.player.health = Math.min(
        this.state.player.maxHealth,
        previousHealth + def.instantHeal,
      );
      if (this.state.player.health !== previousHealth) {
        this.scene.events.emit(EVENTS.healthChanged);
      }
    }

    if (def.overTimeHeal > 0 && def.overTimeDurationMs > 0) {
      // 再次饮用直接替换剩余持续量；旧效果未结算的治疗不会叠加到新效果。
      this.state.player.overTimeHeal = {
        remainingMs: def.overTimeDurationMs,
        healPerMs: def.overTimeHeal / def.overTimeDurationMs,
        healCarry: 0,
        moveSpeedMultiplier: def.overTimeMoveSpeedMultiplier,
      };
    }
    this.emitChanged();
  }

  private advanceOverTimeHeal(delta: number): void {
    const effect = this.state.player.overTimeHeal;
    if (!effect) return;

    const elapsed = Math.min(delta, effect.remainingMs);
    effect.remainingMs = Math.max(0, effect.remainingMs - elapsed);
    effect.healCarry += effect.healPerMs * elapsed;

    // 小数只留在 carry 中，生命状态始终保持整数；极小 epsilon 抵消 60 点累计时的浮点尾差。
    const wholeHeal = Math.floor(effect.healCarry + 1e-9);
    if (wholeHeal > 0) {
      effect.healCarry -= wholeHeal;
      const previousHealth = this.state.player.health;
      this.state.player.health = Math.min(
        this.state.player.maxHealth,
        previousHealth + wholeHeal,
      );
      if (this.state.player.health !== previousHealth) {
        this.scene.events.emit(EVENTS.healthChanged);
      }
    }

    if (effect.remainingMs > 0) return;
    this.state.player.overTimeHeal = null;
    this.emitChanged();
  }

  private emitChanged(): void {
    this.scene.events.emit(EVENTS.medicineChanged);
  }
}

