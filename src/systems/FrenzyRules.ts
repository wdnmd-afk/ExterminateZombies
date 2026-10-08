import { FRENZY_DURATION_MS, FRENZY_PRESET_IDS, FRENZY_REWARDS, type FrenzyPresetId, type FrenzyRewardId } from '../config/frenzy';

export type FrenzyPhase = 'hunting' | 'boss' | 'won' | 'timeout' | 'dead';
export interface FrenzyRun {
  presetId: FrenzyPresetId;
  phase: FrenzyPhase;
  elapsedMs: number;
  targets: Record<FrenzyRewardId, 'alive' | 'dropped' | 'collected'>;
  ammoUntilMs: number;
  breachUntilMs: number;
  kills: number;
  bestStreak: number;
  recordEligible: boolean;
}

export interface FrenzyScore {
  objectives: number;
  completion: number;
  time: number;
  combat: number;
  total: number;
}

export interface FrenzyRecord { score: number; elapsedMs: number }
export type FrenzyRecords = Record<string, Partial<Record<FrenzyPresetId, FrenzyRecord>>>;

export function createFrenzyRun(presetId: FrenzyPresetId): FrenzyRun {
  return {
    presetId, phase: 'hunting', elapsedMs: 0,
    targets: { ammo: 'alive', breach: 'alive', supply: 'alive' },
    ammoUntilMs: 0, breachUntilMs: 0, kills: 0, bestStreak: 0, recordEligible: true,
  };
}

export function isFrenzyRunning(run: FrenzyRun): boolean {
  return run.phase === 'hunting' || run.phase === 'boss';
}

export function advanceFrenzy(run: FrenzyRun, deltaMs: number, paused = false): void {
  if (paused || !isFrenzyRunning(run) || !Number.isFinite(deltaMs) || deltaMs <= 0) return;
  run.elapsedMs = Math.min(FRENZY_DURATION_MS, run.elapsedMs + deltaMs);
  if (run.elapsedMs >= FRENZY_DURATION_MS) finishFrenzy(run, 'timeout');
}

export function defeatFrenzyTarget(run: FrenzyRun, id: FrenzyRewardId): boolean {
  if (!isFrenzyRunning(run) || run.targets[id] !== 'alive') return false;
  run.targets[id] = 'dropped';
  return true;
}

export function collectFrenzyReward(run: FrenzyRun, id: FrenzyRewardId): boolean {
  if (!isFrenzyRunning(run) || run.targets[id] !== 'dropped') return false;
  run.targets[id] = 'collected';
  if (id === 'ammo') run.ammoUntilMs = run.elapsedMs + FRENZY_REWARDS.ammo.durationMs;
  if (id === 'breach') run.breachUntilMs = run.elapsedMs + FRENZY_REWARDS.breach.durationMs;
  if (Object.values(run.targets).every((status) => status === 'collected')) run.phase = 'boss';
  return true;
}

export function finishFrenzy(run: FrenzyRun, result: 'won' | 'timeout' | 'dead'): boolean {
  if (!isFrenzyRunning(run) || (result === 'won' && (run.phase !== 'boss' || run.elapsedMs >= FRENZY_DURATION_MS))) return false;
  run.phase = result;
  run.ammoUntilMs = 0;
  run.breachUntilMs = 0;
  return true;
}

export function frenzyAmmoFree(run: FrenzyRun | null | undefined): boolean {
  return Boolean(run && isFrenzyRunning(run) && run.elapsedMs < run.ammoUntilMs);
}

export function frenzyDamageMultiplier(run: FrenzyRun | null | undefined): number {
  return run && isFrenzyRunning(run) && run.elapsedMs < run.breachUntilMs ? 1.5 : 1;
}

export function getFrenzyScore(run: FrenzyRun): FrenzyScore {
  const objectives = Object.values(run.targets).filter((status) => status === 'collected').length * 2000;
  const completion = run.phase === 'won' ? 10_000 : 0;
  const time = run.phase === 'won' ? Math.floor(Math.max(0, FRENZY_DURATION_MS - run.elapsedMs) / 1000) * 100 : 0;
  const combat = Math.min(1000, run.kills * 5) + Math.min(1000, run.bestStreak * 10);
  return { objectives, completion, time, combat, total: objectives + completion + time + combat };
}

export function formatFrenzyTime(remainingMs: number): string {
  const seconds = Math.ceil(Math.max(0, remainingMs) / 1000);
  return `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`;
}

export function normalizeFrenzyRecords(value: unknown): FrenzyRecords {
  const result: FrenzyRecords = {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) return result;
  for (const [version, entries] of Object.entries(value)) {
    if (!/^hunt-v\d+$/.test(version) || !entries || typeof entries !== 'object' || Array.isArray(entries)) continue;
    const records: Partial<Record<FrenzyPresetId, FrenzyRecord>> = {};
    for (const preset of FRENZY_PRESET_IDS) {
      const entry: unknown = (entries as Record<string, unknown>)[preset];
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
      const { score, elapsedMs } = entry as Record<string, unknown>;
      if (typeof score !== 'number' || !Number.isSafeInteger(score) || score < 0) continue;
      if (typeof elapsedMs !== 'number' || !Number.isFinite(elapsedMs) || elapsedMs < 0 || elapsedMs >= FRENZY_DURATION_MS) continue;
      records[preset] = { score, elapsedMs };
    }
    result[version] = records;
  }
  return result;
}

export function updateFrenzyRecord(records: FrenzyRecords, version: string, run: FrenzyRun): boolean {
  if (run.phase !== 'won' || !run.recordEligible) return false;
  const score = getFrenzyScore(run).total;
  const previous = records[version]?.[run.presetId];
  if (previous && (previous.score > score || (previous.score === score && previous.elapsedMs <= run.elapsedMs))) return false;
  records[version] ??= {};
  records[version][run.presetId] = { score, elapsedMs: run.elapsedMs };
  return true;
}
