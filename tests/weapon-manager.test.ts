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

  it('本局已有六把武器时不再加入第七把', () => {
    const { manager, state } = createManager();
    state.player.ownedWeapons.push('smg', 'rifle', 'shotgun', 'ak47', 'barrett');

    expect(manager.pickupWeapon('rpg', true)).toBe(false);
    expect(state.player.ownedWeapons).toEqual(['pistol', 'smg', 'rifle', 'shotgun', 'ak47', 'barrett']);
    expect(state.player.ammoInMag.rpg).toBeUndefined();
  });
});

describe('WeaponManager 强化齐射', () => {
  it('无尽火力过载乘入实际弹丸伤害，过期后恢复基础伤害', () => {
    const fire = vi.fn();
    const bulletPool = { acquire: () => ({ fire }) } as unknown as ObjectPool<Bullet>;
    const { manager, state } = createManager(bulletPool);
    state.player.endlessOverdrive = {
      multiplier: 1.5,
      expiresAt: 1500,
      milestone: 20,
      label: '火力过载 II',
      color: 0xff6f3d,
    };

    manager.update(1000, createPlayer(), false, true);
    expect(fire).toHaveBeenLastCalledWith(expect.objectContaining({
      damage: WEAPONS.pistol.damage * 1.5,
    }));

    manager.update(1600, createPlayer(), false, true);
    expect(fire).toHaveBeenLastCalledWith(expect.objectContaining({
      damage: WEAPONS.pistol.damage,
    }));
  });

  it('章节补给按持有弹种最大弹匣发放，不给无限弹药手枪重复计算 light', () => {
    const { manager, state } = createManager();
    state.player.ownedWeapons.push('smg', 'shotgun');
    state.player.ammoInMag.smg = WEAPONS.smg.magazineSize;
    state.player.ammoInMag.shotgun = WEAPONS.shotgun.magazineSize;
    state.player.ammoReserve.light = 0;
    state.player.ammoReserve.shell = 0;

    expect(manager.resupplyOwnedWeapons(0.75)).toBe(43);
    expect(state.player.ammoReserve.light).toBe(38);
    expect(state.player.ammoReserve.shell).toBe(5);
  });

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

describe('WeaponManager 新重火力武器', () => {  it('喷火器不生成弹丸，改为按帧输出扇形攻击并按击发扣燃料', () => {
    const fire = vi.fn();
    const bulletPool = { acquire: () => ({ fire }) } as unknown as ObjectPool<Bullet>;
    const { manager, state } = createManager(bulletPool);
    state.player.currentWeaponId = 'flamethrower';
    state.player.ownedWeapons.push('flamethrower');
    state.player.ammoInMag.flamethrower = WEAPONS.flamethrower.magazineSize;

    const feedback = manager.update(1000, createPlayer(), true, true);

    expect(fire).not.toHaveBeenCalled();
    expect(state.player.ammoInMag.flamethrower).toBe(WEAPONS.flamethrower.magazineSize - 1);
    expect(feedback).toMatchObject({ coneAttack: true });

    const cone = manager.getActiveCone();
    expect(cone).toMatchObject({
      weaponId: 'flamethrower',
      range: WEAPONS.flamethrower.coneAttack.range,
      angle: WEAPONS.flamethrower.coneAttack.angle,
      tickRate: WEAPONS.flamethrower.coneAttack.tickRate,
    });
    expect(cone?.damagePerSecond).toBeGreaterThan(0);
    expect(cone?.linger).toMatchObject({ kind: 'fire', stackMode: 'refresh-nearby' });
  });

  it('喷火器松扳机的同一帧就收火，扇形不会残留', () => {
    const bulletPool = { acquire: () => ({ fire: vi.fn() }) } as unknown as ObjectPool<Bullet>;
    const { manager, state } = createManager(bulletPool);
    state.player.currentWeaponId = 'flamethrower';
    state.player.ownedWeapons.push('flamethrower');
    state.player.ammoInMag.flamethrower = 20;
    const player = createPlayer();

    manager.update(1000, player, true, true);
    expect(manager.getActiveCone()).not.toBeNull();

    // 射速冷却内继续按住：燃料这一帧不扣，但火焰必须还在。
    manager.update(1020, player, true, false);
    expect(manager.getActiveCone()).not.toBeNull();

    manager.update(1200, player, false, false);
    expect(manager.getActiveCone()).toBeNull();
  });

  it('喷火器打空弹匣后立刻收火，空响不该继续烧人', () => {
    const bulletPool = { acquire: () => ({ fire: vi.fn() }) } as unknown as ObjectPool<Bullet>;
    const { manager, state } = createManager(bulletPool);
    state.player.currentWeaponId = 'flamethrower';
    state.player.ownedWeapons.push('flamethrower');
    state.player.ammoInMag.flamethrower = 1;
    state.player.ammoReserve.fuel = 0;
    const player = createPlayer();

    manager.update(1000, player, true, true);
    expect(state.player.ammoInMag.flamethrower).toBe(0);
    expect(manager.getActiveCone()).toBeNull();
  });

  it('黄金 M249 第十次击发追加一发黄金弹链但只消耗十发弹药', () => {
    const fire = vi.fn();
    const bulletPool = { acquire: () => ({ fire }) } as unknown as ObjectPool<Bullet>;
    const { manager, state } = createManager(bulletPool);
    state.player.currentWeaponId = 'golden_m249';
    state.player.ownedWeapons.push('golden_m249');
    state.player.ammoInMag.golden_m249 = 20;
    const player = createPlayer();
    let feedback: ReturnType<WeaponManager['update']> = null;

    for (let shot = 1; shot <= 10; shot++) {
      feedback = manager.update(shot * 100, player, true, shot === 1);
    }

    expect(fire).toHaveBeenCalledTimes(11);
    expect(state.player.ammoInMag.golden_m249).toBe(10);
    expect(feedback).toMatchObject({ burstCount: 2, ammoChainTriggered: true });
  });
});

describe('WeaponManager 负重机动', () => {
  /** 按固定步长推进架枪进度，模拟连续按住扳机的若干帧。 */
  function holdTrigger(manager: WeaponManager, totalMs: number, stepMs = 16): number {
    let last = 1;
    for (let elapsed = 0; elapsed < totalMs; elapsed += stepMs) {
      last = manager.updateMobility(Math.min(stepMs, totalMs - elapsed), true).multiplier;
    }
    return last;
  }

  it('手枪待机不受负重影响', () => {
    const { manager } = createManager();
    const status = manager.updateMobility(16, false);
    expect(status.multiplier).toBe(1);
    expect(status.load).toBe(0);
  });

  it('手持加特林待机就吃常驻负重', () => {
    const { manager, state } = createManager();
    state.player.currentWeaponId = 'gatling';
    state.player.ownedWeapons.push('gatling');

    expect(manager.updateMobility(16, false).multiplier)
      .toBeCloseTo(WEAPONS.gatling.mobility.carry);
  });

  it('加特林换弹期间落到换弹倍率，且不与常驻负重叠乘', () => {
    const { manager, state } = createManager();
    state.player.currentWeaponId = 'gatling';
    state.player.ownedWeapons.push('gatling');
    state.player.ammoInMag.gatling = 0;
    state.player.ammoReserve.belt = 180;

    manager.reload();
    expect(manager.isReloading).toBe(true);
    expect(manager.updateMobility(16, false).multiplier)
      .toBeCloseTo(WEAPONS.gatling.mobility.reload);
    expect(manager.getMoveSpeedMultiplier()).toBeCloseTo(WEAPONS.gatling.mobility.reload);
  });

  it('加特林按住扳机满预热时长后落到架枪倍率，松扳机后回升', () => {
    const { manager, state } = createManager();
    state.player.currentWeaponId = 'gatling';
    state.player.ownedWeapons.push('gatling');
    state.player.ammoInMag.gatling = 180;

    const braced = holdTrigger(manager, WEAPONS.gatling.spinUp.durationMs);
    expect(braced).toBeCloseTo(WEAPONS.gatling.mobility.sustainedFire, 2);

    // 松扳机后按恢复倍速回落，最终回到只吃常驻负重的水平。
    manager.updateMobility(WEAPONS.gatling.spinUp.durationMs, false);
    expect(manager.getMoveSpeedMultiplier()).toBeCloseTo(WEAPONS.gatling.mobility.carry);
  });

  it('换弹期间架枪进度回落，换完弹不带着上一轮转速惩罚', () => {
    const { manager, state } = createManager();
    state.player.currentWeaponId = 'gatling';
    state.player.ownedWeapons.push('gatling');
    state.player.ammoInMag.gatling = 180;
    state.player.ammoReserve.belt = 180;

    holdTrigger(manager, WEAPONS.gatling.spinUp.durationMs);
    state.player.ammoInMag.gatling = 0;
    manager.reload();

    // 换弹中即使玩家还按着扳机，架枪进度也必须回落，否则换弹结束瞬间移速仍被转速压着。
    manager.updateMobility(WEAPONS.gatling.spinUp.durationMs, true);
    expect(manager.updateMobility(16, true).braceRatio).toBe(0);
  });

  it('切枪把架枪进度归零，负重不跟着旧武器传染', () => {
    const { manager, state } = createManager();
    state.player.currentWeaponId = 'gatling';
    state.player.ownedWeapons.push('gatling');
    state.player.ammoInMag.gatling = 180;

    holdTrigger(manager, WEAPONS.gatling.spinUp.durationMs);
    manager.switchTo('pistol');

    const status = manager.updateMobility(16, false);
    expect(status.braceRatio).toBe(0);
    expect(status.multiplier).toBe(1);
  });

  it('步枪持续开火不掉速，架枪只属于机枪与重狙', () => {
    const { manager, state } = createManager();
    state.player.currentWeaponId = 'rifle';
    state.player.ownedWeapons.push('rifle');
    state.player.ammoInMag.rifle = 30;

    expect(holdTrigger(manager, 2000)).toBeCloseTo(WEAPONS.rifle.mobility.carry);
  });

  it('空弹匣按住扳机只是空响，不付架枪的机动代价', () => {
    const { manager, state } = createManager();
    state.player.currentWeaponId = 'gatling';
    state.player.ownedWeapons.push('gatling');
    // 弹链打空且没有备用弹：此时既不会自动换弹，也没有实际击发。
    state.player.ammoInMag.gatling = 0;
    state.player.ammoReserve.belt = 0;

    expect(holdTrigger(manager, WEAPONS.gatling.spinUp.durationMs))
      .toBeCloseTo(WEAPONS.gatling.mobility.carry);
    expect(manager.updateMobility(16, true).braceRatio).toBe(0);
  });
});
