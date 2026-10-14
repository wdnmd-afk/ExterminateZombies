import type Phaser from 'phaser';
import { describe, expect, it, vi } from 'vitest';
import { FRENZY_ENEMY_CAP, FRENZY_TARGETS } from '../src/config/frenzy';
import { ZOMBIES, type ZombieId } from '../src/config/zombies';
import type { Zombie } from '../src/entities/Zombie';
import { FrenzyDirector } from '../src/systems/FrenzyDirector';
import { advanceFrenzy, createFrenzyRun } from '../src/systems/FrenzyRules';

vi.mock('phaser', () => ({ default: { Math: { Clamp: (value: number, min: number, max: number) => Math.max(min, Math.min(max, value)) } } }));

function setup() {
  const visuals: Array<{ destroy: ReturnType<typeof vi.fn> }> = [];
  const createVisual = () => {
    const visual = {
      text: '', destroy: vi.fn(),
      setStrokeStyle: () => visual, setDepth: () => visual, setOrigin: () => visual,
      setPosition: () => visual, setVisible: () => visual, setRadius: () => visual,
      setFillStyle: () => visual, setText: (text: string) => { visual.text = text; return visual; },
    };
    visuals.push(visual);
    return visual;
  };
  const scene = { add: { circle: createVisual, text: createVisual } } as unknown as Phaser.Scene;
  const enemies: Zombie[] = [];
  const spawn = vi.fn((id: ZombieId, position: { x: number; y: number }) => {
    const zombie = { ...position, health: ZOMBIES[id].health, def: ZOMBIES[id], active: true } as Zombie;
    enemies.push(zombie);
    return zombie;
  });
  const run = createFrenzyRun('shotgun');
  const grantReward = vi.fn();
  const announce = vi.fn();
  const director = new FrenzyDirector({ scene, run, spawn, enemyCount: () => enemies.filter((enemy) => enemy.active).length, grantReward, announce });
  director.start();
  const getTarget = (index: number) => enemies.find((enemy) => enemy.x === FRENZY_TARGETS[index].x && enemy.y === FRENZY_TARGETS[index].y)!;
  const kill = (zombie: Zombie) => { director.onDeath(zombie); zombie.active = false; };
  return { director, run, enemies, spawn, grantReward, announce, getTarget, kill, visuals };
}

describe('狂潮战场适配', () => {
  it('目标驻守且近身才追击，普通尸潮不绑定驻守区', () => {
    const { director, getTarget, enemies } = setup();
    const target = getTarget(0);
    expect(director.getSeekTarget(target, { x: 640, y: 360 })).toMatchObject({ x: 180, y: 190 });
    expect(director.getSeekTarget(target, { x: 220, y: 200 })).toEqual({ x: 220, y: 200 });
    target.x = 440;
    expect(director.getSeekTarget(target, { x: 220, y: 200 })).toMatchObject({ x: 180, y: 190 });
    expect(director.getSeekTarget(enemies.at(-1)!, { x: 640, y: 360 })).toBeNull();
  });

  it('目标死亡只落核心，接近才奖励，第三次拾取只召唤一只首领', () => {
    const { director, run, getTarget, kill, grantReward, spawn } = setup();
    for (let index = 0; index < 3; index += 1) {
      const target = getTarget(index);
      kill(target);
      director.onDeath(target);
      expect(grantReward).toHaveBeenCalledTimes(index);
      director.update({ x: 640, y: 360 });
      expect(grantReward).toHaveBeenCalledTimes(index);
      director.update(target);
      director.update(target);
      expect(grantReward).toHaveBeenCalledTimes(index + 1);
    }
    expect(run.phase).toBe('boss');
    expect(spawn.mock.calls.filter(([id]) => id === 'tank_boss')).toHaveLength(1);
    const boss = spawn.mock.results.find((result) => result.value.def.id === 'tank_boss')!.value;
    expect(director.lockBossDefeat(getTarget(0))).toBe(false);
    expect(director.lockBossDefeat(boss)).toBe(true);
    expect(director.lockBossDefeat(boss)).toBe(false);
  });

  it('大量时间流逝仍限制每帧刷新和总量，为首领保留一位', () => {
    const { director, run, spawn, enemies } = setup();
    const initial = spawn.mock.calls.length;
    advanceFrenzy(run, 100000);
    director.update({ x: 640, y: 360 });
    expect(spawn.mock.calls.length - initial).toBe(4);
    for (let frame = 0; frame < 100; frame += 1) {
      advanceFrenzy(run, 1000);
      director.update({ x: 640, y: 360 });
    }
    expect(enemies.length).toBeLessThanOrEqual(FRENZY_ENEMY_CAP - 1);
  });

  it('超时不再刷新或拾取；销毁清理所有标记与驻守引用', () => {
    const { director, run, getTarget, kill, spawn, grantReward, visuals } = setup();
    const target = getTarget(0);
    kill(target);
    advanceFrenzy(run, 300000);
    const count = spawn.mock.calls.length;
    director.update(target);
    expect(grantReward).not.toHaveBeenCalled();
    expect(spawn).toHaveBeenCalledTimes(count);
    director.destroy();
    for (const visual of visuals) expect(visual.destroy).toHaveBeenCalledOnce();
    expect(director.getSeekTarget(target, target)).toBeNull();
  });
});
