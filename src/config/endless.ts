import type {
  EndlessWaveKind,
  EndlessWaveMeta,
  WaveDef,
  WaveEnemyEntry,
  WaveRewardDef,
  ZombieScaling,
} from './types';
import type { BossZombieId, NormalZombieId } from './zombies';

type EndlessEnemyRole = 'fodder' | 'assault' | 'ranged' | 'elite' | 'volatile';

interface EndlessRosterEntry {
  type: NormalZombieId;
  unlockWave: number;
  weight: number;
  role: EndlessEnemyRole;
}

interface EndlessWaveProfile {
  totalFactor: number;
  intervalFactor: number;
  capBonus: number;
  roles: Partial<Record<EndlessEnemyRole, number>>;
  split: boolean;
  secondLeadIn: number;
}

/** 十波为一个章节；每章都有两次成长、一次战前补给和一个 Boss 收束。 */
export const ENDLESS_WAVE_PATTERN: readonly EndlessWaveKind[] = [
  'warmup',
  'assault',
  'supply',
  'swarm',
  'elite',
  'supply',
  'swarm',
  'tactical',
  'climax',
  'boss',
] as const;

export const ENDLESS_BOSS_ROTATION: readonly BossZombieId[] = [
  'tank_boss',
  'bomber_boss',
  'hunter_boss',
  'matriarch_boss',
] as const;

/** 无尽模式唯一普通敌人解锁表；职责标签决定它会进入哪类事件波。 */
const ENDLESS_ROSTER: readonly EndlessRosterEntry[] = [
  { type: 'walker', unlockWave: 1, weight: 8, role: 'fodder' },
  { type: 'runner', unlockWave: 2, weight: 5, role: 'assault' },
  { type: 'drifter', unlockWave: 2, weight: 4, role: 'fodder' },
  { type: 'lurker', unlockWave: 3, weight: 4, role: 'ranged' },
  { type: 'tank', unlockWave: 4, weight: 2, role: 'elite' },
  { type: 'crawler', unlockWave: 4, weight: 3, role: 'assault' },
  { type: 'rotting', unlockWave: 5, weight: 3, role: 'ranged' },
  { type: 'feral', unlockWave: 6, weight: 4, role: 'assault' },
  { type: 'bomber', unlockWave: 6, weight: 2, role: 'volatile' },
  { type: 'bloodied', unlockWave: 7, weight: 3, role: 'elite' },
  { type: 'stalker', unlockWave: 8, weight: 3, role: 'assault' },
  { type: 'headless', unlockWave: 9, weight: 2, role: 'elite' },
  { type: 'bloater', unlockWave: 10, weight: 2, role: 'volatile' },
  { type: 'oddity', unlockWave: 11, weight: 2, role: 'ranged' },
] as const;

const PROFILES: Record<EndlessWaveKind, EndlessWaveProfile> = {
  warmup: {
    totalFactor: 0.9,
    intervalFactor: 1.08,
    capBonus: -2,
    roles: { fodder: 1.8, assault: 0.65 },
    split: false,
    secondLeadIn: 0,
  },
  assault: {
    totalFactor: 1,
    intervalFactor: 0.92,
    capBonus: 1,
    roles: { fodder: 0.8, assault: 2, ranged: 0.55 },
    split: true,
    secondLeadIn: 1100,
  },
  supply: {
    totalFactor: 0.72,
    intervalFactor: 1.08,
    capBonus: -3,
    roles: { fodder: 1.6, assault: 0.8, ranged: 0.45 },
    split: false,
    secondLeadIn: 0,
  },
  swarm: {
    totalFactor: 1.35,
    intervalFactor: 0.78,
    capBonus: 5,
    roles: { fodder: 2.2, assault: 1.35 },
    split: true,
    secondLeadIn: 900,
  },
  elite: {
    totalFactor: 0.82,
    intervalFactor: 1.12,
    capBonus: -1,
    roles: { fodder: 0.7, ranged: 0.9, elite: 2.2 },
    split: true,
    secondLeadIn: 1500,
  },
  tactical: {
    totalFactor: 1.05,
    intervalFactor: 0.9,
    capBonus: 2,
    roles: { fodder: 0.9, assault: 0.65, ranged: 0.8, volatile: 2.4 },
    split: true,
    secondLeadIn: 1300,
  },
  climax: {
    totalFactor: 1.45,
    intervalFactor: 0.72,
    capBonus: 7,
    roles: { fodder: 1.2, assault: 1.25, ranged: 1, elite: 1, volatile: 1 },
    split: true,
    secondLeadIn: 700,
  },
  boss: {
    totalFactor: 0.62,
    intervalFactor: 0.95,
    capBonus: 2,
    roles: { fodder: 1.35, assault: 1, ranged: 0.55 },
    split: false,
    secondLeadIn: 0,
  },
};

