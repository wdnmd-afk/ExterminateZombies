import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { createSourceFile, ScriptTarget } from 'typescript';
import { createCampaignLevels } from '../src/config/campaign';
import { LEVELS } from '../src/config/levels';
import { getBattlefieldTileSet } from '../src/config/environmentTextures';
import { getScriptedMoments } from '../src/config/scriptedMoments';
import { ZOMBIES, type ZombieId } from '../src/config/zombies';
import { getWaveEnemyEntries, getWaveSegments } from '../src/config/waveShape';
import { validateGameConfig } from '../src/config/validate';
import { buildRotatedRectTiles } from '../src/utils/geometry';
import { campaignPageForIndex, campaignPageRange } from '../src/ui/campaignPagination';
import { sceneMethod } from './helpers/scene-method';

function pressure(level: typeof LEVELS[number]) {
  const segments = level.waves.flatMap(getWaveSegments);
  const regular = level.waves.flatMap(getWaveEnemyEntries).reduce((sum, enemy) => sum + ZOMBIES[enemy.type].health * enemy.count, 0);
  const scripted = getScriptedMoments(level.id).flatMap((moment) => moment.actions ?? []).reduce((sum, action) => {
    if (action.kind === 'props') return sum;
    return sum + ZOMBIES[action.type].health * (action.kind === 'ring' ? action.count : action.points.length);
  }, 0);
  const boss = level.boss ? Math.round(ZOMBIES[level.boss.type].health * (level.boss.scaling?.healthMultiplier ?? 1)) : 0;
  return { regular, total: regular + scripted + boss, cap: Math.max(...segments.map((segment) => segment.concurrentCap!)), interval: Math.min(...segments.map((segment) => segment.spawnInterval)) };
}

describe('三十关压力与经济门禁', () => {
  it('每一关都检查含首领/剧本的预算、峰值并发、最快节拍，不跳过首领后的关卡', () => {
    for (let index = 1; index < LEVELS.length; index++) {
      const before = pressure(LEVELS[index - 1]);
      const after = pressure(LEVELS[index]);
      expect(after.regular, LEVELS[index].id).toBeGreaterThan(before.regular);
      expect(after.total, LEVELS[index].id).toBeGreaterThan(before.total);
      expect(after.total / before.total, LEVELS[index].id).toBeLessThan(index === 1 ? 1.8 : 1.55);
      expect(after.cap).toBeGreaterThanOrEqual(before.cap);
      expect(after.cap).toBeLessThanOrEqual(40);
      expect(after.interval).toBeLessThanOrEqual(before.interval);
      expect(after.interval).toBeGreaterThanOrEqual(350);
    }
  });

  it('首关仅基础与快速追击，后续十四种普通感染体都有出场', () => {
    expect([...new Set(LEVELS[0].waves.flatMap(getWaveEnemyEntries).map((enemy) => enemy.type))].sort()).toEqual(['drifter', 'runner', 'walker']);
    const used = new Set(LEVELS.flatMap((level) => level.waves.flatMap(getWaveEnemyEntries).map((enemy) => enemy.type)));
    expect(used.size).toBe(14);
  });

  it('重装关同样保留清群目标，不退化成纯高血量消耗战', () => {
    for (const level of LEVELS) {
      const entries = level.waves.flatMap(getWaveEnemyEntries);
      const count = entries.reduce((sum, enemy) => sum + enemy.count, 0);
      expect(pressure(level).regular / count, level.id).toBeLessThanOrEqual(90);
    }
  });

  it.each(LEVELS.slice(10))('$id 每阶段补弹、固定治疗和两次强化，不重复发新武器许可', (level) => {
    const rewards = level.waves.flatMap((wave) => wave.rewards ?? []);
    expect(rewards.filter((reward) => reward.type === 'enhancement')).toHaveLength(2);
    expect(rewards.some((reward) => reward.type === 'medicine')).toBe(true);
    expect(rewards.some((reward) => reward.type === 'weapon')).toBe(false);
    for (const [index, wave] of level.waves.entries()) {
      if (index === level.waves.length - 1 && !level.boss) continue;
      expect(wave.rewards).toContainEqual({ type: 'resupply', magazines: 3 });
    }
  });

  it('主题/首领倍率的错误引用会阻止启动', () => {
    const level = LEVELS[29];
    const originalTheme = level.environmentId;
    const originalScaling = level.boss!.scaling!;
    try {
      level.environmentId = 'missing';
      level.boss!.scaling = { healthMultiplier: NaN, damageMultiplier: 0 };
      expect(validateGameConfig()).toContain('level_30 引用了无效战场主题 missing');
      expect(validateGameConfig()).toContain('level_30 的首领倍率必须是有限正数');
    } finally {
      level.environmentId = originalTheme;
      level.boss!.scaling = originalScaling;
    }
    expect(validateGameConfig()).toEqual([]);
  });

  it('重新创建配置不会共享机关、奖励或波次可变对象', () => {
    const recreated = createCampaignLevels();
    expect(recreated).toEqual(LEVELS);
    expect(recreated[0].props).not.toBe(LEVELS[0].props);
    expect(recreated[12].obstacles![0].breakable).not.toBe(recreated[2].obstacles![0].breakable);
    recreated[10].waves[0].rewards!.push({ type: 'enhancement' });
    expect(recreated[10].waves[0].rewards).not.toEqual(LEVELS[10].waves[0].rewards);
  });
});

