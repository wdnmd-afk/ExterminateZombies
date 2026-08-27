import { describe, expect, it } from 'vitest';
import { LEVELS } from '../src/config/levels';
import { ZOMBIES, isBossZombie, type ZombieId } from '../src/config/zombies';
import { P2_VERTICAL_SLICE } from '../src/config/verticalSlice';
import {
  getWaveEnemyCount,
  getWaveEnemyEntries,
  getWaveSegments,
  getWaveSpawnDurationMs,
} from '../src/config/waveShape';
import { getThemedBattlefieldIds } from '../src/systems/BattlefieldRenderer';

const NORMAL_ZOMBIE_IDS = (Object.keys(ZOMBIES) as ZombieId[])
  .filter((id) => !isBossZombie(id));

/**
 * P2 垂直切片是当前唯一按正式关卡标准制作的关卡（`docs/execution/2026-08-12-g6-wave-rhythm.md`）。
 * 其余九关仍是原型，规模按 3 分钟量级配置，因此「难度随关卡递进」这类跨关不变量
 * 在切片与原型之间不成立，只能在原型之间比较。批量重制归 G6-6。
 */
const PROTOTYPE_LEVELS = LEVELS.filter((level) => level.id !== P2_VERTICAL_SLICE.levelId);

/**
 * 关卡难度用「常规波次总生命值预算」衡量而不是敌人只数：
 * 一只坦克和一只普通感染体占同样的只数，但压迫感完全不同。
 *
 * **Boss 血量刻意不计入。** Boss 被重做成三阶段机制战之后血量在 3200–6400 一档，
 * 而整关杂兵预算只有 4000–5500，把两者相加等于让"这一关有没有 Boss"完全盖过
 * 关卡编排本身的差异，曲线断言也就不再检验任何东西。
 * 「挂 Boss 的关卡不该显得更简单」这条意图改由结构断言表达（Boss 关必须真的挂 Boss，
 * 见下面「关卡 Boss 编排」一组）。
 */
function healthBudget(level: typeof LEVELS[number]): number {
  return level.waves.reduce(
    (total, wave) => total + getWaveEnemyEntries(wave).reduce(
      (sum, enemy) => sum + enemy.count * ZOMBIES[enemy.type].health,
      0,
    ),
    0,
  );
}

function enemyCount(level: typeof LEVELS[number]): number {
  return level.waves.reduce((total, wave) => total + getWaveEnemyCount(wave), 0);
}

