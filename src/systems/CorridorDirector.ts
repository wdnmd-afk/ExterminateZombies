import Phaser from 'phaser';
import { DEPTH, GAME_WIDTH } from '../constants';
import {
  CORRIDOR_BAND_JITTER,
  CORRIDOR_BREACH_X,
  CORRIDOR_ENEMY_CAP,
  CORRIDOR_ITEM_CARD_FIRST_AT_MS,
  CORRIDOR_ITEM_CARD_INTERVAL_MS,
  CORRIDOR_ALLY_CARD_FIRST_AT_MS,
  CORRIDOR_ALLY_CARD_INTERVAL_MS,
  CORRIDOR_LANE,
  CORRIDOR_PHASES,
  CORRIDOR_SPAWN_X,
  CORRIDOR_SURGE_COUNT,
  CORRIDOR_SURGE_GAP_MS,
  CORRIDOR_SURGE_INTERVAL_MS,
  CORRIDOR_SURGE_START_MS,
  getCorridorHealthScaling,
  type CorridorCardKind,
} from '../config/corridor';
import type { ZombieId } from '../config/zombies';
import type { ZombieScaling } from '../config/types';
import type { Zombie } from '../entities/Zombie';
import { UI_FONT_FAMILY } from '../ui/fonts';
import {
  finishCorridor,
  isCorridorRunning,
  resolveCorridorPhase,
  type CorridorPhaseSummary,
  type CorridorRun,
} from './CorridorRules';

interface CorridorHooks {
  scene: Phaser.Scene;
  run: CorridorRun;
  spawn: (id: ZombieId, position: { x: number; y: number }, scaling?: ZombieScaling) => Zombie;
  enemyCount: () => number;
  /** 只读僵尸列表,供突破扫描。 */
  getActiveZombies: () => readonly Zombie[];
  /** 请求往对应通道投一张卡;返回 false 表示池满或被拒。 */
  spawnCard: (kind: CorridorCardKind) => boolean;
  announce: (title: string, detail: string) => void;
  /** 有一只僵尸越过了突破线;GameScene 负责终局。 */
  onBreach: (zombie: Zombie) => void;
}

/**
 * 通道模式战场编排器(镜像 `FrenzyDirector`)。
 *
 * 全部节奏钟读 `run.elapsedMs`,而这个钟只在战场未冻结的帧里推进,
 * 所以暂停/抽卡冻结时刷怪与涌浪天然停摆,不需要 shiftTimers 一类的补偿。
 */
export class CorridorDirector {
  private nextSpawnAt = 2200;
  private spawnIndex = 0;
  private nextSurgeAt = CORRIDOR_SURGE_START_MS;
  private surgeQueue = 0;
  private nextSurgeSpawnAt = 0;
  private nextItemCardAt = CORRIDOR_ITEM_CARD_FIRST_AT_MS;
  private nextAllyCardAt = CORRIDOR_ALLY_CARD_FIRST_AT_MS;
  private itemCardSerial = 0;
  private announcedPhase: number;
  private breachAnnounced = false;

  constructor(private readonly hooks: CorridorHooks) {
    this.announcedPhase = 0;
  }

  start(): void {
    const phase = CORRIDOR_PHASES[0];
    this.nextSpawnAt = 2200;
    this.hooks.announce('通道防线 · 无尽尸潮', '守住主通道,漏一只即失败;打穿漂移卡拿火力');
    if (phase) this.hooks.announce(`第 1 阶段 · ${phase.name}`, '常规感染体开始行军');
  }

  update(): void {
    const { run } = this.hooks;
    if (!isCorridorRunning(run)) return;
    this.announcePhaseChanged();
    this.updateSpawning();
    this.updateSurge();
    this.updateCards();
    this.updateBreach();
  }

  /**
   * 主通道僵尸永远朝突破点行军:直线冲刺在两点之间天然贴着通道中线,
   * 拼 separation 不至于跨界,冲刺型喂同一个点也只会向左前扑。
   */
  getSeekTarget(_zombie: Zombie): { x: number; y: number } {
    return { x: CORRIDOR_BREACH_X, y: CORRIDOR_LANE.main.centerY };
  }

  /** 冲刺/远程技能的目标点同样钉在突破点,防止技能把僵尸拽出通道。 */
  getAbilityTarget(): { x: number; y: number } {
    return { x: CORRIDOR_BREACH_X, y: CORRIDOR_LANE.main.centerY };
  }

  /** HUD 读的当前阶段摘要。 */
  getPhaseSummary(): CorridorPhaseSummary {
    return resolveCorridorPhase(this.hooks.run.elapsedMs);
  }

  destroy(): void {
    this.breachAnnounced = true;
  }

