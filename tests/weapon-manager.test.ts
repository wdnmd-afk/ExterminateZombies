import type Phaser from 'phaser';
import { describe, expect, it, vi } from 'vitest';
import type { Bullet } from '../src/entities/Bullet';
import { createInitialState } from '../src/systems/GameState';
import { WeaponManager } from '../src/systems/WeaponManager';
import type { ObjectPool } from '../src/utils/ObjectPool';

interface FakeTimer {
  callback: () => void;
  removed: boolean;
}

function createManager() {
  const timer: FakeTimer = { callback: () => undefined, removed: false };
  const scene = {
    time: {
      now: 100,
      delayedCall: (_delay: number, callback: () => void) => {
        timer.callback = callback;
        return { remove: () => { timer.removed = true; } };
      },
    },
    events: { emit: vi.fn() },
  } as unknown as Phaser.Scene;
  const state = createInitialState('level', 'level_1');
  const manager = new WeaponManager(scene, state, {} as ObjectPool<Bullet>);
  return { manager, state, timer };
}

describe('WeaponManager 换弹生命周期', () => {
  it('切枪会取消旧换弹回调，旧回调不能生成或扣除弹药', () => {
    const { manager, state, timer } = createManager();
    state.player.currentWeaponId = 'smg';
    state.player.ammoInMag.smg = 10;
    state.player.ammoReserve.light = 5;

    manager.reload();
    manager.switchTo('pistol');
    expect(timer.removed).toBe(true);

    timer.callback();
    expect(state.player.ammoInMag.smg).toBe(10);
    expect(state.player.ammoReserve.light).toBe(5);
  });

  it('无限备用弹武器完成换弹但不消耗备用弹', () => {
    const { manager, state, timer } = createManager();
    state.player.ammoInMag.pistol = 0;
    state.player.ammoReserve.light = 0;

    manager.reload();
    timer.callback();
    expect(state.player.ammoInMag.pistol).toBe(12);
    expect(state.player.ammoReserve.light).toBe(0);
    expect(manager.isReloading).toBe(false);
  });
});
