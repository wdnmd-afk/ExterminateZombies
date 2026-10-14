import {
  CORRIDOR_CARDS,
  CORRIDOR_LANE,
  CORRIDOR_MAX_ALLIES,
  CORRIDOR_MAX_BONUS_PROJECTILES,
  CORRIDOR_MAX_DAMAGE_STACKS,
  CORRIDOR_PHASES,
  CORRIDOR_PRESET_IDS,
  CORRIDOR_SURVIVAL_SCORE_PER_SECOND,
  type CorridorCardKind,
  type CorridorPresetId,
} from '../config/corridor';

/**
 * 通道模式纯规则。与 `FrenzyRules` 同一纪律:不 import Phaser、不碰场景,
 * 全部状态推进可在 node 里穷举测试。
 */

export type CorridorPhase = 'running' | 'breached' | 'dead';

export interface CorridorRun {
  presetId: CorridorPresetId;
  phase: CorridorPhase;
  elapsedMs: number;
  /** 弹道增幅已叠层数(每层 +1 弹)。 */
  bonusProjectiles: number;
  /** 火力强化已叠层数(每层伤害 ×1.25)。 */
  damageStacks: number;
  alliesSummoned: number;
  cardKills: number;
  /** 击破卡片累计得分(独立于击杀分,结算页分开展示)。 */
  cardScore: number;
  recordEligible: boolean;
}

export function createCorridorRun(presetId: CorridorPresetId): CorridorRun {
  return {
    presetId,
    phase: 'running',
    elapsedMs: 0,
    bonusProjectiles: 0,
    damageStacks: 0,
    alliesSummoned: 0,
    cardKills: 0,
    cardScore: 0,
    recordEligible: true,
  };
}

export function isCorridorRunning(run: CorridorRun | null | undefined): boolean {
  return run?.phase === 'running';
}

/** 无上限计时:通道模式是一局多长冲多高的得分制,不设时长封顶。 */
export function advanceCorridor(run: CorridorRun, deltaMs: number): void {
  if (!isCorridorRunning(run) || !Number.isFinite(deltaMs) || deltaMs <= 0) return;
  run.elapsedMs += deltaMs;
}

/** 幂等终态推进。返回 false 表示已是终态或入参不成立。 */
export function finishCorridor(run: CorridorRun, result: 'breached' | 'dead'): boolean {
  if (!isCorridorRunning(run)) return false;
  run.phase = result;
  return true;
}

export function addCorridorBonusProjectile(run: CorridorRun): boolean {
  if (!isCorridorRunning(run) || run.bonusProjectiles >= CORRIDOR_MAX_BONUS_PROJECTILES) return false;
  run.bonusProjectiles += 1;
  return true;
}

export function addCorridorDamageStack(run: CorridorRun): boolean {
  if (!isCorridorRunning(run) || run.damageStacks >= CORRIDOR_MAX_DAMAGE_STACKS) return false;
  run.damageStacks += 1;
  return true;
}

export function addCorridorAlly(run: CorridorRun): boolean {
  if (!isCorridorRunning(run) || run.alliesSummoned >= CORRIDOR_MAX_ALLIES) return false;
  run.alliesSummoned += 1;
  return true;
}

export function addCorridorCardScore(run: CorridorRun, kind: CorridorCardKind): boolean {
  if (!isCorridorRunning(run)) return false;
  run.cardKills += 1;
  run.cardScore += CORRIDOR_CARDS[kind].scoreBonus;
  return true;
}

/**
 * 本帧齐射加成:extraBursts 加入连发循环,damageFactor 乘进伤害倍率。
 * 关卡只剩手枪 Hide 之类边界;伤害因子用幂次叠加,浮点确定性足够。
 */
export function resolveCorridorVolleyBonus(run: CorridorRun | null | undefined): {
  extraBursts: number;
  damageFactor: number;
} {
  if (!run || !isCorridorRunning(run)) return { extraBursts: 0, damageFactor: 1 };
  return {
    extraBursts: run.bonusProjectiles,
    damageFactor: 1.25 ** run.damageStacks,
  };
}

/** 结算总分加成:存活奖励 = 存活秒 ×2。与击杀分、卡片分相加为最终分。 */
export function getCorridorSurvivalBonus(run: CorridorRun): number {
  return Math.floor(Math.max(0, run.elapsedMs) / 1000) * CORRIDOR_SURVIVAL_SCORE_PER_SECOND;
}

export interface CorridorRecord { score: number; elapsedMs: number }
export type CorridorRecords = Record<string, Partial<Record<CorridorPresetId, CorridorRecord>>>;

export function normalizeCorridorRecords(value: unknown): CorridorRecords {
  const result: CorridorRecords = {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) return result;
  for (const [version, entries] of Object.entries(value)) {
    if (!/^lane-v\d+$/.test(version) || !entries || typeof entries !== 'object' || Array.isArray(entries)) continue;
    const records: Partial<Record<CorridorPresetId, CorridorRecord>> = {};
    for (const preset of CORRIDOR_PRESET_IDS) {
      const entry: unknown = (entries as Record<string, unknown>)[preset];
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
      const { score, elapsedMs } = entry as Record<string, unknown>;
      if (typeof score !== 'number' || !Number.isSafeInteger(score) || score < 0) continue;
      if (typeof elapsedMs !== 'number' || !Number.isFinite(elapsedMs) || elapsedMs < 0) continue;
      records[preset] = { score, elapsedMs };
    }
    result[version] = records;
  }
  return result;
}

/**
 * 通道是得分制:漏怪(突击失败)与阵亡都记成绩,好分不打折。
 * 同分取更短用时(冲分效率)。
 */
export function updateCorridorRecord(
  records: CorridorRecords,
  version: string,
  run: CorridorRun,
  totalScore: number,
): boolean {
  if (!run.recordEligible || !Number.isSafeInteger(totalScore) || totalScore < 0) return false;
  const previous = records[version]?.[run.presetId];
  if (previous && (previous.score > totalScore
    || (previous.score === totalScore && previous.elapsedMs <= run.elapsedMs))) return false;
  records[version] ??= {};
  records[version][run.presetId] = { score: totalScore, elapsedMs: run.elapsedMs };
  return true;
}

/** 结算页/HUD 可读的通道带信息(供文案与测试,in-line 几何断言不动 Phaser)。 */
export function getCorridorLaneSummary(): string {
  return `道具 ${CORRIDOR_LANE.item.centerY} / 主线 ${CORRIDOR_LANE.main.centerY} / 队友 ${CORRIDOR_LANE.ally.centerY}`;
}

/** mm:ss 显示;入参为负或非有限时返零。 */
export function formatCorridorTime(elapsedMs: number): string {
  const seconds = Math.floor(Math.max(0, elapsedMs) / 1000);
  return `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`;
}

export interface CorridorPhaseSummary {
  index: number;
  name: string;
  phase: (typeof CORRIDOR_PHASES)[number];
}

/** 按已推进时间解析当前阶段;时间早于首阶段也归到第 0 阶段。 */
export function resolveCorridorPhase(elapsedMs: number): CorridorPhaseSummary {
  let index = 0;
  for (let cursor = CORRIDOR_PHASES.length - 1; cursor >= 0; cursor -= 1) {
    if (elapsedMs >= CORRIDOR_PHASES[cursor].fromMs) {
      index = cursor;
      break;
    }
  }
  const phase = CORRIDOR_PHASES[index];
  return { index, name: phase.name, phase };
}
