import { ITEMS, type ItemId } from './items';
import { LEVELS } from './levels';
import type { AmmoType, DropDef, ZombieDef } from './types';
import { MEDICINES } from './medicine';
import { getWaveEnemyEntries } from './waveShape';
import { ZOMBIES, type ZombieId } from './zombies';

export type MonsterThreat = 1 | 2 | 3 | 4 | 5;

/**
 * 图鉴只维护无法从玩法配置推导的展示信息。
 * 战斗数值、掉落和出现关卡始终从真实配置读取，避免两套数据长期漂移。
 */
export interface MonsterLibraryEntry {
  id: ZombieId;
  dossierCode: string;
  role: string;
  threat: MonsterThreat;
  summary: string;
  tactic: string;
}

export const MONSTER_LIBRARY = [
  {
    id: 'walker',
    dossierCode: 'INF-01',
    role: '基础追击型',
    threat: 1,
    summary: '行动迟缓，但会依靠数量持续压缩移动空间。',
    tactic: '保持移动并优先清理密集方向，避免被多个个体封住退路。',
  },
  {
    id: 'runner',
    dossierCode: 'INF-02',
    role: '高速突进型',
    threat: 2,
    summary: '生命较低，接近中距离后会短暂蓄力并向玩家所在方向冲刺。',
    tactic: '看到黄色冲刺预警后横向移动，利用其冲刺后的恢复窗口反击。',
  },
  {
    id: 'tank',
    dossierCode: 'INF-03',
    role: '重装压迫型',
    threat: 3,
    summary: '速度缓慢但生命与接触伤害很高，会长期占据火力。',
    tactic: '利用掩体和穿透武器持续拉扯，附近有爆炸物时优先借环境削血。',
  },
  {
    id: 'bomber',
    dossierCode: 'INF-04',
    role: '死亡爆炸型',
    threat: 4,
    summary: '本体并不耐打，但死亡后会立即制造危险爆炸区域。',
    tactic: '在远距离完成击杀，不要在玩家、掉落物或连锁爆炸物附近引爆。',
  },
  {
    id: 'lurker',
    dossierCode: 'INF-05',
    role: '远程压制型',
    threat: 2,
    summary: '耐久高于基础感染体，会在中距离蓄力并发射可躲避投射物。',
    tactic: '观察蓝色预警后保持横向移动，优先在其攻击恢复期集中处理。',
  },
  {
    id: 'drifter',
    dossierCode: 'INF-06',
    role: '均衡游荡型',
    threat: 2,
    summary: '移动、耐久和接触伤害都略高于普通感染体，缺少明显短板。',
    tactic: '不要把它当成普通目标拖到近身，利用转向间隙尽早削减数量。',
  },
  {
    id: 'feral',
    dossierCode: 'INF-07',
    role: '轻型高速突进型',
    threat: 3,
    summary: '生命很低，但会以更短前摇发动高速冲刺。',
    tactic: '不要直线后退；在冲刺预警出现后横向躲开，并在恢复期快速击杀。',
  },
  {
    id: 'bloodied',
    dossierCode: 'INF-08',
    role: '高伤耐久型',
    threat: 3,
    summary: '速度不快，却能承受持续射击并造成较高接触伤害。',
    tactic: '用霰弹或穿透火力集中处理，不要让它混在快速敌人后方持续推进。',
  },
  {
    id: 'headless',
    dossierCode: 'INF-09',
    role: '重型耐久型',
    threat: 3,
    summary: '拥有很高生命值和近身伤害，以缓慢移动换取持续压迫能力。',
    tactic: '围绕障碍物拉扯并控制弹药消耗，优先利用场景爆炸物削血。',
  },
  {
    id: 'rotting',
    dossierCode: 'INF-10',
    role: '低速投射型',
    threat: 2,
    summary: '移动缓慢但会在敌群后方投射腐蚀弹，持续压缩玩家的固定拉扯路线。',
    tactic: '先躲开投射物，再利用其长前摇与恢复期用穿透火力处理。',
  },
  {
    id: 'bloater',
    dossierCode: 'INF-11',
    role: '死亡爆炸重型',
    threat: 4,
    summary: '体型庞大、耐久很高，死亡时会在近距离释放爆炸。',
    tactic: '保持距离完成最后一击，避免让它在玩家、掉落物或连锁爆炸物附近死亡。',
  },
  {
    id: 'crawler',
    dossierCode: 'INF-12',
    role: '低矮高速型',
    threat: 3,
    summary: '生命极低但会贴地蓄力冲刺，容易从敌群缝隙贴近玩家。',
    tactic: '优先扫清移动方向上的个体，并在短前摇内横移避开冲刺。',
  },
  {
    id: 'stalker',
    dossierCode: 'INF-13',
    role: '伏击冲刺型',
    threat: 3,
    summary: '兼具稳定耐久与较快移速，进入中距离后会蓄力冲刺追击玩家。',
    tactic: '在其冲刺前摇中预留侧向路线，必要时用粉尘区切断后续追击。',
  },
  {
    id: 'oddity',
    dossierCode: 'INF-14',
    role: '高伤投射型',
    threat: 4,
    summary: '生命和移动速度均处于较高水平，会以更快的投射物封锁移动路线。',
    tactic: '保留完整撤离路线，在其蓝色攻击预警出现后优先横移并集中火力。',
  },
  {
    id: 'tank_boss',
    dossierCode: 'APEX-01',
    role: '震荡重装首领',
    threat: 5,
    summary: '巨型坦克会蓄力释放大范围震荡；装甲过载后锁定方向冲锋，残血进入破片风暴，向整圈均匀抛出慢速弹幕。',
    tactic: '躲开红色震荡圈与黄色冲锋带，在绿色破甲提示期间集中火力；环射看脚下预警起手，从弹幕缺口穿出去而不是硬吃。',
  },
  {
    id: 'bomber_boss',
    dossierCode: 'APEX-02',
    role: '区域轰炸首领',
    threat: 5,
    summary: '高机动爆破首领会锁定玩家位置进行区域轰炸；半血后进入爆燃过载并以近身震荡引爆场景物，残血转入饱和轰炸，一次撒下五个错开引爆的爆点。',
    tactic: '远距离持续离开轰炸落点，过载后不要贴身或停在油桶旁；饱和轰炸期间预警圈涨得越慢的越晚炸，顺着这个顺序连续位移。',
  },
  {
    id: 'hunter_boss',
    dossierCode: 'APEX-03',
    role: '高速突进首领',
    threat: 5,
    summary: '猩红猎杀者会在中远距离蓄力突进；半血后进入猎杀狂热并用近身震荡封锁贴身路线，残血甩出尾刺散射——一束高速窄扇，越近越密。',
    tactic: '冲锋方向带出现后横向变向，过载后不要贴身贪枪；进入尾刺阶段后冲锋落地就往侧面拉开，别再站在它正面输出。',
  },
  {
    id: 'matriarch_boss',
    dossierCode: 'APEX-04',
    role: '终局远程炮台',
    threat: 5,
    summary: '腐化母体会持续发射高伤投射物；生命降至六成后唤醒母巢叠加区域轰炸，跌破三成开始产卵，成批放出伏地感染体与狂乱者。',
    tactic: '用障碍物阻挡直射弹，并持续离开轰炸落点；紫色落点圈亮起时优先清掉刚产出的快速杂兵，别让它们把你从掩体后逼出来。血条见底前拉开距离，避免死亡爆炸。',
  },
] as const satisfies readonly MonsterLibraryEntry[];