const PRESENTATION: Record<EndlessWaveKind, Omit<EndlessWaveMeta, 'kind' | 'chapter' | 'chapterWave' | 'bossId'>> = {
  warmup: { label: '清扫', title: 'CLEANUP WAVE', subtitle: '脆弱感染体正在聚集', accent: 0xfbc02d },
  assault: { label: '突袭', title: 'ASSAULT WAVE', subtitle: '高速感染体将从多方向逼近', accent: 0xff9236 },
  supply: { label: '补给', title: 'SUPPLY WAVE', subtitle: '清场后获得军械补给', accent: 0x58c9dd },
  swarm: { label: '尸潮', title: 'HORDE WAVE', subtitle: '维持连杀，释放持续火力', accent: 0xef7f3d },
  elite: { label: '重装', title: 'ARMORED WAVE', subtitle: '优先击破高耐久目标', accent: 0xd65b47 },
  tactical: { label: '爆破', title: 'CHAIN WAVE', subtitle: '战场已布置连锁爆破机会', accent: 0xff6f4a },
  climax: { label: '极限', title: 'CLIMAX WAVE', subtitle: '章节高潮，敌群全面压上', accent: 0xef4b3a },
  boss: { label: '首领', title: 'BOSS WAVE', subtitle: '章节首领率领护卫进入战场', accent: 0xff6f4a },
};

export function getEndlessWaveKind(waveNumber: number): EndlessWaveKind {
  const normalized = Math.max(1, Math.floor(waveNumber));
  return ENDLESS_WAVE_PATTERN[(normalized - 1) % ENDLESS_WAVE_PATTERN.length];
}

export function getEndlessBossId(chapter: number): BossZombieId {
  const normalized = Math.max(1, Math.floor(chapter));
  return ENDLESS_BOSS_ROTATION[(normalized - 1) % ENDLESS_BOSS_ROTATION.length];
}

/** 章节 Boss 血量的每章复合增长率。1.18 = 每进一章硬 18%。 */
const ENDLESS_BOSS_HEALTH_GROWTH = 1.18;
/** 章节 Boss 伤害的每章线性增长率，配合下面的硬上限使用。 */
const ENDLESS_BOSS_DAMAGE_GROWTH = 0.06;
/**
 * 伤害缩放硬上限。
 *
 * 这不是调优余量，是**设计约束**：角色最大生命只有 80–140，Boss 技能单次伤害已经在
 * 20–34 一档。Boss 战被拉长到 12–18 秒之后，落在玩家身上的技能次数本身就翻了几倍；
 * 伤害若跟着血量一起无上限复合，第 10 章的一次震荡就能直接秒人，而玩家没有任何
 * 可以成长的抗性维度。压力交给血量（战斗更长 → 技能更多次）与阶段密度，不交给单次伤害。
 */
const ENDLESS_BOSS_DAMAGE_CAP = 1.5;

/**
 * 无尽模式章节 Boss 缩放。第 1 章为基线（两个倍率都是 1）。
 *
 * 血量走复合、伤害走封顶的线性：血量决定"这场打多久"，可以一直涨；
 * 伤害决定"玩家能挨几下"，必须有天花板。
 */
