import Phaser from 'phaser';
import { LEVELS } from '../config/levels';
import type { WaveDef, WaveEnemyEntry, WaveSegmentDef } from '../config/types';
import { CONCURRENT_CAP_RECHECK_MS, getWaveSegments } from '../config/waveShape';
import type { NormalZombieId, ZombieId } from '../config/zombies';
import type { GameMode } from './GameState';

type WaveState =
  | 'pending'
  | 'segment_pending'
  | 'spawning'
  | 'waiting_clear'
  | 'waiting_reward'
  | 'complete';

/** 无尽模式只刷普通感染体；Boss 由下面的固定波次规则单独插入。 */
type EndlessEnemyId = NormalZombieId;

interface EndlessRosterEntry {
  type: EndlessEnemyId;
  unlockWave: number;
  weight: number;
}

/** 无尽模式的唯一敌人解锁表；新增类型只需在这里声明波次和相对占比。 */
const ENDLESS_ROSTER = [
  { type: 'walker', unlockWave: 1, weight: 8 },
  { type: 'runner', unlockWave: 2, weight: 5 },
  { type: 'drifter', unlockWave: 2, weight: 4 },
  { type: 'lurker', unlockWave: 3, weight: 4 },
  { type: 'tank', unlockWave: 4, weight: 2 },
  { type: 'crawler', unlockWave: 4, weight: 3 },
  { type: 'rotting', unlockWave: 5, weight: 3 },
  { type: 'feral', unlockWave: 6, weight: 4 },
  { type: 'bomber', unlockWave: 6, weight: 2 },
  { type: 'bloodied', unlockWave: 7, weight: 3 },
  { type: 'stalker', unlockWave: 8, weight: 3 },
  { type: 'headless', unlockWave: 9, weight: 2 },
  { type: 'bloater', unlockWave: 10, weight: 2 },
  { type: 'oddity', unlockWave: 11, weight: 2 },
] as const satisfies readonly EndlessRosterEntry[];

interface WaveManagerOptions {
  scene: Phaser.Scene;
  mode: GameMode;
  levelId: string | null;
  spawnZombie: (typeId: ZombieId) => void;
  hasAliveEnemies: () => boolean;
  /** 场上活跃感染体只数，用于段落的同屏上限节流。 */
  getActiveEnemyCount: () => number;
  onWaveStarted: (waveNumber: number, wave: WaveDef) => void;
  /** 段落开始生成时回调。`waveIndex` / `segmentIndex` 均为 0 起始，供剧本时刻定位。 */
  onSegmentStarted?: (waveIndex: number, segmentIndex: number) => void;
  onWaveCleared: (waveNumber: number, wave: WaveDef) => boolean;
  onComplete: () => void;
}

/**
 * 统一管理固定关卡波次与无尽模式程序化波次。
 */
export class WaveManager {
  private scene: Phaser.Scene;
  private mode: GameMode;
  private spawnZombie: (typeId: ZombieId) => void;
  private hasAliveEnemies: () => boolean;
  private getActiveEnemyCount: () => number;
  private onWaveStarted: (waveNumber: number, wave: WaveDef) => void;
  private onSegmentStarted?: (waveIndex: number, segmentIndex: number) => void;
  private onComplete: () => void;
  private onWaveCleared: (waveNumber: number, wave: WaveDef) => boolean;

  private state: WaveState = 'complete';
  private currentIndex = -1;
  private currentWave: WaveDef | null = null;
  private levelWaves: WaveDef[] = [];
  private endlessCache = new Map<number, WaveDef>();
  /** 当前阶段归一化后的段落列表与进度。 */
  private segments: WaveSegmentDef[] = [];
  private currentSegmentIndex = -1;
  private pendingSpawns: ZombieId[] = [];
  private nextTransitionAt = 0;
  private nextSpawnAt = 0;

