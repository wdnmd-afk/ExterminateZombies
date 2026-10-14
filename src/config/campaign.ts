import { LEVEL_TEMPLATES, type LevelTemplate } from './levelTemplates';
import type { LevelDef, WaveDef, WaveEnemyEntry, WaveRewardDef } from './types';
import { ZOMBIES, type NormalZombieId, type ZombieId } from './zombies';

interface CampaignMission {
  template: number;
  name: string;
  tactic: string;
  support?: NormalZombieId;
}

export const CAMPAIGN_MISSIONS: readonly CampaignMission[] = [
  { template: 1, name: '郊外', tactic: '保持移动，利用油桶清群' },
  { template: 2, name: '废车站', tactic: '广播引流，油桶连锁处理聚群' },
  { template: 3, name: '封锁城区', tactic: '引敌贴墙，爆破坍塌后换位' },
  { template: 4, name: '排水渠', tactic: '沿水道换位，先清高速追兵' },
  { template: 5, name: '检疫所', tactic: '横移躲冲锋，抓住猎杀者恢复窗口' },
  { template: 6, name: '货运场', tactic: '横向拉扯重装，弹链持续压制' },
  { template: 7, name: '塌陷街区', tactic: '先断远程火力，再处理爆炸目标' },
  { template: 8, name: '研究站', tactic: '借掩体切断弹道，避免中央久留' },
  { template: 9, name: '焚化厂', tactic: '拉开爆炸距离，利用油桶清群' },
  { template: 10, name: '感染源前哨', tactic: '先清召唤群，再打母体恢复窗口' },
  { template: 1, name: '外环回收', tactic: '横向清除快速侧翼，留出撤退口', support: 'stalker' },
  { template: 2, name: '中转车站', tactic: '交替启用广播，先打不受诱导的远程', support: 'rotting' },
  { template: 3, name: '危墙巷战', tactic: '引爆墙边敌群，用新缺口避开重装', support: 'bloater' },
  { template: 4, name: '暗渠穿行', tactic: '集中清除伏地群，别被侧翼包抄', support: 'stalker' },
  { template: 6, name: '装甲货场', tactic: '先拆重装前排，横移反打坦克冲锋', support: 'tank' },
  { template: 5, name: '隔离街区', tactic: '先切远程，沿四角掩体绕开追兵', support: 'lurker' },
  { template: 7, name: '裂隙防线', tactic: '不断切换阵地，爆炸前清空退路', support: 'stalker' },
  { template: 8, name: '实验封锁', tactic: '借掩体拆掉交叉火力，优先畸变行者', support: 'oddity' },
  { template: 9, name: '燃料回廊', tactic: '聚拢重装后引爆油桶，保留逃生侧', support: 'headless' },
  { template: 3, name: '爆破禁区', tactic: '危墙压群，换位躲开爆破者连环轰炸', support: 'bomber' },
  { template: 1, name: '外缘反攻', tactic: '先开侧翼缺口，避免高速群包围', support: 'feral' },
  { template: 2, name: '广播争夺', tactic: '广播牵走基础群，单独集火重装', support: 'tank' },
  { template: 3, name: '坍塌走廊', tactic: '等敌群密集再压墙，别浪费坍塌机会', support: 'headless' },
  { template: 4, name: '深渠突围', tactic: '先清远程封路者，再扫伏地追兵', support: 'oddity' },
  { template: 5, name: '猎杀封锁', tactic: '清出横移空间，惩罚猎杀者冲锋落空', support: 'feral' },
  { template: 6, name: '重装集散', tactic: '弹链压住重装，别让远程占据背后', support: 'oddity' },
  { template: 7, name: '破碎阵地', tactic: '快速切换火力，依次拆掉远程与重装', support: 'tank' },
  { template: 8, name: '核心实验室', tactic: '先拆最远火力点，再拉扯重装前排', support: 'bloater' },
  { template: 9, name: '最后焚化', tactic: '把重装引入爆炸区，留弹药应对追兵', support: 'tank' },
  { template: 10, name: '感染源核心', tactic: '清召唤、躲轰炸，用完整火力终结母体', support: 'oddity' },
];

const REGULAR_HEALTH_BUDGETS = [
  2100, 2300, 3600, 4600, 5600, 7000, 8300, 9600, 10900, 12200,
  14800, 16200, 17600, 19000, 20400, 23200, 24600, 26000, 27400, 28800,
  32000, 33400, 34800, 36200, 37600, 41400, 42800, 44200, 45600, 47000,
] as const;

