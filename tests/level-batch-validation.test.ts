import { describe, expect, it, vi } from 'vitest';
import * as endlessConfig from '../src/config/endless';
import { LEVELS } from '../src/config/levels';
import { SCRIPTED_MOMENTS, type MomentAction, type ScriptedMomentDef } from '../src/config/scriptedMoments';
import type { ItemId } from '../src/config/items';
import type { WaveDef } from '../src/config/types';
import type { NormalZombieId, ZombieId } from '../src/config/zombies';
import { validateGameConfig } from '../src/config/validate';
import { getWaveSegments } from '../src/config/waveShape';
import { GAME_HEIGHT, GAME_WIDTH } from '../src/constants';

function validateWithWave(levelId: string, mutate: (wave: WaveDef) => void): string[] {
  const level = LEVELS.find((entry) => entry.id === levelId);
  if (!level?.waves[0]) throw new Error(`测试关卡 ${levelId} 缺少首个阶段`);
  const originalWave = level.waves[0];
  level.waves[0] = structuredClone(originalWave);
  try {
    mutate(level.waves[0]);
    return validateGameConfig();
  } finally {
    level.waves[0] = originalWave;
  }
}

function validateWithEndlessWave(mutate: (wave: WaveDef) => void): string[] {
  const createWave = endlessConfig.createEndlessWave;
  const generator = vi.spyOn(endlessConfig, 'createEndlessWave').mockImplementation((waveNumber) => {
    const wave = createWave(waveNumber);
    if (waveNumber === 1) mutate(wave);
    return wave;
  });
  try {
    return validateGameConfig();
  } finally {
    generator.mockRestore();
  }
}

function createMoment(overrides: Partial<ScriptedMomentDef> = {}): ScriptedMomentDef {
  return {
    id: 'batch-validation-moment',
    levelId: 'level_4',
    trigger: { kind: 'firstKill' },
    announce: { title: '批次事件', subtitle: '验证非第二关剧本入口', accent: 0xfbc02d },
    ...overrides,
  };
}

function validateWithMoment(moment: ScriptedMomentDef): string[] {
  const moments = SCRIPTED_MOMENTS as ScriptedMomentDef[];
  const originalLength = moments.length;
  try {
    moments.push(moment);
    return validateGameConfig();
  } finally {
    moments.splice(originalLength);
  }
}

describe('批量关卡排程门禁', () => {
  it('保留现有单段原型、多段关卡和无尽章节的合法配置', () => {
    expect(validateGameConfig()).toEqual([]);
  });

  it.each([NaN, Infinity, -Infinity, 0, -1])('拒绝非法准备时间和生成间隔 %s', (value) => {
    expect(validateWithWave('level_3', (wave) => { wave.startDelay = value; }))
      .toContain('level_3 的阶段准备时间必须是有限正数');
    expect(validateWithWave('level_3', (wave) => { getWaveSegments(wave)[0].spawnInterval = value; }))
      .toContain('level_3 的段落生成间隔必须是有限正数');
    expect(validateWithWave('level_4', (wave) => { wave.spawnInterval = value; }))
      .toContain('level_4 的段落生成间隔必须是有限正数');
  });

  it.each([NaN, Infinity, -Infinity, -1])('拒绝非法静默时间 %s', (value) => {
    expect(validateWithWave('level_3', (wave) => { getWaveSegments(wave)[0].leadIn = value; }))
      .toContain('level_3 的段落静默时间必须是有限非负数');
  });

  it.each([NaN, Infinity, -Infinity, 0, -1, 1.5])('拒绝非正整数敌人数和同屏上限 %s', (value) => {
    expect(validateWithWave('level_3', (wave) => { getWaveSegments(wave)[0].enemies[0].count = value; }))
      .toContain('level_3 的 walker 数量必须是正整数');
    expect(validateWithWave('level_3', (wave) => { getWaveSegments(wave)[0].concurrentCap = value; }))
      .toContain('level_3 的段落同屏上限必须是正整数');
  });

  it('允许零静默时间，不把批次模板强加给旧单段原型', () => {
    expect(validateWithWave('level_3', (wave) => { getWaveSegments(wave)[0].leadIn = 0; })).toEqual([]);
    expect(validateWithWave('level_4', (wave) => { wave.spawnInterval = 500; })).toEqual([]);
  });

  it.each(['walker', 'missing_boss'] as ZombieId[])('拒绝非 Boss 或未登记的首领 %s', (type) => {
    const level = LEVELS.find((entry) => entry.id === 'level_3');
    if (!level) throw new Error('第三关配置缺失');
    const originalBoss = level.boss;
    try {
      level.boss = { type };
      expect(validateGameConfig()).toContain(`level_3 引用了无效 Boss ${type}`);
    } finally {
      level.boss = originalBoss;
    }
  });

  it.each([NaN, Infinity, -Infinity, 0, -1])('无尽章节同样拒绝非法排程时间 %s', (value) => {
    expect(validateWithEndlessWave((wave) => { wave.startDelay = value; }))
      .toContain('无尽第 1 波 缺少合法生成排程');
    expect(validateWithEndlessWave((wave) => { getWaveSegments(wave)[0].spawnInterval = value; }))
      .toContain('无尽第 1 波 的段落时间参数无效');
  });

  it.each([NaN, Infinity, -Infinity, -1])('无尽章节拒绝非法静默时间 %s', (value) => {
    expect(validateWithEndlessWave((wave) => { getWaveSegments(wave)[0].leadIn = value; }))
      .toContain('无尽第 1 波 的段落时间参数无效');
  });

  it.each([NaN, Infinity, -Infinity, 0, -1, 1.5, 43])('无尽章节拒绝非法同屏上限 %s', (value) => {
    expect(validateWithEndlessWave((wave) => { getWaveSegments(wave)[0].concurrentCap = value; }))
      .toContain('无尽第 1 波 的同屏上限必须是 1~42 的整数');
  });
});