  constructor(options: WaveManagerOptions) {
    this.scene = options.scene;
    this.mode = options.mode;
    const level = LEVELS.find((entry) => entry.id === options.levelId) ?? LEVELS[0] ?? null;
    this.spawnZombie = options.spawnZombie;
    this.hasAliveEnemies = options.hasAliveEnemies;
    this.getActiveEnemyCount = options.getActiveEnemyCount;
    this.onWaveStarted = options.onWaveStarted;
    this.onSegmentStarted = options.onSegmentStarted;
    this.onWaveCleared = options.onWaveCleared;
    this.onComplete = options.onComplete;

    if (level) {
      this.levelWaves = [...level.waves];
      if (level.boss) {
        this.levelWaves.push({
          enemies: [{ type: level.boss.type, count: 1 }],
          spawnInterval: 400,
          startDelay: 2400,
        });
      }
    }
  }

  start(now = this.scene.time.now): void {
    this.scheduleWave(0, now);
  }

  /**
   * 把波次节拍整体后移 `offset` 毫秒，供战场解除冻结时调用。
   * 场景时钟在冻结期间仍跟随真实时间前进，不平移的话恢复瞬间
   * `now` 会远超两个时间点，本波剩余敌人会在几帧内全部刷完。
   */
  shiftTimers(offset: number): void {
    this.nextTransitionAt += offset;
    this.nextSpawnAt += offset;
  }

  update(now: number): void {
    if (this.state === 'complete' || !this.currentWave) return;

    if (this.state === 'pending' && now >= this.nextTransitionAt) {
      this.onWaveStarted(this.currentIndex + 1, this.currentWave);
      this.beginSegment(0, now);
      return;
    }

    if (this.state === 'segment_pending' && now >= this.nextTransitionAt) {
      this.state = 'spawning';
      this.nextSpawnAt = now;
      return;
    }

    if (this.state === 'spawning' && now >= this.nextSpawnAt) {
      const segment = this.segments[this.currentSegmentIndex];
      // 同屏上限：占满时只推迟下一次检查，不消耗队列，也不跳过任何一只。
      if (segment?.concurrentCap !== undefined
        && this.getActiveEnemyCount() >= segment.concurrentCap) {
        this.nextSpawnAt = now + CONCURRENT_CAP_RECHECK_MS;
        return;
      }

      const nextZombie = this.pendingSpawns.shift();
      if (nextZombie) {
        this.spawnZombie(nextZombie);
      }

      if (this.pendingSpawns.length === 0) {
        const nextSegmentIndex = this.currentSegmentIndex + 1;
        if (nextSegmentIndex < this.segments.length) {
          this.beginSegment(nextSegmentIndex, now);
        } else {
          this.state = 'waiting_clear';
        }
      } else {
        this.nextSpawnAt = now + (segment?.spawnInterval ?? 500);
      }
      return;
    }

    if (this.state === 'waiting_clear' && !this.hasAliveEnemies()) {
      if (this.onWaveCleared(this.currentIndex + 1, this.currentWave)) {
        this.state = 'waiting_reward';
        return;
      }
      this.scheduleWave(this.currentIndex + 1, now);
    }
  }

  /** 强化选择等阶段奖励结算完成后，由场景显式放行下一阶段。 */
  continueAfterReward(now = this.scene.time.now): void {
    if (this.state !== 'waiting_reward') return;
    this.scheduleWave(this.currentIndex + 1, now);
  }

  /**
   * 当前生成进度快照。供性能压测把帧率与「当时的同屏上限、剩余队列」对应起来，
   * 否则只拿到一个孤立的 FPS 数字无法判断是哪一段落造成的压力。
   */
  getProgressSnapshot(): {
    waveIndex: number;
    segmentIndex: number;
    segmentCount: number;
    concurrentCap: number | null;
    pendingInSegment: number;
    state: string;
  } {
    return {
      waveIndex: this.currentIndex,
      segmentIndex: this.currentSegmentIndex,
      segmentCount: this.segments.length,
      concurrentCap: this.segments[this.currentSegmentIndex]?.concurrentCap ?? null,
      pendingInSegment: this.pendingSpawns.length,
      state: this.state,
    };
  }

  private scheduleWave(index: number, now: number): void {
    const wave = this.getWave(index);
    if (!wave) {
      this.state = 'complete';
      this.onComplete();
      return;
    }

    this.currentIndex = index;
    this.currentWave = wave;
    this.segments = getWaveSegments(wave);
    this.currentSegmentIndex = -1;
    this.pendingSpawns = [];
    this.state = 'pending';
    this.nextTransitionAt = now + wave.startDelay;
  }