const BOSSES: Partial<Record<number, { type: ZombieId; health: number; damage: number }>> = {
  2: { type: 'tank_boss', health: 0.2, damage: 0.5 },
  3: { type: 'bomber_boss', health: 0.4, damage: 0.6 },
  5: { type: 'hunter_boss', health: 0.4, damage: 0.65 },
  10: { type: 'matriarch_boss', health: 0.5, damage: 0.75 },
  15: { type: 'tank_boss', health: 0.7, damage: 0.85 },
  20: { type: 'bomber_boss', health: 1.25, damage: 0.95 },
  25: { type: 'hunter_boss', health: 1.2, damage: 1 },
  30: { type: 'matriarch_boss', health: 1.4, damage: 1.1 },
};

const STAGE_LABELS = ['进场', '压制', '破阵', '推进', '决战'];

function fitEnemies(mix: LevelTemplate['stages'][number]['mix'], budget: number, maxMeanHealth: number): WaveEnemyEntry[] {
  // 只改变出场数量，不抬高普通怪血量；整数余量留给可快速清掉的基础群。
  // 重装配方也必须保留爽杀目标，避免同预算换成纯肉盾后瞬间形成难度尖峰。
  const excessHealth = mix.reduce((sum, entry) => sum + entry.weight * (ZOMBIES[entry.type].health - maxMeanHealth), 0);
  if (excessHealth > 0) {
    const extraWalkers = Math.ceil(excessHealth / (maxMeanHealth - ZOMBIES.walker.health));
    const base = mix.find((entry) => entry.type === 'walker');
    if (base) base.weight += extraWalkers;
    else mix.unshift({ type: 'walker', weight: extraWalkers });
  }
  const totalWeight = mix.reduce((sum, entry) => sum + entry.weight * ZOMBIES[entry.type].health, 0);
  const enemies: WaveEnemyEntry[] = mix.map((entry) => ({
    type: entry.type,
    count: Math.floor(entry.weight * budget / totalWeight),
  })).filter((entry) => entry.count > 0);
  const used = enemies.reduce((sum, entry) => sum + entry.count * ZOMBIES[entry.type].health, 0);
  const fillerCount = Math.floor((budget - used) / ZOMBIES.walker.health);
  const walkers = enemies.find((entry) => entry.type === 'walker');
  if (walkers) walkers.count += fillerCount;
  else if (fillerCount > 0) enemies.unshift({ type: 'walker', count: fillerCount });
  return enemies;
}

function splitEnemies(enemies: WaveEnemyEntry[]): WaveEnemyEntry[][] {
  // 稀少的精英落在收束段，不在进场时同时把所有角色甩给玩家。
  return [0, 1, 2].map((segmentIndex) => enemies.flatMap((enemy) => {
    const warmup = Math.floor(enemy.count * 0.25);
    const pressure = Math.floor(enemy.count * 0.35);
    const count = [warmup, pressure, enemy.count - warmup - pressure][segmentIndex];
    return count > 0 ? [{ type: enemy.type, count }] : [];
  }));
}

function stationGroups(): WaveEnemyEntry[][][] {
  // 保留 4/4/3 索引，广播油桶与列队时刻仍由原脚本在相同节点触发。
  return [
    [[{ type: 'walker', count: 4 }], [{ type: 'walker', count: 2 }, { type: 'runner', count: 1 }], [{ type: 'walker', count: 1 }, { type: 'lurker', count: 1 }], [{ type: 'walker', count: 2 }, { type: 'runner', count: 1 }]],
    [[{ type: 'walker', count: 3 }, { type: 'runner', count: 2 }], [{ type: 'walker', count: 2 }, { type: 'lurker', count: 1 }], [{ type: 'tank', count: 1 }], [{ type: 'walker', count: 3 }, { type: 'runner', count: 1 }]],
    [[{ type: 'walker', count: 3 }, { type: 'runner', count: 1 }], [{ type: 'walker', count: 5 }], [{ type: 'walker', count: 3 }, { type: 'runner', count: 2 }, { type: 'lurker', count: 1 }]],
  ];
}

function getRewards(template: LevelTemplate, levelNumber: number, stageIndex: number, stageCount: number): WaveRewardDef[] {
  const rewards = levelNumber <= 10 ? structuredClone(template.stages[stageIndex].rewards) : [];
  if (levelNumber <= 2) return rewards;
  const hasBoss = BOSSES[levelNumber] !== undefined;
  if (stageIndex < stageCount - 1 || hasBoss) {
    rewards.push({ type: 'resupply', magazines: levelNumber >= 11 ? 3 : 2 });
  }
  if (stageIndex === 1 && !rewards.some((reward) => reward.type === 'medicine')) {
    rewards.push({ type: 'medicine', medicineId: 'medkit', amount: 1 });
  }
  if ((stageIndex === 0 || stageIndex === 2) && !rewards.some((reward) => reward.type === 'enhancement')) {
    rewards.push({ type: 'enhancement' });
  }
  return rewards;
}