  private announcePhaseChanged(): void {
    const summary = this.getPhaseSummary();
    if (summary.index === this.announcedPhase) return;
    this.announcedPhase = summary.index;
    this.hooks.announce(`第 ${summary.index + 1} 阶段 · ${summary.name}`, '尸潮构成升级,注意通道密度');
  }

  private updateSpawning(): void {
    const { run } = this.hooks;
    const summary = resolveCorridorPhase(run.elapsedMs);
    if (run.elapsedMs < this.nextSpawnAt) return;
    this.nextSpawnAt = run.elapsedMs + summary.phase.intervalMs;
    for (let index = 0; index < summary.phase.batchSize; index += 1) {
      if (this.hooks.enemyCount() >= CORRIDOR_ENEMY_CAP - 1) return;
      this.spawnFromPhase(summary.phase.weights);
    }
  }

  private updateSurge(): void {
    const { run } = this.hooks;
    if (run.elapsedMs >= this.nextSurgeAt) {
      this.nextSurgeAt = run.elapsedMs + CORRIDOR_SURGE_INTERVAL_MS;
      this.surgeQueue = CORRIDOR_SURGE_COUNT;
      this.nextSurgeSpawnAt = run.elapsedMs;
      this.hooks.announce('尸潮涌浪', '密集行军将穿过主通道,守住缺口');
    }
    if (this.surgeQueue <= 0 || run.elapsedMs < this.nextSurgeSpawnAt) return;
    this.nextSurgeSpawnAt = run.elapsedMs + CORRIDOR_SURGE_GAP_MS;
    this.surgeQueue -= 1;
    if (this.hooks.enemyCount() < CORRIDOR_ENEMY_CAP - 1) {
      this.spawnAt('walker');
    }
  }

  private updateCards(): void {
    const { run } = this.hooks;
    if (run.elapsedMs >= this.nextItemCardAt) {
      this.nextItemCardAt = run.elapsedMs + CORRIDOR_ITEM_CARD_INTERVAL_MS;
      this.requestItemCard();
    }
    if (run.elapsedMs >= this.nextAllyCardAt) {
      this.nextAllyCardAt = run.elapsedMs + CORRIDOR_ALLY_CARD_INTERVAL_MS;
      this.hooks.spawnCard('ally');
    }
  }

  /** 道具通道均匀轮转四类卡;被拒(池满)不消耗序列,下一轮重试同一类。 */
  private requestItemCard(): void {
    const kinds: readonly CorridorCardKind[] = ['projectile', 'weapon', 'damage', 'supply'];
    if (this.hooks.spawnCard(kinds[this.itemCardSerial % kinds.length])) {
      this.itemCardSerial += 1;
    }
  }

  private updateBreach(): void {
    if (this.breachAnnounced) return;
    if (this.hooks.enemyCount() <= 0) return;
    // 突破扫描交给 GameScene 的僵尸遍历太远;直接扫池是 O(cap),可接受。
    for (const zombie of this.hooks.getActiveZombies()) {
      if (!zombie.active) continue;
      if (zombie.x <= CORRIDOR_BREACH_X) {
        this.breachAnnounced = true;
        finishCorridor(this.hooks.run, 'breached');
        this.hooks.onBreach(zombie);
        return;
      }
    }
  }

  private spawnFromPhase(weights: Readonly<Record<string, number>>): void {
    const id = pickWeighted(weights, this.spawnIndex);
    this.spawnAt(id);
  }

  private spawnAt(id: ZombieId): void {
    const serial = this.spawnIndex++;
    const jitter = ((serial * 137 + 41) % (CORRIDOR_BAND_JITTER * 2 + 1)) - CORRIDOR_BAND_JITTER;
    const scaling: ZombieScaling = {
      healthMultiplier: getCorridorHealthScaling(this.hooks.run.elapsedMs),
      damageMultiplier: 1,
    };
    this.hooks.spawn(id, {
      x: CORRIDOR_SPAWN_X,
      y: CORRIDOR_LANE.main.centerY + jitter,
    }, scaling);
  }
}

function pickWeighted(weights: Readonly<Record<string, number>>, serial: number): ZombieId {
  // 确定性轮转而不是 Math.random:同一阶段内连刷的组合可复现,难度评审能对上数。
  const entries = Object.entries(weights);
  const spin = (serial * 733 + 211) % 1000;
  let accumulator = 0;
  for (const [id, weight] of entries) {
    accumulator += weight * 1000;
    if (spin < accumulator) return id as ZombieId;
  }
  const fallback = entries[entries.length - 1];
  return (fallback ? fallback[0] : 'walker') as ZombieId;
}

/** 右缘刷怪传送门的静态读数(带内对齐检查),只在调试面板用。 */
export const CORRIDOR_SPAWN_PORTAL_X = GAME_WIDTH - 8;
export const CORRIDOR_SPAWN_MARKER_DEPTH = DEPTH.effect;
export const CORRIDOR_PHASE_FONT = UI_FONT_FAMILY;