  /**
   * 进入某个段落。
   * 只在段落内部打乱生成顺序：跨段落打乱会抹掉「先热身再引入新敌人」的编排意图。
   */
  private beginSegment(index: number, now: number): void {
    const segment = this.segments[index];
    if (!segment) {
      this.state = 'waiting_clear';
      return;
    }

    this.currentSegmentIndex = index;
    this.pendingSpawns = this.expandEnemies(segment);
    this.shuffle(this.pendingSpawns);
    this.onSegmentStarted?.(this.currentIndex, index);

    if (segment.leadIn > 0) {
      this.state = 'segment_pending';
      this.nextTransitionAt = now + segment.leadIn;
      return;
    }
    this.state = 'spawning';
    this.nextSpawnAt = now;
  }

  private getWave(index: number): WaveDef | null {
    if (this.mode === 'level') {
      return this.levelWaves[index] ?? null;
    }

    const cached = this.endlessCache.get(index);
    if (cached) return cached;

    const created = this.createEndlessWave(index);
    this.endlessCache.set(index, created);
    return created;
  }

  private expandEnemies(segment: WaveSegmentDef): ZombieId[] {
    const queue: ZombieId[] = [];
    for (const entry of segment.enemies) {
      for (let i = 0; i < entry.count; i++) {
        queue.push(entry.type);
      }
    }
    return queue;
  }

  private createEndlessWave(index: number): WaveDef {
    const waveNumber = index + 1;
    const total = 6 + Math.floor(index * 1.5);
    const unlocked = ENDLESS_ROSTER.filter((entry) => entry.unlockWave <= waveNumber);
    // 当前曲线在全部类型解锁时仍有足够总量保证每类至少出现一次；保留截断防未来调小总量。
    const roster = unlocked.length <= total
      ? unlocked
      : [unlocked[0], ...unlocked.slice(-(total - 1))];
    const enemies = this.allocateEndlessEnemies(roster, total, waveNumber);

    if (waveNumber % 15 === 0) {
      enemies.push({ type: 'bomber_boss', count: 1 });
    } else if (waveNumber % 10 === 0) {
      enemies.push({ type: 'tank_boss', count: 1 });
    }

    // 无尽模式继续使用单段写法：它的节奏来自波次曲线，不需要阶段内段落。
    return {
      enemies,
      spawnInterval: Math.max(220, 780 - index * 30),
      startDelay: 1800,
    };
  }

  /** 先保证每个已解锁类型出现，再按权重用最大余数法分配剩余名额。 */
  private allocateEndlessEnemies(
    roster: readonly EndlessRosterEntry[],
    total: number,
    waveNumber: number,
  ): WaveEnemyEntry[] {
    if (roster.length === 0 || total <= 0) return [];

    const counts = new Map<EndlessEnemyId, number>();
    roster.forEach((entry) => counts.set(entry.type, 1));
    const remaining = Math.max(0, total - roster.length);
    const totalWeight = roster.reduce((sum, entry) => sum + entry.weight, 0);
    let assigned = 0;

    const shares = roster.map((entry, rosterIndex) => {
      const exact = remaining * entry.weight / totalWeight;
      const whole = Math.floor(exact);
      counts.set(entry.type, (counts.get(entry.type) ?? 0) + whole);
      assigned += whole;
      return {
        entry,
        fraction: exact - whole,
        // 同余时按波次轮换，避免固定类型长期吃到所有尾数。
        tieBreak: (rosterIndex - waveNumber + roster.length) % roster.length,
      };
    });

    shares.sort((a, b) => b.fraction - a.fraction || a.tieBreak - b.tieBreak);
    for (let i = 0; i < remaining - assigned; i++) {
      const typeId = shares[i % shares.length].entry.type;
      counts.set(typeId, (counts.get(typeId) ?? 0) + 1);
    }

    return roster.map((entry) => ({
      type: entry.type,
      count: counts.get(entry.type) ?? 0,
    }));
  }

  private shuffle<T>(items: T[]): void {
    for (let i = items.length - 1; i > 0; i--) {
      const j = Phaser.Math.Between(0, i);
      [items[i], items[j]] = [items[j], items[i]];
    }
  }
}
