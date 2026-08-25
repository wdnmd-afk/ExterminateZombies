import Phaser from 'phaser';
import { createEndlessWave } from '../config/endless';
import { LEVELS } from '../config/levels';
import type { EndlessWaveMeta, WaveDef, WaveSegmentDef } from '../config/types';
import { buildMonsterReviewEnemies } from '../config/monsterArtReview';
import { TESTING_FLAGS } from '../config/testing';
import { CONCURRENT_CAP_RECHECK_MS, getWaveSegments } from '../config/waveShape';
import type { ZombieId } from '../config/zombies';
import type { GameMode } from './GameState';

type WaveState =
  | 'pending'
  | 'segment_pending'
  | 'spawning'
  | 'waiting_clear'
  | 'waiting_reward'
  | 'complete';

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
    endless: EndlessWaveMeta | null;
  } {
    return {
      waveIndex: this.currentIndex,
      segmentIndex: this.currentSegmentIndex,
      segmentCount: this.segments.length,
      concurrentCap: this.segments[this.currentSegmentIndex]?.concurrentCap ?? null,
      pendingInSegment: this.pendingSpawns.length,
      state: this.state,
      endless: this.currentWave?.endless ? { ...this.currentWave.endless } : null,
    };
  }

  getEndlessWaveMeta(): EndlessWaveMeta | null {
    return this.currentWave?.endless ? { ...this.currentWave.endless } : null;
  }

  /**
   * 仅开发构建可用的跳波入口，供 Boss 波等靠自然推进代价过高的验收使用。
   *
   * 为什么走 `scheduleWave` 而不是自己拼一个波次：`scheduleWave` → `getWave` →
   * `createEndlessWave` 是正式生成链路，跳过去拿到的第 10 波就是配置表里真正的那一波
   * （含 Boss 轮换与章节奖励），不会引入一条只有测试才走的平行规则。
   *
   * **它能证明什么，不能证明什么**（按 TESTING_RULES 原则 6，调用方必须显式记录）：
   * 能证明该波次的生成、公告、音乐切轨、奖励结算在实机中成立；
   * 不能证明「玩家自然打到这一波」——跳过的 9 波里积累的武器、强化、弹药和
   * 伤害压力都不存在，所以它不构成难度或节奏的验收。
   *
   * 生产构建里恒为 no-op 并返回 false，不给正式玩法留下跳关面。
   */
  debugJumpToWave(waveNumber: number, now = this.scene.time.now): boolean {
    if (!import.meta.env.DEV) return false;
    if (!Number.isInteger(waveNumber) || waveNumber < 1) return false;
    if (this.mode !== 'endless' && waveNumber > this.levelWaves.length) return false;

    this.scheduleWave(waveNumber - 1, now);
    return this.currentWave !== null;
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
    // 检阅波不打乱：按类型顺序逐格摆放，网格才会一行一行填出来而不是随机点亮，
    // 中途截图也能对上"第几行是第几类"。
    if (!this.isArtReviewWave()) {
      this.shuffle(this.pendingSpawns);
    }
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

    // 美术检阅波只替换第 1 波，第 2 波起回到正常曲线。
    // 间隔取 40ms：144 只在约 6 秒内全部摆好；沿用正常的 780ms 要等近两分钟。
    if (index === 0 && TESTING_FLAGS.monsterArtReviewWave) {
      return {
        enemies: buildMonsterReviewEnemies(),
        spawnInterval: 40,
        startDelay: 600,
      };
    }
    return createEndlessWave(waveNumber);
  }

  /** 当前是否正处在美术检阅波（无尽模式第 1 波且开关打开）。 */
  isArtReviewWave(): boolean {
    return this.mode === 'endless'
      && this.currentIndex === 0
      && TESTING_FLAGS.monsterArtReviewWave;
  }

  private shuffle<T>(items: T[]): void {
    for (let i = items.length - 1; i > 0; i--) {
      const j = Phaser.Math.Between(0, i);
      [items[i], items[j]] = [items[j], items[i]];
    }
  }
}
