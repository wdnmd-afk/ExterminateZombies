import type Phaser from 'phaser';
import { describe, expect, it, vi } from 'vitest';
import type { Bullet } from '../src/entities/Bullet';
import type { Player } from '../src/entities/Player';
import { WEAPONS } from '../src/config/weapons';
import { createInitialState } from '../src/systems/GameState';
import { WeaponManager } from '../src/systems/WeaponManager';
import type { ObjectPool } from '../src/utils/ObjectPool';

// WeaponManager 只依赖 Phaser 的数学工具和 Scene 类型；Node 测试不能加载完整浏览器设备探测。
vi.mock('phaser', () => ({
  default: {
    Math: {
      Clamp: (value: number, min: number, max: number) => Math.min(max, Math.max(min, value)),
    },
    Sound: { Events: { UNLOCKED: 'unlocked' } },
  },
}));

interface FakeTimer {
  callback: () => void;
  removed: boolean;
}

function createManager(bulletPool = {} as ObjectPool<Bullet>) {
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
  const manager = new WeaponManager(scene, state, bulletPool);
  return { manager, state, timer };
}

function createPlayer(): Player {
  return {
    isMoving: () => false,
    getMuzzle: () => ({ x: 100, y: 100, angle: 0 }),
  } as unknown as Player;
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
    expect(state.player.ammoInMag.pistol).toBe(WEAPONS.pistol.magazineSize);
    expect(state.player.ammoReserve.light).toBe(0);
    expect(manager.isReloading).toBe(false);
  });
});

describe('WeaponManager 逐发填装', () => {
  it('每次回调只装 1 发并只扣 1 发备用弹，装满后收尾', () => {
    const { manager, state, timer } = createManager();
    state.player.currentWeaponId = 'shotgun';
    state.player.ownedWeapons.push('shotgun');
    state.player.ammoInMag.shotgun = 0;
    state.player.ammoReserve.shell = 10;

    manager.reload();
    for (let shell = 1; shell <= WEAPONS.shotgun.magazineSize; shell++) {
      timer.callback();
      expect(state.player.ammoInMag.shotgun).toBe(shell);
      expect(state.player.ammoReserve.shell).toBe(10 - shell);
    }

    // 装满后的这一次回调只负责收尾，不再多装也不再多扣。
    timer.callback();
    expect(state.player.ammoInMag.shotgun).toBe(WEAPONS.shotgun.magazineSize);
    expect(state.player.ammoReserve.shell).toBe(10 - WEAPONS.shotgun.magazineSize);
    expect(manager.isReloading).toBe(false);
  });

  it('收尾后残留的旧回调被 token 作废，不会再补装一发', () => {
    const { manager, state, timer } = createManager();
    state.player.currentWeaponId = 'shotgun';
    state.player.ownedWeapons.push('shotgun');
    state.player.ammoInMag.shotgun = WEAPONS.shotgun.magazineSize - 1;
    state.player.ammoReserve.shell = 10;

    manager.reload();
    timer.callback();
    expect(state.player.ammoInMag.shotgun).toBe(WEAPONS.shotgun.magazineSize);
    expect(manager.isReloading).toBe(false);

    // 逐发填装每发都会重新排一次回调；收尾时若不作废 token，这次重放会溢出弹匣。
    timer.callback();
    expect(state.player.ammoInMag.shotgun).toBe(WEAPONS.shotgun.magazineSize);
    expect(state.player.ammoReserve.shell).toBe(9);
  });

  it('备用弹不足时装到耗尽即停止', () => {
    const { manager, state, timer } = createManager();
    state.player.currentWeaponId = 'shotgun';
    state.player.ownedWeapons.push('shotgun');
    state.player.ammoInMag.shotgun = 0;
    state.player.ammoReserve.shell = 2;

    manager.reload();
    timer.callback();
    timer.callback();
    expect(state.player.ammoInMag.shotgun).toBe(2);
    expect(state.player.ammoReserve.shell).toBe(0);

    timer.callback();
    expect(state.player.ammoInMag.shotgun).toBe(2);
    expect(state.player.ammoReserve.shell).toBe(0);
    expect(manager.isReloading).toBe(false);
  });

  it('切枪取消逐发填装后，残留回调不能继续装弹', () => {
    const { manager, state, timer } = createManager();
    state.player.currentWeaponId = 'shotgun';
    state.player.ownedWeapons.push('shotgun');
    state.player.ammoInMag.shotgun = 0;
    state.player.ammoReserve.shell = 6;

    manager.reload();
    timer.callback();
    expect(state.player.ammoInMag.shotgun).toBe(1);

    manager.switchTo('pistol');
    expect(timer.removed).toBe(true);
    timer.callback();
    // 已装的 1 发保留，被取消的回调不能再补第 2 发。
    expect(state.player.ammoInMag.shotgun).toBe(1);
    expect(state.player.ammoReserve.shell).toBe(5);
  });
});