describe('三十关布局与菜单可达性', () => {
  it.each(LEVELS)('$id 有显式位图主题、安全出生点和四向连通路线', (level) => {
    expect(getBattlefieldTileSet(level.environmentId!)).not.toBeNull();
    const tiles = (level.obstacles ?? []).flatMap((obstacle) => buildRotatedRectTiles(obstacle.x, obstacle.y, obstacle.width, obstacle.height, obstacle.rotation ?? 0));
    const blocked = (position: { x: number; y: number }) => tiles.some((tile) => Math.abs(position.x - tile.x) < tile.width / 2 + 20 && Math.abs(position.y - tile.y) < tile.height / 2 + 20)
      || level.props.some((prop) => Math.hypot(position.x - prop.x, position.y - prop.y) < 38);
    expect(blocked({ x: 640, y: 360 })).toBe(false);
    const queue = [{ x: 640, y: 360 }];
    const visited = new Set(['640,360']);
    for (let cursor = 0; cursor < queue.length; cursor++) {
      const position = queue[cursor];
      for (const offset of [{ x: 20, y: 0 }, { x: -20, y: 0 }, { x: 0, y: 20 }, { x: 0, y: -20 }]) {
        const next = { x: position.x + offset.x, y: position.y + offset.y };
        const key = `${next.x},${next.y}`;
        if (next.x < 40 || next.x > 1240 || next.y < 40 || next.y > 680 || visited.has(key) || blocked(next)) continue;
        visited.add(key);
        queue.push(next);
      }
    }
    for (const exit of ['40,360', '1240,360', '640,40', '640,680']) expect(visited.has(exit), exit).toBe(true);
    for (const lure of level.lures ?? []) {
      expect(queue.some((position) => Math.hypot(position.x - lure.x, position.y - lure.y) < 46)).toBe(true);
    }
  });

  it('三页不重叠遗漏，指定关卡自动落在正确页，翻页有界', () => {
    const indices: number[] = [];
    for (let page = 0; page < 3; page++) {
      const range = campaignPageRange(page, LEVELS.length);
      for (let index = range.start; index < range.end; index++) {
        expect(campaignPageForIndex(index)).toBe(page);
        indices.push(index);
      }
    }
    expect(indices).toEqual(Array.from({ length: 30 }, (_, index) => index));
    expect(campaignPageRange(-1, 30).page).toBe(0);
    expect(campaignPageRange(3, 30).page).toBe(2);
    expect(campaignPageForIndex(-1)).toBe(0);
  });
});

describe('菜单分页业务接线', () => {
  it('隐藏行和锁定关卡不能点击，当前页已解锁行保持可用', () => {
    const source = createSourceFile('MainMenuScene.ts', readFileSync(new URL('../src/scenes/MainMenuScene.ts', import.meta.url), 'utf8'), ScriptTarget.Latest, true);
    const refresh = sceneMethod('refreshLevelPage', { LEVELS, campaignPageRange }, source);
    const rows = new Map(LEVELS.map((level, index) => [level.id, {
      unlocked: index < 15,
      container: { setVisible: vi.fn() },
      box: { setInteractive: vi.fn(), disableInteractive: vi.fn() },
    }]));
    const context = { levelPage: 1, levelPageText: { setText: vi.fn() }, levelRows: rows };
    refresh.call(context);
    for (const [index, level] of LEVELS.entries()) {
      const row = rows.get(level.id)!;
      expect(row.container.setVisible).toHaveBeenCalledWith(index >= 10 && index < 20);
      if (index >= 10 && index < 15) expect(row.box.setInteractive).toHaveBeenCalledTimes(1);
      else expect(row.box.disableInteractive).toHaveBeenCalledTimes(1);
    }
    expect(context.levelPageText.setText).toHaveBeenCalledWith('11—20  /  30  ·  2/3');
  });
});

describe('战役首领缩放模式隔离', () => {
  const endlessScaling = { healthMultiplier: 2, damageMultiplier: 1.5 };
  const resolve = sceneMethod('resolveSpawnScaling', {
    LEVELS, isBossZombie: (type: ZombieId) => type.endsWith('_boss'), getEndlessBossScaling: () => endlessScaling,
  });
  it.each(LEVELS.filter((level) => level.boss))('$id 仅本关首领受战役倍率影响', (level) => {
    const context = { mode: 'level', levelId: level.id };
    expect(resolve.call(context, level.boss!.type)).toEqual(level.boss!.scaling);
    expect(resolve.call(context, 'walker')).toBeUndefined();
    expect(resolve.call({ ...context, mode: 'frenzy' }, level.boss!.type)).toBeUndefined();
    expect(resolve.call({ ...context, mode: 'endless', waveManager: { getEndlessWaveMeta: () => ({ chapter: 2 }) } }, level.boss!.type)).toEqual(endlessScaling);
  });
});
