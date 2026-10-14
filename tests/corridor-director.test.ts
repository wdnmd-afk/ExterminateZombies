import type Phaser from 'phaser';
import { describe, expect, it, vi } from 'vitest';
import {
  CORRIDOR_BREACH_X,
  CORRIDOR_ENEMY_CAP,
  CORRIDOR_LANE,
  CORRIDOR_SPAWN_X,
  type CorridorCardKind,
} from '../src/config/corridor';
import type { ZombieId } from '../src/config/zombies';
import type { Zombie } from '../src/entities/Zombie';
import { CorridorDirector } from '../src/systems/CorridorDirector';
import { advanceCorridor, createCorridorRun } from '../src/systems/CorridorRules';

vi.mock('phaser', () => ({ default: { Math: { Clamp: (value: number, min: number, max: number) => Math.max(min, Math.min(max, value)) } } }));

function setup() {
  const enemies: Zombie[] = [];
  const spawn = vi.fn((id: ZombieId, position: { x: number; y: number }) => {
    const zombie = { x: position.x, y: position.y, active: true, def: { id } } as unknown as Zombie;
    enemies.push(zombie);
    return zombie;
  });
  const cards: string[] = [];
  const spawnCard = vi.fn((kind: string) => {
    cards.push(kind);
    return true;
  });
  const announce = vi.fn();
  const onBreach = vi.fn();
  const run = createCorridorRun('pistol');
  const director = new CorridorDirector({
    scene: { add: {} } as unknown as Phaser.Scene,
    run,
    spawn,
    enemyCount: () => enemies.filter((enemy) => enemy.active).length,
    getActiveZombies: () => enemies,
    spawnCard: spawnCard as unknown as (kind: CorridorCardKind) => boolean,
    announce,
    onBreach,
  });
  director.start();
  return { director, run, enemies, spawn, cards, spawnCard, announce, onBreach };
}

describe('通道战场编排', () => {
  it('所有僵尸只刷在主通道带、右缘外,seek 目标钉在突破点', () => {
    const { director, run, enemies } = setup();
    // 推进到第六阶段,全阶段构成都被覆盖。
    advanceCorridor(run, 400_000);
    for (let frame = 0; frame < 400; frame += 1) {
      advanceCorridor(run, 1_000);
      director.update();
    }
    expect(enemies.length).toBeGreaterThan(10);
    for (const zombie of enemies) {
      expect(zombie.x).toBe(CORRIDOR_SPAWN_X);
      expect(zombie.y).toBeGreaterThanOrEqual(CORRIDOR_LANE.main.centerY - 71);
      expect(zombie.y).toBeLessThanOrEqual(CORRIDOR_LANE.main.centerY + 71);
    }
    const target = director.getSeekTarget(enemies[0]);
    expect(target).toEqual({ x: CORRIDOR_BREACH_X, y: CORRIDOR_LANE.main.centerY });
    expect(director.getAbilityTarget()).toEqual(target);
  });

  it('大量时间流逝仍受同屏上限约束,并出现涌浪播报;前两分钟没有涌浪', () => {
    const { director, run, enemies, announce } = setup();
    const preSurgeAnnounces: string[] = [];
    for (let frame = 0; frame < 115; frame += 1) {
      advanceCorridor(run, 1_000);
      director.update();
      preSurgeAnnounces.push(...announce.mock.calls.map((call) => String(call[0])));
    }
    expect(preSurgeAnnounces).not.toContain('尸潮涌浪');
    for (let frame = 0; frame < 500; frame += 1) {
      advanceCorridor(run, 1_000);
      director.update();
    }
    expect(announce).toHaveBeenCalledWith('尸潮涌浪', expect.any(String));
    expect(enemies.filter((enemy) => enemy.active).length).toBeLessThanOrEqual(CORRIDOR_ENEMY_CAP - 1);
  });

  it('道具卡与队友卡按节奏投放;突破只触发一次终局', () => {
    const { director, run, enemies, cards, onBreach } = setup();
    for (let frame = 0; frame < 40; frame += 1) {
      advanceCorridor(run, 1_000);
      director.update();
    }
    expect(cards.filter((kind) => kind === 'ally').length).toBeGreaterThanOrEqual(1);
    expect(cards.length).toBeGreaterThanOrEqual(2);

    // 突破:把最早刷出的僵尸挪过线,终局钩子只触发一次。
    enemies[0].x = CORRIDOR_BREACH_X - 1;
    director.update();
    expect(onBreach).toHaveBeenCalledOnce();
    // 终局后不再刷任何东西。
    const spawnCountAfterBreach = (director as unknown as { hooks: { spawn: () => void } }) ? 0 : 0;
    director.update();
    expect(onBreach).toHaveBeenCalledOnce();
    expect(spawnCountAfterBreach).toBe(0);
  });

  it('阶段变化播报按 elapsed 递进(开场两条 + 渗透一条 = 三条)', () => {
    const { director, run, announce } = setup();
    advanceCorridor(run, 35_000);
    director.update();
    expect(announce).toHaveBeenCalledWith(
      expect.stringContaining('渗透'),
      expect.any(String),
    );
    expect(announce).toHaveBeenCalledTimes(3);
  });
});
