import { GAME_HEIGHT, GAME_WIDTH } from '../constants';
import type { FacingDirection } from './zombieVisuals';
import { ZOMBIES, type ZombieId } from './zombies';

/**
 * 美术检阅波的摆位表。
 *
 * 纯数据与纯计算，不依赖 Phaser：这样布局可以在 Node 里被断言，
 * 与 `zombieVisuals` 拆分的理由相同。
 *
 * 目标：一屏之内摆出全部 18 类感染体，每类 8 只（四个朝向各 2 只），
 * 共 144 只，供逐类逐朝向目视核对素材。
 */

/** 每类感染体的展示数量：4 个朝向 × 2 只。 */
export const REVIEW_PER_DIRECTION = 2;
export const REVIEW_DIRECTIONS: readonly FacingDirection[] = ['down', 'left', 'right', 'up'];
export const REVIEW_PER_TYPE = REVIEW_DIRECTIONS.length * REVIEW_PER_DIRECTION;

/**
 * 网格取 16 列 × 9 行 = 144 格，恰好等于 18 类 × 8 只，没有空格也没有溢出。
 *
 * 单元格 80×80 是 1280×720 内能给到的最大均匀尺寸。这是本方案唯一的硬约束来源：
 * 战场是固定单屏（`cameras.main.setBounds(0,0,GAME_WIDTH,GAME_HEIGHT)`，无跟随、无滚动），
 * 且 `BattlefieldRenderer` 把背景按 `GAME_WIDTH/HEIGHT` 烘死，扩大世界会露出未绘制区域。
 * 所以 144 只必须落在 1280×720 里，格子尺寸不是设计选择而是除法结果。
 *
 * 已知后果：`matriarch_boss` 实机可见约 84px、`hunter_boss` 约 88px，会略微越过 80px 格界，
 * 与邻格轻微重叠。四个 Boss 因此排在最后两行（row 7-8），让重叠只发生在 Boss 之间，
 * 不污染 14 类普通感染体的观察。
 */
export const REVIEW_COLUMNS = 16;
export const REVIEW_ROWS = 9;
export const REVIEW_CELL_WIDTH = GAME_WIDTH / REVIEW_COLUMNS;
export const REVIEW_CELL_HEIGHT = GAME_HEIGHT / REVIEW_ROWS;

export interface MonsterReviewPlacement {
  typeId: ZombieId;
  facing: FacingDirection;
  x: number;
  y: number;
  /** 该类型内的序号（0 起始），用于定位同类 8 只中的哪一只。 */
  indexInType: number;
}

/**
 * 类型顺序：14 类普通感染体在前（row 0-6），4 个 Boss 在最后两行。
 *
 * 顺序取 `ZOMBIES` 的声明顺序而不是另起一张表，避免新增感染体时漏同步；
 * Boss 靠 id 含 `boss` 识别，与 `isBossZombie` 同一条约定。
 */
export function getMonsterReviewTypeOrder(): ZombieId[] {
  const ids = Object.keys(ZOMBIES) as ZombieId[];
  const normal = ids.filter((id) => !id.includes('boss'));
  const bosses = ids.filter((id) => id.includes('boss'));
  return [...normal, ...bosses];
}

/**
 * 每一类占据连续的 8 格（半行），按行优先铺开。
 * 同类 8 只的朝向序为 down,down,left,left,right,right,up,up ——
 * 同朝向的两只相邻，便于直接比对同一朝向的两帧是否一致。
 */
export function buildMonsterReviewPlacements(): MonsterReviewPlacement[] {
  const placements: MonsterReviewPlacement[] = [];
  const order = getMonsterReviewTypeOrder();

  order.forEach((typeId, typeIndex) => {
    for (let slot = 0; slot < REVIEW_PER_TYPE; slot += 1) {
      const cell = typeIndex * REVIEW_PER_TYPE + slot;
      const column = cell % REVIEW_COLUMNS;
      const row = Math.floor(cell / REVIEW_COLUMNS);
      placements.push({
        typeId,
        facing: REVIEW_DIRECTIONS[Math.floor(slot / REVIEW_PER_DIRECTION)],
        x: (column + 0.5) * REVIEW_CELL_WIDTH,
        y: (row + 0.5) * REVIEW_CELL_HEIGHT,
        indexInType: slot,
      });
    }
  });

  return placements;
}

/** 检阅波的敌群条目，供 `WaveDef` 直接使用。 */
export function buildMonsterReviewEnemies(): { type: ZombieId; count: number }[] {
  return getMonsterReviewTypeOrder().map((type) => ({ type, count: REVIEW_PER_TYPE }));
}
