import { describe, expect, it } from 'vitest';
import { LEVELS } from '../src/config/levels';
import { P2_VERTICAL_SLICE } from '../src/config/verticalSlice';
import {
  SCRIPTED_MOMENTS,
  getScriptedMoments,
  type ScriptedMomentDef,
} from '../src/config/scriptedMoments';
import { getWaveSegments } from '../src/config/waveShape';
import {
  matchesTrigger,
  resolveRingPoints,
  resolveTriggeredMoments,
} from '../src/systems/ScriptedMomentRules';

const BOUNDS = { width: 1280, height: 720, margin: 40 };

function moment(id: string, trigger: ScriptedMomentDef['trigger']): ScriptedMomentDef {
  return { id, levelId: 'level_2', trigger };
}

describe('剧本时刻触发判定', () => {
  it('首杀只被首杀事件点燃', () => {
    expect(matchesTrigger({ kind: 'firstKill' }, { kind: 'firstKill' })).toBe(true);
    expect(matchesTrigger({ kind: 'firstKill' }, { kind: 'segmentStart', wave: 0, segment: 0 }))
      .toBe(false);
    expect(matchesTrigger({ kind: 'firstKill' }, { kind: 'tick', wave: 1, healthRatio: 0.1 }))
      .toBe(false);
  });

  it('段落触发必须阶段与段落索引同时命中', () => {
    const trigger = { kind: 'segmentStart', wave: 1, segment: 2 } as const;
    expect(matchesTrigger(trigger, { kind: 'segmentStart', wave: 1, segment: 2 })).toBe(true);
    expect(matchesTrigger(trigger, { kind: 'segmentStart', wave: 1, segment: 1 })).toBe(false);
    expect(matchesTrigger(trigger, { kind: 'segmentStart', wave: 2, segment: 2 })).toBe(false);
  });

  it('生命阈值触发需要同时满足阶段门槛与生命比例', () => {
    const trigger = { kind: 'healthBelow', ratio: 0.3, minWave: 3 } as const;
    expect(matchesTrigger(trigger, { kind: 'tick', wave: 3, healthRatio: 0.3 })).toBe(true);
    expect(matchesTrigger(trigger, { kind: 'tick', wave: 4, healthRatio: 0.1 })).toBe(true);
    // 阶段没到：早期触发只会变成单纯的惩罚。
    expect(matchesTrigger(trigger, { kind: 'tick', wave: 2, healthRatio: 0.1 })).toBe(false);
    // 生命还够：不该提前放包夹。
    expect(matchesTrigger(trigger, { kind: 'tick', wave: 3, healthRatio: 0.31 })).toBe(false);
  });
});

describe('剧本时刻一局一次', () => {
  it('已触发过的时刻不会再次返回', () => {
    const moments = [moment('a', { kind: 'firstKill' }), moment('b', { kind: 'firstKill' })];
    const first = resolveTriggeredMoments(moments, new Set(), { kind: 'firstKill' });
    expect(first.map((entry) => entry.id)).toEqual(['a', 'b']);

    const second = resolveTriggeredMoments(moments, new Set(['a']), { kind: 'firstKill' });
    expect(second.map((entry) => entry.id)).toEqual(['b']);

    expect(resolveTriggeredMoments(moments, new Set(['a', 'b']), { kind: 'firstKill' })).toEqual([]);
  });

  it('每帧心跳在条件持续满足时也只点燃一次', () => {
    const moments = [moment('low', { kind: 'healthBelow', ratio: 0.3, minWave: 1 })];
    const fired = new Set<string>();
    for (let frame = 0; frame < 10; frame++) {
      for (const entry of resolveTriggeredMoments(moments, fired, {
        kind: 'tick',
        wave: 1,
        healthRatio: 0.2,
      })) {
        fired.add(entry.id);
      }
    }
    expect([...fired]).toEqual(['low']);
  });
});

