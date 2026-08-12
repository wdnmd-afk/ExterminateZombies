import type { WaveDef, WaveEnemyEntry, WaveSegmentDef } from './types';

/**
 * 波次形状的统一取值入口。
 *
 * `WaveDef` 有单段与段落两种写法，任何读取敌群的地方都必须走这里，
 * 否则新增段落写法的关卡会在校验、统计和测试里被当成空波次。
 */

/** 同屏上限被占满时的重试间隔(毫秒)。够密以免出现可见空档，又不至于每帧都查。 */
export const CONCURRENT_CAP_RECHECK_MS = 220;

/** 把任意写法的阶段归一化为段落列表。单段写法折算为一个 `leadIn` 为 0 的段落。 */
export function getWaveSegments(wave: WaveDef): WaveSegmentDef[] {
  if (wave.segments) return wave.segments;
  return [{ enemies: wave.enemies, spawnInterval: wave.spawnInterval, leadIn: 0 }];
}

/** 阶段内全部敌群条目，按段落顺序展开（不合并同类型，保留各段落的编排意图）。 */
export function getWaveEnemyEntries(wave: WaveDef): WaveEnemyEntry[] {
  return getWaveSegments(wave).flatMap((segment) => segment.enemies);
}

/** 阶段内敌人总只数。 */
export function getWaveEnemyCount(wave: WaveDef): number {
  return getWaveEnemyEntries(wave).reduce((total, entry) => total + entry.count, 0);
}

/**
 * 阶段的生成排程时长(毫秒)：全部段落的静默时间加逐只生成间隔。
 *
 * 这是阶段时长的**下界**——即使玩家瞬间清空每一只，阶段也至少要这么久。
 * 实际时长由清杀速度与同屏上限共同决定，只能靠试玩测量。
 */
export function getWaveSpawnDurationMs(wave: WaveDef): number {
  return getWaveSegments(wave).reduce(
    (total, segment) => total
      + segment.leadIn
      + segment.enemies.reduce((sum, entry) => sum + entry.count, 0) * segment.spawnInterval,
    0,
  );
}

/** 关卡全部阶段的生成排程时长下界，含各阶段的准备时间。 */
export function getLevelSpawnDurationMs(waves: readonly WaveDef[]): number {
  return waves.reduce(
    (total, wave) => total + wave.startDelay + getWaveSpawnDurationMs(wave),
    0,
  );
}
