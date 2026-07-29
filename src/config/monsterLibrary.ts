import { ITEMS, type ItemId } from './items';
import { LEVELS } from './levels';
import type { AmmoType, DropDef, ZombieDef } from './types';
import { WEAPONS, type WeaponId } from './weapons';
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
    summary: '生命较低，移动和攻击节奏明显快于普通感染体。',
    tactic: '进入近身范围前优先击杀，转向时给自己预留横向移动空间。',
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
    role: '中型耐久追击型',
    threat: 2,
    summary: '耐久高于基础感染体，速度保持中等，会持续占用正面火力。',
    tactic: '先处理身边的高速单位，再用稳定点射收掉，避免在换弹时被逼近。',
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
    summary: '生命很低，但冲刺速度和攻击频率都处于感染体前列。',
    tactic: '看到后立即转火，横向移动比直线后退更容易维持安全距离。',
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
    role: '低速消耗型',
    threat: 2,
    summary: '移动缓慢但生命高于普通感染体，常在敌群后方形成持续压力。',
    tactic: '无需立刻交出高价值弹药，先清理近身威胁，再利用穿透火力处理。',
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
    summary: '生命极低但移动和攻击节奏很快，容易从敌群缝隙贴近玩家。',
    tactic: '优先扫清移动方向上的个体，短点射即可击杀，不要让它们形成包夹。',
  },
  {
    id: 'stalker',
    dossierCode: 'INF-13',
    role: '高速均衡型',
    threat: 3,
    summary: '兼具稳定耐久、较快移速和较高接触伤害，能持续追随玩家转向。',
    tactic: '在其进入近身范围前持续削血，必要时用粉尘区切断追击。',
  },
  {
    id: 'oddity',
    dossierCode: 'INF-14',
    role: '高伤变异型',
    threat: 4,
    summary: '生命和移动速度均处于较高水平，近身攻击会快速压低生命。',
    tactic: '保留完整撤离路线并集中火力，避免同时承受多个个体的接触攻击。',
  },
  {
    id: 'tank_boss',
    dossierCode: 'APEX-01',
    role: '巨型重装首领',
    threat: 5,
    summary: '巨型坦克感染体，依靠极高生命与近身伤害正面推进。',
    tactic: '围绕大型掩体循环拉扯，保留高伤武器和场景爆炸物集中输出。',
  },
  {
    id: 'bomber_boss',
    dossierCode: 'APEX-02',
    role: '巨型爆破首领',
    threat: 5,
    summary: '高机动爆破首领，死亡爆炸的伤害和覆盖范围均大幅提升。',
    tactic: '始终保留撤离路线，最后一段生命必须在安全距离外完成击杀。',
  },
] as const satisfies readonly MonsterLibraryEntry[];

const AMMO_LABELS: Record<AmmoType, string> = {
  light: '轻型弹药',
  heavy: '重型弹药',
  shell: '霰弹',
};

export function getMonsterDefinition(entry: MonsterLibraryEntry): ZombieDef {
  return ZOMBIES[entry.id];
}

/** 同时检索普通波次和 Boss 配置，确保首领不会被遗漏。 */
export function getMonsterEncounterNames(monsterId: ZombieId): string[] {
  return LEVELS.filter((level) => {
    if (level.boss?.type === monsterId) return true;
    return level.waves.some((wave) => wave.enemies.some((enemy) => enemy.type === monsterId));
  }).map((level) => level.name);
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
    if (!drop.ammoType) return `配置异常：弹药类型缺失 · ${chance}`;
    return `${AMMO_LABELS[drop.ammoType]}${formatAmount(drop.amount, '+')} · ${chance}`;
  }

  if (drop.type === 'health') {
    return `生命补给${formatAmount(drop.amount, '+')} · ${chance}`;
  }

  if (drop.type === 'item') {
    if (!isItemId(drop.itemId)) return `配置异常：道具标识无效 · ${chance}`;
    return `${ITEMS[drop.itemId].name}${formatAmount(drop.amount, '×')} · ${chance}`;
  }

  if (!isWeaponId(drop.itemId)) return `配置异常：武器标识无效 · ${chance}`;
  return `${WEAPONS[drop.itemId].name}${formatAmount(drop.amount, '×')} · ${chance}`;
}

function formatAmount(amount: number | undefined, prefix: '+' | '×'): string {
  return amount === undefined ? '' : ` ${prefix}${amount}`;
}

function isItemId(value: string | undefined): value is ItemId {
  return value !== undefined && value in ITEMS;
}

function isWeaponId(value: string | undefined): value is WeaponId {
  return value !== undefined && value in WEAPONS;
}
