import { segmentIntersectsAabb, type AabbTile } from '../utils/geometry';

export interface DashBounds {
  width: number;
  height: number;
  /** 玩家碰撞半径。落点必须与边界保持这个距离，否则会半个身子卡在墙外。 */
  radius: number;
}

/**
 * 相位疾冲的落点解析。
 *
 * 纯几何、无 Phaser 依赖，因此可以单测——这一点是必要的：位移技能一旦把玩家送进
 * 掩体内部，Arcade 的静态刚体会把他持续往外挤，表现为"卡墙抖动"，而这种故障
 * 在实机里很难稳定复现。
 *
 * 做法是**沿路径步进取最后一个合法点**，而不是"命中就整段作废"：
 * 玩家朝墙冲时应该贴到墙前停下，而不是原地不动——原地不动会白白吃掉一次冷却，
 * 而玩家的输入意图（往那边走）明确是可以部分满足的。
 *
 * 步长取 8px：小于玩家半径（16）的一半，保证不会跨过一块最薄的碰撞砖（分带砖宽约 6px）
 * 而漏判。用固定步长而不是二分：路径上可能有多块砖，二分只在"单调可行"时才正确。
 */
const DASH_STEP_PX = 8;

export function resolveDashTarget(
  fromX: number,
  fromY: number,
  angle: number,
  distance: number,
  tiles: readonly AabbTile[],
  bounds: DashBounds,
): { x: number; y: number } {
  const dirX = Math.cos(angle);
  const dirY = Math.sin(angle);
  const steps = Math.max(1, Math.ceil(distance / DASH_STEP_PX));

  let lastValidX = fromX;
  let lastValidY = fromY;
  for (let step = 1; step <= steps; step += 1) {
    const travelled = Math.min(distance, DASH_STEP_PX * step);
    const nextX = clamp(fromX + dirX * travelled, bounds.radius, bounds.width - bounds.radius);
    const nextY = clamp(fromY + dirY * travelled, bounds.radius, bounds.height - bounds.radius);
    // 判定上一个合法点到候选点这一小段，而不是只判候选点是否在砖内：
    // 只判点会让薄墙被整段跨过（步长 8px、砖宽 6px 时正是如此）。
    if (tiles.some((tile) => segmentIntersectsAabb(lastValidX, lastValidY, nextX, nextY, tile))) {
      break;
    }
    lastValidX = nextX;
    lastValidY = nextY;
  }
  return { x: lastValidX, y: lastValidY };
}

function clamp(value: number, min: number, max: number): number {
  // max < min 只会在世界比玩家直径还小时出现，此时取中点是唯一不越界的答案。
  if (max < min) return (min + max) / 2;
  return Math.min(max, Math.max(min, value));
}