describe('环形生成点', () => {
  it('按数量均分角度，半径正确', () => {
    const points = resolveRingPoints(640, 360, 4, 200, BOUNDS);
    expect(points).toHaveLength(4);
    for (const point of points) {
      expect(Math.hypot(point.x - 640, point.y - 360)).toBeCloseTo(200);
    }
  });

  it('玩家贴边时落点被夹进战场，不会刷到画布外', () => {
    const points = resolveRingPoints(20, 20, 8, 400, BOUNDS);
    for (const point of points) {
      expect(point.x).toBeGreaterThanOrEqual(BOUNDS.margin);
      expect(point.y).toBeGreaterThanOrEqual(BOUNDS.margin);
      expect(point.x).toBeLessThanOrEqual(BOUNDS.width - BOUNDS.margin);
      expect(point.y).toBeLessThanOrEqual(BOUNDS.height - BOUNDS.margin);
    }
  });

  it('数量非正时返回空数组', () => {
    expect(resolveRingPoints(640, 360, 0, 200, BOUNDS)).toEqual([]);
    expect(resolveRingPoints(640, 360, -3, 200, BOUNDS)).toEqual([]);
  });
});

describe('第二关剧本时刻编排', () => {
  const moments = getScriptedMoments(P2_VERTICAL_SLICE.levelId);

  it('id 唯一且全部指向存在的关卡', () => {
    const levelIds = new Set(LEVELS.map((level) => level.id));
    const ids = SCRIPTED_MOMENTS.map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const entry of SCRIPTED_MOMENTS) {
      expect(levelIds.has(entry.levelId), `${entry.id} 指向了不存在的关卡`).toBe(true);
    }
  });

  it('至少配置 3 个时刻，且每个都有播报文案', () => {
    expect(moments.length).toBeGreaterThanOrEqual(3);
    for (const entry of moments) {
      expect(entry.announce?.title.length, `${entry.id} 缺少播报标题`).toBeGreaterThan(0);
      expect(entry.announce?.subtitle.length, `${entry.id} 缺少播报副标题`).toBeGreaterThan(0);
    }
  });

  it('段落触发都指向真实存在的阶段与段落', () => {
    const level = LEVELS.find((entry) => entry.id === P2_VERTICAL_SLICE.levelId);
    expect(level).toBeDefined();
    if (!level) return;

    for (const entry of moments) {
      if (entry.trigger.kind !== 'segmentStart') continue;
      const wave = level.waves[entry.trigger.wave];
      expect(wave, `${entry.id} 指向不存在的阶段 ${entry.trigger.wave}`).toBeDefined();
      if (!wave) continue;
      expect(
        getWaveSegments(wave)[entry.trigger.segment],
        `${entry.id} 指向不存在的段落 ${entry.trigger.segment}`,
      ).toBeDefined();
    }
  });

  it('时刻生成的敌人与场景物都在切片白名单内', () => {
    const enemyWhitelist = new Set<string>(P2_VERTICAL_SLICE.enemyIds);
    const itemWhitelist = new Set<string>(P2_VERTICAL_SLICE.tacticalItemIds);
    for (const entry of moments) {
      for (const action of entry.actions ?? []) {
        if (action.kind === 'props') {
          expect(itemWhitelist.has(action.itemId), `${entry.id} 混入非白名单场景物`).toBe(true);
        } else {
          expect(enemyWhitelist.has(action.type), `${entry.id} 混入非白名单感染体`).toBe(true);
        }
      }
    }
  });

  it('环形包夹半径足够远，不会贴身刷怪', () => {
    for (const entry of moments) {
      for (const action of entry.actions ?? []) {
        if (action.kind !== 'ring') continue;
        // 玩家移速 120 px/s：半径至少要给出 2 秒以上的反应窗口。
        expect(action.radius, `${entry.id} 的包夹半径过近`).toBeGreaterThanOrEqual(280);
        expect(action.count, `${entry.id} 的包夹数量过多，会变成处刑`).toBeLessThanOrEqual(6);
      }
    }
  });

  it('列队时刻的生成点全部落在战场内且保持共线，才能被一枪贯穿', () => {
    for (const entry of moments) {
      for (const action of entry.actions ?? []) {
        if (action.kind !== 'formation') continue;
        expect(action.points.length).toBeGreaterThan(1);
        const firstY = action.points[0].y;
        for (const point of action.points) {
          expect(point.x).toBeGreaterThan(0);
          expect(point.x).toBeLessThan(BOUNDS.width);
          expect(point.y).toBeGreaterThan(0);
          expect(point.y).toBeLessThan(BOUNDS.height);
          expect(point.y, `${entry.id} 的列队不共线，无法一枪贯穿`).toBe(firstY);
        }
      }
    }
  });

  it('无尽模式与未配置关卡拿到空列表', () => {
    expect(getScriptedMoments(null)).toEqual([]);
    expect(getScriptedMoments('level_9')).toEqual([]);
  });
});