describe('关卡战役结构', () => {
  it('共 10 关，id 按 level_1..level_10 连续且不重复', () => {
    expect(LEVELS).toHaveLength(10);
    expect(LEVELS.map((level) => level.id)).toEqual(
      Array.from({ length: 10 }, (_, index) => `level_${index + 1}`),
    );
  });

  it('每关都有名称、独立任务简报、至少 3 个阶段，且每个段落参数合法', () => {
    const briefings = new Set<string>();
    for (const level of LEVELS) {
      expect(level.name.length, `${level.id} 缺少关卡名`).toBeGreaterThan(0);
      expect(level.briefing.trim().length, `${level.id} 缺少任务简报`).toBeGreaterThan(0);
      expect(level.briefing.split('\n').length, `${level.id} 简报应保持两行结构`).toBe(2);
      briefings.add(level.briefing);
      expect(level.waves.length, `${level.id} 阶段过少`).toBeGreaterThanOrEqual(3);
      for (const wave of level.waves) {
        expect(wave.startDelay).toBeGreaterThan(0);
        const segments = getWaveSegments(wave);
        expect(segments.length, `${level.id} 有阶段没有生成段落`).toBeGreaterThan(0);
        for (const segment of segments) {
          expect(segment.enemies.length, `${level.id} 有空段落`).toBeGreaterThan(0);
          expect(segment.spawnInterval).toBeGreaterThan(0);
          expect(segment.leadIn).toBeGreaterThanOrEqual(0);
          for (const enemy of segment.enemies) {
            expect(enemy.count).toBeGreaterThan(0);
          }
        }
      }
    }
    expect(briefings.size, '不同关卡复用了相同任务简报').toBe(LEVELS.length);
  });

  it('原型关卡的阶段数随推进只增不减', () => {
    const waveCounts = PROTOTYPE_LEVELS.map((level) => level.waves.length);
    for (let index = 1; index < waveCounts.length; index++) {
      expect(waveCounts[index], `${PROTOTYPE_LEVELS[index].id} 的阶段数少于上一关`)
        .toBeGreaterThanOrEqual(waveCounts[index - 1]);
    }
  });

  it('原型关卡的难度曲线单调递进：总生命值预算不出现倒退', () => {
    const budgets = PROTOTYPE_LEVELS.map(healthBudget);
    for (let index = 1; index < budgets.length; index++) {
      expect(budgets[index], `${PROTOTYPE_LEVELS[index].id} 的生命值预算低于上一关`)
        .toBeGreaterThanOrEqual(budgets[index - 1]);
    }
  });

  it('最终关是全部原型关卡里规模最大的一关', () => {
    const finalLevel = PROTOTYPE_LEVELS[PROTOTYPE_LEVELS.length - 1];
    for (const level of PROTOTYPE_LEVELS.slice(0, -1)) {
      expect(enemyCount(finalLevel)).toBeGreaterThan(enemyCount(level));
      expect(healthBudget(finalLevel)).toBeGreaterThan(healthBudget(level));
    }
  });

  it('垂直切片规模显著超过全部原型关卡：它是唯一按正式时长制作的关卡', () => {
    const slice = LEVELS.find((level) => level.id === P2_VERTICAL_SLICE.levelId);
    expect(slice).toBeDefined();
    if (!slice) return;
    for (const level of PROTOTYPE_LEVELS) {
      expect(enemyCount(slice), `${level.id} 的敌人总量反超了垂直切片`)
        .toBeGreaterThan(enemyCount(level));
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
  it('P2 废车站只使用冻结内容，并提供确定性的四武器与两次强化流程', () => {
    const level = LEVELS.find((entry) => entry.id === 'level_2');
    expect(level).toBeDefined();
    if (!level) return;

    const enemies = new Set(level.waves.flatMap((wave) => getWaveEnemyEntries(wave).map((enemy) => enemy.type)));
    expect([...enemies].sort()).toEqual(['lurker', 'runner', 'tank', 'walker']);
    expect(level.boss?.type).toBe('tank_boss');

    const rewards = level.waves.flatMap((wave) => wave.rewards ?? []);
    expect(rewards.filter((reward) => reward.type === 'enhancement')).toHaveLength(2);
    expect(rewards.flatMap((reward) => reward.type === 'weapon' ? [reward.weaponId] : []))
      .toEqual(['smg', 'shotgun', 'rifle']);
  });

  it('P2 每个阶段都拆成多个段落，形成阶段内节奏而不是一次性放完', () => {
    const level = LEVELS.find((entry) => entry.id === P2_VERTICAL_SLICE.levelId);
    expect(level).toBeDefined();
    if (!level) return;

    for (const wave of level.waves) {
      const segments = getWaveSegments(wave);
      expect(segments.length, '阶段没有拆分段落，节奏会退化成平铺').toBeGreaterThanOrEqual(3);
      // 首个段落由阶段 startDelay 承担静默，其余段落必须有明确的呼吸间隔。
      expect(segments[0].leadIn).toBe(0);
      for (const segment of segments.slice(1)) {
        expect(segment.leadIn).toBeGreaterThan(0);
      }
    }
  });

  it('P2 每个段落都声明同屏上限，且不越过性能预算的最低测试档位', () => {
    const level = LEVELS.find((entry) => entry.id === P2_VERTICAL_SLICE.levelId);
    expect(level).toBeDefined();
    if (!level) return;

    for (const wave of level.waves) {
      for (const segment of getWaveSegments(wave)) {
        expect(segment.concurrentCap, '段落缺少同屏上限').toBeDefined();
        expect(segment.concurrentCap!).toBeGreaterThan(0);
        expect(segment.concurrentCap!).toBeLessThanOrEqual(P2_VERTICAL_SLICE.maxConcurrentEnemies);
      }
    }
  });

  it('P2 生成排程为单局时长提供明确下界', () => {
    const level = LEVELS.find((entry) => entry.id === P2_VERTICAL_SLICE.levelId);
    expect(level).toBeDefined();
    if (!level) return;

    // 生成排程只是下界：即使玩家瞬间清空每一只，三个常规阶段也至少要跑这么久。
    // 实际时长由清杀速度与同屏上限共同决定，必须靠试玩测量，不能只看这个数。
    const spawnFloorMs = level.waves.reduce(
      (total, wave) => total + wave.startDelay + getWaveSpawnDurationMs(wave),
      0,
    );
    expect(spawnFloorMs).toBeGreaterThan(3 * 60 * 1000);
    // 上界防呆：若下界本身就超过目标时长，说明节奏被静默拖长而不是靠密度填满。
    expect(spawnFloorMs).toBeLessThan(10 * 60 * 1000);
  });

  it('全部普通感染体都至少在一个固定关卡里出现', () => {
    const used = new Set<string>();
    for (const level of LEVELS) {
      for (const wave of level.waves) {
        for (const enemy of getWaveEnemyEntries(wave)) used.add(enemy.type);
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