describe('全关卡剧本配置门禁', () => {
  it('接受原型关卡零起始段落、三类动作与无播报动作', () => {
    const actions: MomentAction[] = [
      { kind: 'formation', type: 'walker', points: [{ x: 640, y: 360 }] },
      { kind: 'ring', type: 'runner', count: 4, radius: 420 },
      { kind: 'props', itemId: 'barrel_oil', points: [{ x: 700, y: 360 }] },
    ];
    expect(validateWithMoment(createMoment({
      trigger: { kind: 'segmentStart', wave: 0, segment: 0 },
      announce: undefined,
      actions,
    }))).toEqual([]);
    expect(validateWithMoment(createMoment({
      trigger: { kind: 'healthBelow', ratio: 0.3, minWave: 1 },
    }))).toEqual([]);
  });

  it('拒绝未知关卡、空身份与重复身份', () => {
    expect(validateWithMoment(createMoment({ levelId: 'missing_level' })))
      .toContain('剧本时刻 batch-validation-moment 引用了未知关卡 missing_level');
    expect(validateWithMoment(createMoment({ id: ' ' }))).toContain('剧本时刻缺少 id');
    expect(validateWithMoment(createMoment({ id: SCRIPTED_MOMENTS[0].id })))
      .toContain(`剧本时刻 id 重复：${SCRIPTED_MOMENTS[0].id}`);
  });

  it.each([NaN, Infinity, -1, 0.5, 99])('拒绝无效阶段或段落索引 %s', (value) => {
    expect(validateWithMoment(createMoment({ trigger: { kind: 'segmentStart', wave: value, segment: 0 } })))
      .toContain('剧本时刻 batch-validation-moment 指向不存在的阶段或段落');
    expect(validateWithMoment(createMoment({ trigger: { kind: 'segmentStart', wave: 0, segment: value } })))
      .toContain('剧本时刻 batch-validation-moment 指向不存在的阶段或段落');
  });

  it.each([NaN, Infinity, -1, 0, 1, 1.1])('拒绝无效濒死阈值 %s', (ratio) => {
    expect(validateWithMoment(createMoment({ trigger: { kind: 'healthBelow', ratio, minWave: 1 } })))
      .toContain('剧本时刻 batch-validation-moment 的生命比例阈值必须在 0~1 之间（不含端点）');
  });

  it.each([NaN, Infinity, -1, 0, 0.5, 99])('拒绝不合法的一基阶段序号 %s', (minWave) => {
    expect(validateWithMoment(createMoment({ trigger: { kind: 'healthBelow', ratio: 0.3, minWave } })))
      .toContain('剧本时刻 batch-validation-moment 的最低触发阶段必须指向现有阶段（从 1 开始）');
  });

  it('保留第二关单独的内容白名单', () => {
    expect(validateWithMoment(createMoment({
      levelId: 'level_2',
      actions: [{ kind: 'formation', type: 'bomber', points: [{ x: 640, y: 360 }] }],
    }))).toContain('剧本时刻 batch-validation-moment 混入非白名单感染体 bomber');
  });

  // 故意注入类型之外的值来验证启动门禁，仅测试夹具通过 unknown 跨过类型约束。
  it.each(['tank_boss', 'missing_zombie'] as unknown as NormalZombieId[])('拒绝普通剧本刷出 %s', (type) => {
    expect(validateWithMoment(createMoment({ actions: [{ kind: 'ring', type, count: 4, radius: 420 }] })))
      .toContain(`剧本时刻 batch-validation-moment 引用了无效普通感染体 ${type}`);
  });

  it.each(['mine', 'missing_item'] as ItemId[])('拒绝不是可放置场景物的 %s', (itemId) => {
    expect(validateWithMoment(createMoment({
      actions: [{ kind: 'props', itemId, points: [{ x: 640, y: 360 }] }],
    }))).toContain(`剧本时刻 batch-validation-moment 引用了无效场景物 ${itemId}`);
  });

  it.each([NaN, Infinity, -Infinity, 0, -1, 1.5])('拒绝非法环形生成数量 %s', (count) => {
    expect(validateWithMoment(createMoment({ actions: [{ kind: 'ring', type: 'runner', count, radius: 420 }] })))
      .toContain('剧本时刻 batch-validation-moment 的环形生成数量必须是正整数');
  });

  it.each([NaN, Infinity, -Infinity, 0, -1])('拒绝非法环形半径 %s', (radius) => {
    expect(validateWithMoment(createMoment({ actions: [{ kind: 'ring', type: 'runner', count: 4, radius }] })))
      .toContain('剧本时刻 batch-validation-moment 的环形生成半径必须是有限正数');
  });

  it.each([
    { x: NaN, y: 360 },
    { x: 640, y: Infinity },
    { x: -1, y: 360 },
    { x: GAME_WIDTH + 1, y: 360 },
    { x: 640, y: -1 },
    { x: 640, y: GAME_HEIGHT + 1 },
  ])('拒绝场外或非有限生成点 $x/$y', (point) => {
    expect(validateWithMoment(createMoment({
      actions: [{ kind: 'formation', type: 'walker', points: [point] }],
    }))).toContain('剧本时刻 batch-validation-moment 的生成点必须是战场范围内的有限坐标');
  });

  it('拒绝空点阵、无行为事件和空播报', () => {
    expect(validateWithMoment(createMoment({ actions: [{ kind: 'props', itemId: 'barrel_oil', points: [] }] })))
      .toContain('剧本时刻 batch-validation-moment 的生成点不能为空');
    expect(validateWithMoment(createMoment({ announce: undefined, actions: [] })))
      .toContain('剧本时刻 batch-validation-moment 必须配置播报或动作');
    expect(validateWithMoment(createMoment({ announce: { title: ' ', subtitle: ' ', accent: 0 } })))
      .toContain('剧本时刻 batch-validation-moment 的播报标题和副标题不能为空');
  });

  it.each([NaN, Infinity, -1, 1.5, 0x1000000])('拒绝无效播报颜色 %s', (accent) => {
    expect(validateWithMoment(createMoment({ announce: { title: '事件', subtitle: '说明', accent } })))
      .toContain('剧本时刻 batch-validation-moment 的播报颜色必须是有效 RGB 整数');
  });

  it('变异测试结束后恢复完整生产配置', () => {
    expect(SCRIPTED_MOMENTS.some((moment) => moment.id === 'batch-validation-moment')).toBe(false);
    expect(validateGameConfig()).toEqual([]);
  });
});