const AMMO_LABELS: Record<AmmoType, string> = {
  light: '轻型弹药',
  heavy: '重型弹药',
  shell: '霰弹',
  explosive: '爆炸弹药',
  belt: '机枪弹链',
  fuel: '燃料罐',
  energy: '能量电池',
};

export function getMonsterDefinition(entry: MonsterLibraryEntry): ZombieDef {
  return ZOMBIES[entry.id];
}

export interface MonsterEncounter {
  /** 关卡序号，从 1 开始；图鉴在条目过多时用它压缩展示。 */
  ordinal: number;
  name: string;
}

/** 同时检索普通波次和 Boss 配置，确保首领不会被遗漏。 */
export function getMonsterEncounters(monsterId: ZombieId): MonsterEncounter[] {
  return LEVELS
    .map((level, index) => ({ ordinal: index + 1, level }))
    .filter(({ level }) => {
      if (level.boss?.type === monsterId) return true;
      return level.waves.some(
        (wave) => getWaveEnemyEntries(wave).some((enemy) => enemy.type === monsterId),
      );
    })
    .map(({ ordinal, level }) => ({ ordinal, name: level.name }));
}

export function getMonsterDropLines(monsterId: ZombieId): string[] {
  const definition: ZombieDef = ZOMBIES[monsterId];
  const lines = definition.drops.map(formatDropLine);
  return lines.length > 0 ? lines : ['无已配置掉落'];
}

export function getMonsterDeathHazard(monsterId: ZombieId): string {
  const definition: ZombieDef = ZOMBIES[monsterId];
  const explosion = definition.explodeOnDeath;
  if (!explosion) return '死亡后无额外区域伤害';
  return `死亡爆炸 ${explosion.damage} 伤害 · 半径 ${explosion.radius}`;
}

function formatDropLine(drop: DropDef): string {
  const chance = `${Math.round(drop.chance * 100)}%`;

  if (drop.type === 'ammo') {
    if (drop.ammoMode === 'adaptive') return `自适应弹药补给 · ${chance}`;
    return `${AMMO_LABELS[drop.ammoType]}${formatAmount(drop.amount, '+')} · ${chance}`;
  }

  if (drop.type === 'item') {
    if (!isItemId(drop.itemId)) return `配置异常：道具标识无效 · ${chance}`;
    return `${ITEMS[drop.itemId].name}${formatAmount(drop.amount, '×')} · ${chance}`;
  }

  if (drop.type === 'medicine') {
    const medicine = MEDICINES[drop.medicineId];
    if (!medicine) return `配置异常：药品标识无效 · ${chance}`;
    return `${medicine.name}${formatAmount(drop.amount, '×')} · ${chance}`;
  }

  if (drop.type === 'enhancement_pack') {
    return `武器强化包 · ${chance}`;
  }

  return `配置异常：未知掉落类型 · ${chance}`;
}

function formatAmount(amount: number | undefined, prefix: '+' | '×'): string {
  return amount === undefined ? '' : ` ${prefix}${amount}`;
}

function isItemId(value: string | undefined): value is ItemId {
  return value !== undefined && value in ITEMS;
}
