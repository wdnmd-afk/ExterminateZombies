import type { ItemId } from '../config/items';
import type { MomentAction, ScriptedMomentDef } from '../config/scriptedMoments';
import { getScriptedMoments } from '../config/scriptedMoments';
import type { NormalZombieId } from '../config/zombies';
import { GAME_HEIGHT, GAME_WIDTH } from '../constants';
import {
  resolveRingPoints,
  resolveTriggeredMoments,
  type MomentEvent,
} from './ScriptedMomentRules';

/** 环形生成点距画布边界的最小留白，避免敌人落在场外。 */
const RING_MARGIN = 40;

interface ScriptedMomentSystemOptions {
  levelId: string | null;
  spawnZombieAt: (typeId: NormalZombieId, x: number, y: number) => void;
  spawnProp: (itemId: ItemId, x: number, y: number) => void;
  announce: (payload: { title: string; subtitle: string; accent: number }) => void;
  getPlayerPosition: () => { x: number; y: number };
}

/**
 * 剧本时刻执行器。
 *
 * 职责边界：只负责「在被点燃时把编排落到战场上」。触发判定在
 * `ScriptedMomentRules`，编排内容在 `config/scriptedMoments.ts`。
 * 无尽模式与未配置时刻的关卡拿到空列表，整套系统零开销。
 */
export class ScriptedMomentSystem {
  private readonly moments: readonly ScriptedMomentDef[];
  private readonly fired = new Set<string>();
  private readonly options: ScriptedMomentSystemOptions;

  constructor(options: ScriptedMomentSystemOptions) {
    this.options = options;
    this.moments = getScriptedMoments(options.levelId);
  }

  /** 本局是否配置了剧本时刻。用来在无关卡上跳过每帧心跳。 */
  get hasMoments(): boolean {
    return this.moments.length > 0;
  }

  notifyFirstKill(): void {
    this.dispatch({ kind: 'firstKill' });
  }

  /** `wave` 与 `segment` 均为 0 起始索引，与配置写法保持一致。 */
  notifySegmentStarted(wave: number, segment: number): void {
    this.dispatch({ kind: 'segmentStart', wave, segment });
  }

  /** 每帧心跳。`waveNumber` 为 1 起始的阶段序号。 */
  update(waveNumber: number, healthRatio: number): void {
    if (!this.hasMoments) return;
    this.dispatch({ kind: 'tick', wave: waveNumber, healthRatio });
  }

  private dispatch(event: MomentEvent): void {
    const triggered = resolveTriggeredMoments(this.moments, this.fired, event);
    for (const moment of triggered) {
      this.fired.add(moment.id);
      if (moment.announce) this.options.announce(moment.announce);
      for (const action of moment.actions ?? []) {
        this.execute(action);
      }
    }
  }

  private execute(action: MomentAction): void {
    if (action.kind === 'props') {
      for (const point of action.points) {
        this.options.spawnProp(action.itemId, point.x, point.y);
      }
      return;
    }

    if (action.kind === 'formation') {
      for (const point of action.points) {
        this.options.spawnZombieAt(action.type, point.x, point.y);
      }
      return;
    }

    const player = this.options.getPlayerPosition();
    const points = resolveRingPoints(player.x, player.y, action.count, action.radius, {
      width: GAME_WIDTH,
      height: GAME_HEIGHT,
      margin: RING_MARGIN,
    });
    for (const point of points) {
      this.options.spawnZombieAt(action.type, point.x, point.y);
    }
  }
}
