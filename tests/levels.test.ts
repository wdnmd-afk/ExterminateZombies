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
  it('共 30 关，id 按 level_1..level_30 连续且不重复', () => {
    expect(LEVELS).toHaveLength(30);
    expect(LEVELS.map((level) => level.id)).toEqual(
      Array.from({ length: 30 }, (_, index) => `level_${index + 1}`),
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

  it('战役关卡的阶段数随推进只增不减', () => {
    const waveCounts = LEVELS.map((level) => level.waves.length);
    for (let index = 1; index < waveCounts.length; index++) {
      expect(waveCounts[index], `${LEVELS[index].id} 的阶段数少于上一关`)
        .toBeGreaterThanOrEqual(waveCounts[index - 1]);
    }
  });

  it('战役关卡的难度曲线单调递进：总生命值预算不出现倒退', () => {
    const budgets = LEVELS.map(healthBudget);
    for (let index = 1; index < budgets.length; index++) {
      expect(budgets[index], `${LEVELS[index].id} 的生命值预算低于上一关`)
        .toBeGreaterThanOrEqual(budgets[index - 1]);
    }
  });

  it('最终关拥有最高常规生命预算，不用轻型怪只数替代压力', () => {
    const finalLevel = LEVELS[LEVELS.length - 1];
    for (const level of LEVELS.slice(0, -1)) {
      expect(healthBudget(finalLevel)).toBeGreaterThan(healthBudget(level));
    }
  });

  it('第二关不再凌驾后续关卡，保留广播入门定位', () => {
    expect(healthBudget(LEVELS[1])).toBeGreaterThan(healthBudget(LEVELS[0]));
    expect(healthBudget(LEVELS[1])).toBeLessThan(healthBudget(LEVELS[2]));
    expect(enemyCount(LEVELS[1])).toBeLessThan(80);
  });

  it('第三关保持三阶段三段排程，压力介于第二与第四关', () => {
    const level = LEVELS[2];
    expect(level.waves).toHaveLength(3);
    expect(healthBudget(level)).toBeGreaterThan(healthBudget(LEVELS[1]));
    expect(healthBudget(level)).toBeLessThan(healthBudget(LEVELS[3]));
    for (const wave of level.waves) expect(getWaveSegments(wave)).toHaveLength(3);
  });
});

describe('关卡 Boss 编排', () => {
  it('第 5 关与第 10 关各自挂上 Boss', () => {
    expect(LEVELS[4].boss?.type).toBe('hunter_boss');
    expect(LEVELS[9].boss?.type).toBe('matriarch_boss');
  });

  it('全部首领来自四种真实配置，允许后期机制复战', () => {
    const bossTypes = LEVELS
      .map((level) => level.boss?.type)
      .filter((type): type is ZombieId => type !== undefined);
    expect(bossTypes.length).toBeGreaterThanOrEqual(4);
    expect(new Set(bossTypes).size).toBe(4);
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
    expect(spawnFloorMs).toBeGreaterThan(40 * 1000);
    // 上界防呆：若下界本身就超过目标时长，说明节奏被静默拖长而不是靠密度填满。
    expect(spawnFloorMs).toBeLessThan(4 * 60 * 1000);
  });

  it('P2 三个阶段各有可读目标，文案互不重复且短标签能进 HUD', () => {
    const level = LEVELS.find((entry) => entry.id === P2_VERTICAL_SLICE.levelId);
    expect(level).toBeDefined();
    if (!level) return;

    const labels = new Set<string>();
    const subtitles = new Set<string>();
    for (const wave of level.waves) {
      const objective = wave.objective;
      expect(objective, '垂直切片的每个阶段都必须有可读目标').toBeDefined();
      if (!objective) continue;
      // 短标签常驻 HUD 的 waveText，超过 4 字会挤掉「WAVE N/3 ·」前缀。
      expect(objective.label.length).toBeLessThanOrEqual(4);
      expect(objective.title.trim().length).toBeGreaterThan(0);
      expect(objective.subtitle.trim().length).toBeGreaterThan(0);
      // 固定关卡目标与无尽波次信息互斥，避免播报出现两套标题。
      expect(wave.endless).toBeUndefined();
      labels.add(objective.label);
      subtitles.add(objective.subtitle);
    }
    // 三个阶段若共用同一句文案，玩家就无法区分推进到哪一段，等于没有目标。
    expect(labels.size).toBe(level.waves.length);
    expect(subtitles.size).toBe(level.waves.length);
  });

  it('三十关全部阶段都有可读目标，且与无尽信息互斥', () => {
    for (const level of LEVELS) for (const wave of level.waves) {
      expect(wave.objective?.label.length).toBeGreaterThan(0);
      expect(wave.objective!.label.length).toBeLessThanOrEqual(4);
      expect(wave.objective?.subtitle).toBeTruthy();
      expect(wave.endless).toBeUndefined();
    }
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

  it('第三关只登记两面危墙，id 和坍塌参数完整', () => {
    const level = LEVELS.find((entry) => entry.id === 'level_3');
    expect(level).toBeDefined();
    if (!level) return;
    const breakables = (level.obstacles ?? []).flatMap((obstacle) => (
      obstacle.breakable ? [obstacle.breakable] : []
    ));
    expect(breakables.map((entry) => entry.id).sort())
      .toEqual(['level3-east-wall', 'level3-west-wall']);
    for (const breakable of breakables) {
      expect(breakable.health).toBe(260);
      expect(breakable.collapseDamage).toBe(220);
      expect(breakable.collapseRadius).toBe(126);
      expect(breakable.bossDamageFactor).toBe(0.25);
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
