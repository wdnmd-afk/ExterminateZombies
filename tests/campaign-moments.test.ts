import { describe, expect, it, vi } from 'vitest';
import { LEVELS } from '../src/config/levels';
import { getScriptedMoments, SCRIPTED_MOMENTS, type ScriptedMomentDef } from '../src/config/scriptedMoments';
import { getWaveSegments } from '../src/config/waveShape';
import { validateGameConfig } from '../src/config/validate';
import { ScriptedMomentSystem } from '../src/systems/ScriptedMomentSystem';
import { buildRotatedRectTiles } from '../src/utils/geometry';

describe('3—7关独立环境时刻', () => {
  it.each([3, 4, 5, 6, 7])('第%d关两处时刻指向真实段落，不新增敌人或堵住碰撞砖', levelNumber => {
    const levelId = `level_${levelNumber}`;
    const level = LEVELS.find(entry => entry.id === levelId)!;
    const moments = getScriptedMoments(levelId);
    expect(moments).toHaveLength(2);
    const tiles = level.obstacles!.flatMap(obstacle => buildRotatedRectTiles(obstacle.x, obstacle.y, obstacle.width, obstacle.height, obstacle.rotation));
    for (const moment of moments) {
      expect(moment.announce?.subtitle).toContain('近身点不投放');
      expect(moment.trigger.kind).toBe('segmentStart');
      if (moment.trigger.kind !== 'segmentStart') throw new Error('Invalid trigger');
      expect(getWaveSegments(level.waves[moment.trigger.wave])[moment.trigger.segment]).toBeDefined();
      for (const action of moment.actions!) {
        expect(action.kind).toBe('props');
        if (action.kind !== 'props') throw new Error('Unexpected enemy spawn');
        expect(action.minPlayerDistance).toBe(180);
        for (const point of action.points) {
          expect(tiles.some(tile => Math.abs(point.x - tile.x) < tile.width / 2 + 18 && Math.abs(point.y - tile.y) < tile.height / 2 + 18), `${levelId} (${point.x},${point.y})`).toBe(false);
        }
      }
    }
  });

  it.each([3, 4, 5, 6, 7])('第%d关实际执行两次播报、四个道具，同局不重复且重开重置', levelNumber => {
    const spawnProp = vi.fn();
    const spawnZombieAt = vi.fn();
    const announce = vi.fn();
    const create = () => new ScriptedMomentSystem({ levelId: `level_${levelNumber}`, spawnProp, spawnZombieAt, announce, getPlayerPosition: () => ({ x: 60, y: 60 }) });
    const system = create();
    for (let iteration = 0; iteration < 3; iteration += 1) { system.notifySegmentStarted(1, 0); system.notifySegmentStarted(2, 1); }
    expect(announce).toHaveBeenCalledTimes(2);
    expect(spawnProp).toHaveBeenCalledTimes(4);
    expect(spawnZombieAt).not.toHaveBeenCalled();
    const snapshot = system.getDiagnostics(); snapshot.fired.length = 0; snapshot.props[0].x = -1;
    expect(system.getDiagnostics().fired).toHaveLength(2);
    expect(system.getDiagnostics().props[0].x).toBeGreaterThan(0);
    create().notifySegmentStarted(1, 0);
    expect(spawnProp).toHaveBeenCalledTimes(6);
  });

  it('玩家脚下的油桶跳过，另一侧仍生成，跳过项可复核', () => {
    const spawnProp = vi.fn();
    const system = new ScriptedMomentSystem({ levelId: 'level_3', spawnProp, spawnZombieAt: vi.fn(), announce: vi.fn(), getPlayerPosition: () => ({ x: 290, y: 300 }) });
    system.notifySegmentStarted(1, 0);
    expect(spawnProp).toHaveBeenCalledExactlyOnceWith('barrel_oil', 990, 300);
    expect(system.getDiagnostics().props.map(entry => entry.skippedNearPlayer)).toEqual([true, false]);
  });

  it.each([NaN, Infinity, -1, 2000])('无效避让距离%s不能通过配置校验', minPlayerDistance => {
    const moments = SCRIPTED_MOMENTS as ScriptedMomentDef[];
    const entry = structuredClone(getScriptedMoments('level_3')[0]);
    entry.id = 'invalid-safety-distance';
    if (entry.actions![0].kind !== 'props') throw new Error('Invalid fixture');
    entry.actions![0].minPlayerDistance = minPlayerDistance;
    moments.push(entry);
    try { expect(validateGameConfig().some(message => message.includes('避让距离'))).toBe(true); }
    finally { moments.pop(); }
  });
});