describe('WeaponManager 军械可用性', () => {
  it('首次获得有限武器时同时得到满弹匣和一个备用弹匣', () => {
    const { manager, state } = createManager();
    expect(manager.pickupWeapon('shotgun', false)).toBe(true);
    expect(state.player.ammoInMag.shotgun).toBe(WEAPONS.shotgun.magazineSize);
    expect(state.player.ammoReserve.shell).toBe(WEAPONS.shotgun.magazineSize);
  });

  it('滚轮跳过弹匣和备用弹均为空的武器', () => {
    const { manager, state } = createManager();
    state.player.ownedWeapons.push('smg', 'shotgun');
    state.player.ammoInMag.smg = 0;
    state.player.ammoInMag.shotgun = 1;
    state.player.ammoReserve.light = 0;
    state.player.ammoReserve.shell = 0;

    manager.cycle(1);
    expect(state.player.currentWeaponId).toBe('shotgun');
  });

  it('数字键选择空弹武器时拒绝切换并发出警报', () => {
    const { manager, state } = createManager();
    state.player.ownedWeapons.push('smg');
    state.player.ammoInMag.smg = 0;
    state.player.ammoReserve.light = 0;

    manager.switchByIndex(1);
    expect(state.player.currentWeaponId).toBe('pistol');
  });

  it('本局已有五把武器时不再加入第六把', () => {
    const { manager, state } = createManager();
    state.player.ownedWeapons.push('smg', 'rifle', 'shotgun', 'ak47');

    expect(manager.pickupWeapon('barrett', true)).toBe(false);
    expect(state.player.ownedWeapons).toEqual(['pistol', 'smg', 'rifle', 'shotgun', 'ak47']);
    expect(state.player.ammoInMag.barrett).toBeUndefined();
  });
});

describe('WeaponManager 强化齐射', () => {
  it('四管齐射创建 16 颗弹丸但只消耗 1 发弹匣', () => {
    const fire = vi.fn();
    const bulletPool = { acquire: () => ({ fire }) } as unknown as ObjectPool<Bullet>;
    const { manager, state } = createManager(bulletPool);
    state.player.currentWeaponId = 'shotgun';
    state.player.ownedWeapons.push('shotgun');
    state.player.ammoInMag.shotgun = 6;
    state.player.activeEnhancements.add('shotgun_double_pellets');

    const feedback = manager.update(1000, createPlayer(), false, true);

    expect(fire).toHaveBeenCalledTimes(16);
    expect(state.player.ammoInMag.shotgun).toBe(5);
    expect(feedback).toMatchObject({ burstCount: 4, pellets: 16 });
  });

  it('MP5 第 5 发触发额外两组弹链，五次击发仍只消耗 5 发', () => {
    const fire = vi.fn();
    const bulletPool = { acquire: () => ({ fire }) } as unknown as ObjectPool<Bullet>;
    const { manager, state } = createManager(bulletPool);
    state.player.currentWeaponId = 'smg';
    state.player.ownedWeapons.push('smg');
    state.player.ammoInMag.smg = 20;
    state.player.activeEnhancements.add('smg_penetration');
    const player = createPlayer();
    let feedback: ReturnType<WeaponManager['update']> = null;

    for (let shot = 1; shot <= 5; shot++) {
      feedback = manager.update(shot * 100, player, true, shot === 1);
    }

    expect(fire).toHaveBeenCalledTimes(7);
    expect(state.player.ammoInMag.smg).toBe(15);
    expect(feedback).toMatchObject({ burstCount: 3, pellets: 3, ammoChainTriggered: true });
  });

  it('AK 双流压制生成两颗弹丸但只消耗 1 发弹匣', () => {
    const fire = vi.fn();
    const bulletPool = { acquire: () => ({ fire }) } as unknown as ObjectPool<Bullet>;
    const { manager, state } = createManager(bulletPool);
    state.player.currentWeaponId = 'ak47';
    state.player.ownedWeapons.push('ak47');
    state.player.ammoInMag.ak47 = 10;
    state.player.activeEnhancements.add('ak47_muzzle_brake');

    const feedback = manager.update(1000, createPlayer(), true, true);

    expect(fire).toHaveBeenCalledTimes(2);
    expect(state.player.ammoInMag.ak47).toBe(9);
    expect(feedback).toMatchObject({ burstCount: 2, pellets: 2 });
  });
});
