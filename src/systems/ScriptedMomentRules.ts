import type { MomentTrigger, ScriptedMomentDef } from '../config/scriptedMoments';

/**
 * 剧本时刻的触发判定。纯逻辑，便于单测。
 *
 * 事件与触发条件分开：场景只负责在合适的时机抛出事件，
 * 「哪些时刻该被这个事件点燃」全部收敛到这里。
 */

export type MomentEvent =
  | { kind: 'firstKill' }
  | { kind: 'segmentStart'; wave: number; segment: number }
  /** 每帧心跳，携带当前阶段序号（1 起始）与玩家生命比例。 */
  | { kind: 'tick'; wave: number; healthRatio: number };

export function matchesTrigger(trigger: MomentTrigger, event: MomentEvent): boolean {
  switch (trigger.kind) {
    case 'firstKill':
      return event.kind === 'firstKill';
    case 'segmentStart':
      return event.kind === 'segmentStart'
        && event.wave === trigger.wave
        && event.segment === trigger.segment;
    case 'healthBelow':
      return event.kind === 'tick'
        && event.wave >= trigger.minWave
        && event.healthRatio <= trigger.ratio;
  }
}

/**
 * 本次事件应当点燃的时刻列表。
 * 已触发过的时刻不会再次返回：剧本时刻是一局一次的高光，重复播报会立刻变廉价。
 */
export function resolveTriggeredMoments(
  moments: readonly ScriptedMomentDef[],
  fired: ReadonlySet<string>,
  event: MomentEvent,
): ScriptedMomentDef[] {
  return moments.filter(
    (moment) => !fired.has(moment.id) && matchesTrigger(moment.trigger, event),
  );
}

/**
 * 环形生成点。以玩家为圆心均分角度，并把结果夹进战场安全区。
 * 夹取是必要的：玩家贴边时未夹取的落点会跑到画布外，敌人从场外径直穿墙进来。
 */
export function resolveRingPoints(
  centerX: number,
  centerY: number,
  count: number,
  radius: number,
  bounds: { width: number; height: number; margin: number },
): Array<{ x: number; y: number }> {
  if (count <= 0) return [];
  const points: Array<{ x: number; y: number }> = [];
  for (let index = 0; index < count; index++) {
    const angle = (Math.PI * 2 * index) / count;
    points.push({
      x: clamp(centerX + Math.cos(angle) * radius, bounds.margin, bounds.width - bounds.margin),
      y: clamp(centerY + Math.sin(angle) * radius, bounds.margin, bounds.height - bounds.margin),
    });
  }
  return points;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