export function getEndlessBossScaling(chapter: number): ZombieScaling {
  const normalized = Math.max(1, Math.floor(chapter));
  const chaptersIn = normalized - 1;
  return {
    healthMultiplier: ENDLESS_BOSS_HEALTH_GROWTH ** chaptersIn,
    damageMultiplier: Math.min(
      ENDLESS_BOSS_DAMAGE_CAP,
      1 + chaptersIn * ENDLESS_BOSS_DAMAGE_GROWTH,
    ),
  };
}

export function getEndlessWaveMeta(waveNumber: number): EndlessWaveMeta {
  const normalized = Math.max(1, Math.floor(waveNumber));
  const chapter = Math.floor((normalized - 1) / ENDLESS_WAVE_PATTERN.length) + 1;
  const chapterWave = (normalized - 1) % ENDLESS_WAVE_PATTERN.length + 1;
  const kind = getEndlessWaveKind(normalized);
  const presentation = PRESENTATION[kind];
  return {
    kind,
    chapter,
    chapterWave,
    ...presentation,
    ...(kind === 'boss' ? { bossId: getEndlessBossId(chapter) } : {}),
  };
}

/** 无尽导演唯一波次生成入口。 */
export function createEndlessWave(waveNumber: number): WaveDef {
  const normalized = Math.max(1, Math.floor(waveNumber));
  const meta = getEndlessWaveMeta(normalized);
  const profile = PROFILES[meta.kind];
  const baseTotal = 6 + Math.floor((normalized - 1) * 1.5);
  const total = Math.max(4, Math.round(baseTotal * profile.totalFactor));
  const roster = resolveRoster(normalized, profile, total);
  const enemies = allocateEndlessEnemies(roster, total, normalized, profile.roles);
  const baseInterval = Math.max(180, 780 - (normalized - 1) * 24);
  const interval = Math.max(150, Math.round(baseInterval * profile.intervalFactor));
  const cap = Math.max(8, Math.min(42, 12 + Math.floor(normalized * 0.9) + profile.capBonus));
  const rewards = getEndlessWaveRewards(meta);

  if (meta.kind === 'boss' && meta.bossId) {
    return {
      startDelay: 2600,
      endless: meta,
      rewards,
      segments: [
        { enemies: [{ type: meta.bossId, count: 1 }], spawnInterval: 400, leadIn: 0, concurrentCap: cap },
        { enemies, spawnInterval: interval, leadIn: 1400, concurrentCap: cap },
      ],
    };
  }

  if (!profile.split || total < 8) {
    return {
      startDelay: meta.kind === 'supply' ? 2200 : 1800,
      rewards,
      endless: meta,
      segments: [{ enemies, spawnInterval: interval, leadIn: 0, concurrentCap: cap }],
    };
  }

  const [opening, release] = splitEnemyEntries(enemies, 0.42);
  return {
    startDelay: 1800,
    rewards,
    endless: meta,
    segments: [
      {
        enemies: opening,
        spawnInterval: Math.round(interval * 1.08),
        leadIn: 0,
        concurrentCap: Math.max(8, cap - 4),
      },
      {
        enemies: release,
        spawnInterval: Math.max(140, Math.round(interval * 0.84)),
        leadIn: profile.secondLeadIn,
        concurrentCap: cap,
      },
    ],
  };
}

function resolveRoster(
  waveNumber: number,
  profile: EndlessWaveProfile,
  total: number,
): EndlessRosterEntry[] {
  const selected = ENDLESS_ROSTER.filter(
    (entry) => entry.unlockWave <= waveNumber && (profile.roles[entry.role] ?? 0) > 0,
  );
  if (selected.length > 0) {
    // 极低总量时保留基础燃料，并优先带入最新解锁的角色，避免分配出大量 0 数量条目。
    return selected.length <= total
      ? selected
      : [selected[0], ...selected.slice(-(total - 1))];
  }
  return [ENDLESS_ROSTER[0]];
}

