import type Phaser from 'phaser';
import { describe, expect, it, vi } from 'vitest';
import type { GameAction } from '../src/config/keybinds';
import { createInitialState } from '../src/systems/GameState';
import type { InputManager } from '../src/systems/InputManager';
import { MedicineManager } from '../src/systems/MedicineManager';

class FakeInput {
  private readonly pressed = new Set<GameAction>();

  press(action: GameAction): void {
    this.pressed.add(action);
  }

  justPressed(action: GameAction): boolean {
    return this.pressed.delete(action);
  }
}

function createManager() {
  const events = { emit: vi.fn() };
  const scene = { events } as unknown as Phaser.Scene;
  const state = createInitialState('endless', null);
  const input = new FakeInput();
  const manager = new MedicineManager({
    scene,
    state,
    input: input as unknown as InputManager,
  });
  return { events, input, manager, state };
}

describe('MedicineManager 药品状态机', () => {
  it('同键取消会回滚预扣库存且不治疗', () => {
    const { input, manager, state } = createManager();
    state.player.health = 40;

    input.press('useBandage');
    manager.update(0);
    expect(state.player.medicines.bandage).toBe(1);
    expect(state.player.medicineUse?.medicineId).toBe('bandage');

    manager.update(500);
    input.press('useBandage');
    manager.update(0);
    expect(state.player.medicineUse).toBeNull();
    expect(state.player.medicines.bandage).toBe(2);
    expect(state.player.health).toBe(40);
  });

  it('绷带和急救按固定点数结算并受最大生命限制', () => {
    const { input, manager, state } = createManager();
    state.player.health = 40;

    input.press('useBandage');
    manager.update(0);
    manager.update(1500);
    expect(state.player.health).toBe(70);

    state.player.health = 50;
    input.press('useMedkit');
    manager.update(0);
    manager.update(3000);
    expect(state.player.health).toBe(state.player.maxHealth);
  });

  it('满血时拒绝即时药品且不扣库存', () => {
    const { events, input, manager, state } = createManager();
    const count = state.player.medicines.bandage;

    input.press('useBandage');
    manager.update(0);

    expect(state.player.medicineUse).toBeNull();
    expect(state.player.medicines.bandage).toBe(count);
    expect(events.emit).toHaveBeenCalledWith('pickupCollected', expect.objectContaining({
      title: '绷带 · 生命已满',
    }));
  });

  it('饮料在 20 秒内累计恢复 60 点并同步提供移速倍率', () => {
    const { input, manager, state } = createManager();
    state.player.health = 20;

    input.press('useEnergyDrink');
    manager.update(0);
    expect(manager.getMoveSpeedMultiplier()).toBe(0.5);

    manager.update(1000);
    expect(state.player.medicineUse).toBeNull();
    expect(state.player.overTimeHeal?.remainingMs).toBe(20000);
    expect(manager.getMoveSpeedMultiplier()).toBe(1.2);

    manager.update(20000);
    expect(state.player.health).toBe(80);
    expect(state.player.overTimeHeal).toBeNull();
    expect(manager.getMoveSpeedMultiplier()).toBe(1);
  });

  it('读条中的预扣药品仍占携带名额，取消后不会突破上限', () => {
    const { input, manager, state } = createManager();
    state.player.health = 40;
    state.player.medicines.bandage = 4;

    input.press('useBandage');
    manager.update(0);
    expect(state.player.medicines.bandage).toBe(3);
    expect(manager.addMedicine('bandage', 1)).toBe(0);

    manager.cancelUse();
    expect(state.player.medicines.bandage).toBe(4);
  });

  it('死亡清理不会归还已经开始使用的药品', () => {
    const { input, manager, state } = createManager();
    state.player.health = 40;

    input.press('useBandage');
    manager.update(0);
    manager.clearOnDeath();

    expect(state.player.medicineUse).toBeNull();
    expect(state.player.overTimeHeal).toBeNull();
    expect(state.player.medicines.bandage).toBe(1);
  });
});