function createWaves(template: LevelTemplate, mission: CampaignMission, levelNumber: number): WaveDef[] {
  const stageCount = levelNumber > 10 ? 5 : template.stages.length;
  const maxCap = Math.min(40, 10 + Math.ceil((levelNumber - 1) * 30 / 29));
  const baseInterval = 820 - (levelNumber - 1) * 16;
  const stageWeight = stageCount * 4 + stageCount * (stageCount - 1) / 2;
  return Array.from({ length: stageCount }, (_, stageIndex): WaveDef => {
    const sourceIndex = Math.round(stageIndex * (template.stages.length - 1) / (stageCount - 1));
    let mix = structuredClone(template.stages[sourceIndex].mix);
    if (levelNumber === 1) {
      mix = stageIndex === 0
        ? [{ type: 'walker', weight: 5 }, { type: 'drifter', weight: 2 }]
        : [{ type: 'walker', weight: 7 }, { type: 'runner', weight: stageIndex + 1 }];
    }
    if (mission.support && stageIndex > 0) {
      const support = mix.find((entry) => entry.type === mission.support);
      if (support) support.weight += 4;
      else mix.push({ type: mission.support, weight: 4 });
    }
    const budget = REGULAR_HEALTH_BUDGETS[levelNumber - 1] * (stageIndex + 4) / stageWeight;
    const groups = levelNumber === 2 ? stationGroups()[stageIndex] : splitEnemies(fitEnemies(mix, budget, 70 + levelNumber * 0.6));
    const stageProgress = stageIndex / (stageCount - 1);
    return {
      startDelay: stageIndex === 0 ? 2200 : 3200,
      objective: {
        label: STAGE_LABELS[stageIndex],
        title: `STAGE ${stageIndex + 1} · ${mission.name}`,
        subtitle: `${['建立清群路线', '处理侧翼压力', '集中火力破阵', '换位持续推进', '清场完成任务'][stageIndex]} · ${mission.tactic}`,
        accent: stageIndex === stageCount - 1 ? 0xff9236 : 0xfbc02d,
      },
      segments: groups.map((enemies, segmentIndex) => ({
        enemies,
        spawnInterval: baseInterval + Math.round((1 - stageProgress) * 120) + (segmentIndex === 0 ? 80 : 0),
        leadIn: segmentIndex === 0 ? 0 : 1800,
        concurrentCap: Math.max(6, maxCap - (stageCount - stageIndex - 1) - (segmentIndex === 0 ? 2 : 0)),
      })),
      rewards: getRewards(template, levelNumber, stageIndex, stageCount),
    };
  });
}

export function createCampaignLevels(): LevelDef[] {
  return CAMPAIGN_MISSIONS.map((mission, index) => {
    const levelNumber = index + 1;
    const template = LEVEL_TEMPLATES[mission.template - 1];
    const id = `level_${levelNumber}`;
    const boss = BOSSES[levelNumber];
    const transform = <Placement extends { x: number; y: number }>(placement: Placement): Placement => ({
      ...structuredClone(placement),
      x: levelNumber > 10 && levelNumber <= 20 ? 1280 - placement.x : placement.x,
      y: levelNumber > 20 ? 720 - placement.y : placement.y,
    });
    return {
      id,
      name: `第${levelNumber}关:${mission.name}`,
      briefing: levelNumber <= 9 ? template.briefing : `${mission.tactic}。\n第${Math.ceil(levelNumber / 5)}章 · ${boss ? '阶段补给后迎战首领' : '按阶段稳步清场，保持火力与退路'}。`,
      environmentId: template.id,
      props: template.props.map(transform),
      obstacles: template.obstacles?.map((obstacle) => ({
        ...transform(obstacle),
        rotation: levelNumber > 10 ? -(obstacle.rotation ?? 0) : obstacle.rotation,
        breakable: obstacle.breakable ? {
          ...obstacle.breakable,
          id: levelNumber <= 10 ? obstacle.breakable.id : `${id}-${obstacle.breakable.id}`,
        } : undefined,
      })),
      lures: template.lures?.map((lure) => ({
        ...transform(lure),
        id: levelNumber <= 10 ? lure.id : `${id}-${lure.id}`,
      })),
      waves: createWaves(template, mission, levelNumber),
      boss: boss ? {
        type: boss.type,
        scaling: { healthMultiplier: boss.health, damageMultiplier: boss.damage },
      } : null,
    };
  });
}