/** 先保证选中职责各有代表，再按加权最大余数法分配剩余名额。 */
function allocateEndlessEnemies(
  roster: readonly EndlessRosterEntry[],
  total: number,
  waveNumber: number,
  roleWeights: Partial<Record<EndlessEnemyRole, number>>,
): WaveEnemyEntry[] {
  const counts = new Map<NormalZombieId, number>();
  const guaranteed = total >= roster.length ? 1 : 0;
  roster.forEach((entry) => counts.set(entry.type, guaranteed));
  let remaining = Math.max(0, total - guaranteed * roster.length);
  const weighted = roster.map((entry, index) => ({
    entry,
    index,
    weight: entry.weight * (roleWeights[entry.role] ?? 1),
  }));
  const totalWeight = weighted.reduce((sum, entry) => sum + entry.weight, 0);
  let assigned = 0;
  const shares = weighted.map(({ entry, index, weight }) => {
    const exact = totalWeight > 0 ? remaining * weight / totalWeight : 0;
    const whole = Math.floor(exact);
    counts.set(entry.type, (counts.get(entry.type) ?? 0) + whole);
    assigned += whole;
    return {
      entry,
      fraction: exact - whole,
      tieBreak: (index - waveNumber + roster.length) % roster.length,
    };
  });
  remaining -= assigned;
  shares.sort((a, b) => b.fraction - a.fraction || a.tieBreak - b.tieBreak);
  for (let index = 0; index < remaining; index += 1) {
    const type = shares[index % shares.length].entry.type;
    counts.set(type, (counts.get(type) ?? 0) + 1);
  }

  return roster
    .map((entry) => ({ type: entry.type, count: counts.get(entry.type) ?? 0 }))
    .filter((entry) => entry.count > 0);
}

function splitEnemyEntries(entries: readonly WaveEnemyEntry[], ratio: number): [WaveEnemyEntry[], WaveEnemyEntry[]] {
  const total = entries.reduce((sum, entry) => sum + entry.count, 0);
  const openingTarget = Math.max(1, Math.min(total - 1, Math.round(total * ratio)));
  const openingCounts = entries.map((entry) => Math.floor(entry.count * ratio));
  let openingTotal = openingCounts.reduce((sum, count) => sum + count, 0);

  for (let index = 0; openingTotal < openingTarget; index = (index + 1) % entries.length) {
    if (openingCounts[index] >= entries[index].count) continue;
    openingCounts[index] += 1;
    openingTotal += 1;
  }

  const opening = entries
    .map((entry, index) => ({ type: entry.type, count: openingCounts[index] }))
    .filter((entry) => entry.count > 0);
  const release = entries
    .map((entry, index) => ({ type: entry.type, count: entry.count - openingCounts[index] }))
    .filter((entry) => entry.count > 0);
  return [opening, release];
}

function getEndlessWaveRewards(meta: EndlessWaveMeta): WaveRewardDef[] | undefined {
  if (meta.kind === 'boss') {
    return [
      { type: 'resupply', magazines: 2 },
      { type: 'medicine', medicineId: 'bandage', amount: 2 },
      { type: 'medicine', medicineId: 'medkit', amount: 1 },
      { type: 'medicine', medicineId: 'energy_drink', amount: 1 },
      { type: 'item', itemId: 'barrel_oil', amount: 1 },
      { type: 'enhancement' },
    ];
  }
  if (meta.kind === 'supply' && meta.chapterWave === 3) {
    return [{ type: 'resupply', magazines: 0.75 }, { type: 'enhancement' }];
  }
  if (meta.kind === 'supply' && meta.chapterWave === 6) {
    return [
      { type: 'resupply', magazines: 0.75 },
      { type: 'item', itemId: 'mine', amount: 1 },
      { type: 'item', itemId: 'barrel_flour', amount: 1 },
      { type: 'enhancement' },
    ];
  }
  if (meta.kind === 'climax') {
    return [
      { type: 'resupply', magazines: 1.25 },
      { type: 'medicine', medicineId: 'bandage', amount: 1 },
      { type: 'enhancement' },
    ];
  }
  return undefined;
}
