import type Phaser from 'phaser';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Zombie } from '../src/entities/Zombie';
import type { ActiveConeAttack } from '../src/systems/WeaponManager';
import { FLAME_CONE_LINGER_INTERVAL, FlameConeSystem } from '../src/systems/FlameConeSystem';
import { WEAPONS } from '../src/config/weapons';

// FlameConeSystem 只用到 Graphics 与混合模式常量；Node 测试不能加载完整浏览器设备探测。
vi.mock('phaser', () => ({
  default: {
    BlendModes: { ADD: 1 },
  },
}));

function createGraphicsStub() {
  const g = {
    visible: false,
    destroyed: false,
    setDepth: vi.fn(() => g),
    setBlendMode: vi.fn(() => g),
    setVisible: vi.fn((value: boolean) => { g.visible = value; return g; }),
    clear: vi.fn(() => g),
    fillStyle: vi.fn(() => g),
    beginPath: vi.fn(() => g),
    moveTo: vi.fn(() => g),
    lineTo: vi.fn(() => g),
    closePath: vi.fn(() => g),
    fillPath: vi.fn(() => g),
    fillCircle: vi.fn(() => g),
    destroy: vi.fn(() => { g.destroyed = true; }),
  };
  return g;
}

/** 只带位置和体型的假感染体，够 isTargetInsideCone 与伤害回调用。 */
function createZombie(x: number, y: number, radius = 14): Zombie {
  return { active: true, x, y, def: { radius } } as unknown as Zombie;
}

const CONE: ActiveConeAttack = {
  weaponId: 'flamethrower',
  range: 210,
  angle: 58,
  damagePerSecond: 100,
  tickRate: 120,
  color: 0xff642e,
  linger: null,
};

function createSystem(zombies: Zombie[], tiles: Array<{ x: number; y: number; width: number; height: number }> = []) {
  const graphics = createGraphicsStub();
  const scene = { add: { graphics: () => graphics } } as unknown as Phaser.Scene;
  const damageZombie = vi.fn();
  const spawnLinger = vi.fn();
  const system = new FlameConeSystem({
    scene,
    getZombies: () => zombies,
    getObstacleTiles: () => tiles,
    damageZombie,
    spawnLinger,
  });
  return { system, graphics, damageZombie, spawnLinger };
}

const MUZZLE = { x: 0, y: 0, angle: 0 };

