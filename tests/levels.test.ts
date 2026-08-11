import { describe, expect, it } from 'vitest';
import { LEVELS } from '../src/config/levels';
import { ZOMBIES, isBossZombie, type ZombieId } from '../src/config/zombies';
import { getThemedBattlefieldIds } from '../src/systems/BattlefieldRenderer';

const NORMAL_ZOMBIE_IDS = (Object.keys(ZOMBIES) as ZombieId[])
  .filter((id) => !isBossZombie(id));

/**
 * 关卡难度用「总生命值预算」衡量而不是敌人只数：
 * 一只坦克和一只普通感染体占同样的只数，但压迫感完全不同。
 * Boss 血量计入本关，否则挂 Boss 的关卡会因为常规波次收敛而显得更简单。
 */
function healthBudget(level: typeof LEVELS[number]): number {
  const waveBudget = level.waves.reduce(
    (total, wave) => total + wave.enemies.reduce(
      (sum, enemy) => sum + enemy.count * ZOMBIES[enemy.type].health,
      0,
    ),
    0,
  );
  return waveBudget + (level.boss ? ZOMBIES[level.boss.type].health : 0);
}

function enemyCount(level: typeof LEVELS[number]): number {
  return level.waves.reduce(
    (total, wave) => total + wave.enemies.reduce((sum, enemy) => sum + enemy.count, 0),
    0,
  );
}

describe('关卡战役结构', () => {
  it('共 10 关，id 按 level_1..level_10 连续且不重复', () => {
    expect(LEVELS).toHaveLength(10);
    expect(LEVELS.map((level) => level.id)).toEqual(
      Array.from({ length: 10 }, (_, index) => `level_${index + 1}`),
    );
  });

  it('每关都有名称、独立任务简报、至少 3 个波次，且每种敌人数量为正', () => {
    const briefings = new Set<string>();
    for (const level of LEVELS) {
      expect(level.name.length, `${level.id} 缺少关卡名`).toBeGreaterThan(0);
      expect(level.briefing.trim().length, `${level.id} 缺少任务简报`).toBeGreaterThan(0);
      expect(level.briefing.split('\n').length, `${level.id} 简报应保持两行结构`).toBe(2);
      briefings.add(level.briefing);
      expect(level.waves.length, `${level.id} 波次过少`).toBeGreaterThanOrEqual(3);
      for (const wave of level.waves) {
        expect(wave.enemies.length, `${level.id} 有空波次`).toBeGreaterThan(0);
        for (const enemy of wave.enemies) {
          expect(enemy.count).toBeGreaterThan(0);
        }
        expect(wave.spawnInterval).toBeGreaterThan(0);
        expect(wave.startDelay).toBeGreaterThan(0);
      }
    }
    expect(briefings.size, '不同关卡复用了相同任务简报').toBe(LEVELS.length);
  });

  it('波次数量随关卡推进只增不减', () => {
    const waveCounts = LEVELS.map((level) => level.waves.length);
    for (let index = 1; index < waveCounts.length; index++) {
      expect(waveCounts[index], `${LEVELS[index].id} 的波次数少于上一关`)
        .toBeGreaterThanOrEqual(waveCounts[index - 1]);
    }
  });

  it('难度曲线单调递进：总生命值预算不出现倒退', () => {
    const budgets = LEVELS.map(healthBudget);
    for (let index = 1; index < budgets.length; index++) {
      expect(budgets[index], `${LEVELS[index].id} 的生命值预算低于上一关`)
        .toBeGreaterThanOrEqual(budgets[index - 1]);
    }
  });

  it('最终关是全场规模最大的一关', () => {
    const finalLevel = LEVELS[LEVELS.length - 1];
    const others = LEVELS.slice(0, -1);
    for (const level of others) {
      expect(enemyCount(finalLevel)).toBeGreaterThan(enemyCount(level));
      expect(healthBudget(finalLevel)).toBeGreaterThan(healthBudget(level));
    }
  });
});

describe('关卡 Boss 编排', () => {
  it('第 5 关与第 10 关各自挂上 Boss', () => {
    expect(LEVELS[4].boss?.type).toBe('hunter_boss');
    expect(LEVELS[9].boss?.type).toBe('matriarch_boss');
  });

  it('所有关卡 Boss 都是真实的 Boss 配置，且不重复使用', () => {
    const bossTypes = LEVELS
      .map((level) => level.boss?.type)
      .filter((type): type is ZombieId => type !== undefined);
    expect(bossTypes.length).toBeGreaterThanOrEqual(4);
    expect(new Set(bossTypes).size, 'Boss 在不同关卡间被重复使用').toBe(bossTypes.length);
    for (const type of bossTypes) {
      expect(ZOMBIES[type], `${type} 不存在`).toBeDefined();
      expect(isBossZombie(type), `${type} 不符合 Boss 命名约定`).toBe(true);
    }
  });

  it('每个已配置的 Boss 都在固定关卡中实际出场', () => {
    const usedBosses = new Set(LEVELS.map((level) => level.boss?.type).filter(Boolean));
    for (const id of Object.keys(ZOMBIES) as ZombieId[]) {
      if (!isBossZombie(id)) continue;
      expect(usedBosses.has(id), `${id} 没有出现在任何关卡里`).toBe(true);
    }
  });
});

describe('关卡内容覆盖', () => {
  it('全部普通感染体都至少在一个固定关卡里出现', () => {
    const used = new Set<string>();
    for (const level of LEVELS) {
      for (const wave of level.waves) {
        for (const enemy of wave.enemies) used.add(enemy.type);
      }
    }
    for (const id of NORMAL_ZOMBIE_IDS) {
      expect(used.has(id), `${id} 没有被任何关卡使用`).toBe(true);
    }
  });

  it('每关都摆放了场景物与障碍物，保留环境战术空间', () => {
    for (const level of LEVELS) {
      expect(level.props.length, `${level.id} 没有场景物`).toBeGreaterThan(0);
      expect(level.obstacles?.length ?? 0, `${level.id} 没有障碍物`).toBeGreaterThan(0);
    }
  });

  it('每关都有专属战场主题，不会静默退回第一关外观', () => {
    const themed = new Set(getThemedBattlefieldIds());
    for (const level of LEVELS) {
      expect(themed.has(level.id), `${level.id} 缺少战场调色板`).toBe(true);
    }
    expect(themed.has('endless')).toBe(true);
  });
});