describe('FlameConeSystem', () => {
  let inCone: Zombie;
  let behind: Zombie;

  beforeEach(() => {
    inCone = createZombie(120, 0);
    behind = createZombie(-120, 0);
  });

  it('开火首帧只画火焰，不立刻补一跳伤害', () => {
    const { system, graphics, damageZombie } = createSystem([inCone]);
    system.update(1000, CONE, MUZZLE);
    expect(graphics.setVisible).toHaveBeenCalledWith(true);
    expect(damageZombie).not.toHaveBeenCalled();
  });

  it('扇形内的目标按每秒伤害持续掉血', () => {
    const { system, damageZombie } = createSystem([inCone]);
    system.update(1000, CONE, MUZZLE);
    system.update(1120, CONE, MUZZLE);
    expect(damageZombie).toHaveBeenCalledTimes(1);
    // 120ms 一跳、每秒 100 点 => 每跳 12 点。
    expect(damageZombie).toHaveBeenCalledWith(inCone, 12);
  });

  it('连续喷一整秒正好扣满一份每秒伤害', () => {
    const cone = { ...CONE, tickRate: 100 };
    const { system, damageZombie } = createSystem([inCone]);
    system.update(1000, cone, MUZZLE);
    for (let t = 1100; t <= 2000; t += 100) {
      system.update(t, cone, MUZZLE);
    }
    const total = damageZombie.mock.calls.reduce((sum, call) => sum + (call[1] as number), 0);
    expect(damageZombie).toHaveBeenCalledTimes(10);
    expect(total).toBeCloseTo(cone.damagePerSecond, 5);
  });

  it('结算间隔未到的帧不重复扣血', () => {
    const { system, damageZombie } = createSystem([inCone]);
    system.update(1000, CONE, MUZZLE);
    system.update(1050, CONE, MUZZLE);
    system.update(1100, CONE, MUZZLE);
    expect(damageZombie).not.toHaveBeenCalled();
  });

  it('扇形之外和背后的目标不掉血', () => {
    const { system, damageZombie } = createSystem([behind, createZombie(400, 0)]);
    system.update(1000, CONE, MUZZLE);
    system.update(1200, CONE, MUZZLE);
    expect(damageZombie).not.toHaveBeenCalled();
  });

  it('掩体后的目标不掉血', () => {
    const { system, damageZombie } = createSystem([inCone], [{ x: 60, y: 0, width: 20, height: 200 }]);
    system.update(1000, CONE, MUZZLE);
    system.update(1200, CONE, MUZZLE);
    expect(damageZombie).not.toHaveBeenCalled();
  });

  it('松扳机立即收火，且不会继续扣血', () => {
    const { system, graphics, damageZombie } = createSystem([inCone]);
    system.update(1000, CONE, MUZZLE);
    system.update(1200, null, MUZZLE);
    expect(graphics.setVisible).toHaveBeenLastCalledWith(false);
    const callsAfterStop = damageZombie.mock.calls.length;
    system.update(1400, null, MUZZLE);
    expect(damageZombie.mock.calls.length).toBe(callsAfterStop);
  });

  it('松手一段时间后重新开火不会补上这段空窗的伤害', () => {
    const { system, damageZombie } = createSystem([inCone]);
    system.update(1000, CONE, MUZZLE);
    system.update(1200, null, MUZZLE);
    damageZombie.mockClear();

    system.update(9000, CONE, MUZZLE);
    expect(damageZombie).not.toHaveBeenCalled();
    system.update(9120, CONE, MUZZLE);
    expect(damageZombie).toHaveBeenCalledWith(inCone, 12);
  });

  it('战场解除冻结后按平移量续算，不会立刻补一跳', () => {
    const { system, damageZombie } = createSystem([inCone]);
    system.update(1000, CONE, MUZZLE);
    // 冻结 5 秒：时间戳整体后移，随后的第一帧不该结算。
    system.shiftTimers(5000);
    system.update(6000, CONE, MUZZLE);
    expect(damageZombie).not.toHaveBeenCalled();
    system.update(6120, CONE, MUZZLE);
    expect(damageZombie).toHaveBeenCalledTimes(1);
  });

  it('配了残留地火时会在扇形内落下燃烧区', () => {
    const linger = WEAPONS.flamethrower.impactLinger;
    const { system, spawnLinger } = createSystem([]);
    system.update(1000, { ...CONE, linger }, MUZZLE);
    expect(spawnLinger).toHaveBeenCalledTimes(1);
    const [x, y, def] = spawnLinger.mock.calls[0];
    expect(def).toBe(linger);
    // 地火必须落在扇形内：射程之内、枪口前方。
    expect(Math.hypot(x as number, y as number)).toBeLessThanOrEqual(CONE.range);
    expect(x as number).toBeGreaterThan(0);

    // 地火节奏比伤害跳慢得多，间隔没到的帧不会再糊一层。
    system.update(1100, { ...CONE, linger }, MUZZLE);
    expect(spawnLinger).toHaveBeenCalledTimes(1);
    system.update(1000 + FLAME_CONE_LINGER_INTERVAL, { ...CONE, linger }, MUZZLE);
    expect(spawnLinger).toHaveBeenCalledTimes(2);
  });

  it('没配残留地火时不会落下燃烧区', () => {
    const { system, spawnLinger } = createSystem([]);
    system.update(1000, CONE, MUZZLE);
    system.update(1600, CONE, MUZZLE);
    expect(spawnLinger).not.toHaveBeenCalled();
  });

  it('销毁会带走 Graphics，避免切场景后留下一片火', () => {
    const { system, graphics } = createSystem([inCone]);
    system.update(1000, CONE, MUZZLE);
    system.destroy();
    expect(graphics.destroyed).toBe(true);
  });
});
