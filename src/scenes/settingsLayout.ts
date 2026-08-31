/**
 * 设置页布局的纯计算，不依赖 Phaser。
 *
 * 单独抽出来的原因：键位网格的行高必须由「实际动作数」反推。
 * weapon6 加入后每列从 9 行变成 10 行，而行高当时写死为 30px，
 * 末行盒体下沿落到 522 压过详情区标题（`SETTINGS_DETAIL_TOP = 506`），
 * 于是设置页出现「武器栏 6」与「音频设置 / 辅助选项」叠字。
 *
 * 这类错位不会让类型检查或既有测试变红——它只在真实渲染里可见。
 * 把算式放进无 Phaser 依赖的模块，`tests/settings-layout.test.ts`
 * 才能在纯 node 环境里守住不变量：**任何动作数下末行都不得压过详情区**。
 */
import { computeRowGrid } from '../ui/rowGrid';

/** 详情区（音频设置 / 辅助选项）标题的顶部 y。网格必须完全停在它上方。 */
export const SETTINGS_DETAIL_TOP = 506;
export const SETTINGS_DETAIL_ROW_TOP = 535;
export const SETTINGS_DETAIL_ROW_GAP = 27;

/** 键位网格首行中心 y。 */
export const BINDING_GRID_TOP = 238;
/** 网格分两列。 */
export const BINDING_GRID_COLUMNS = 2;
/** 末行盒体下沿与详情区标题之间要保留的可见间隙。 */
export const BINDING_DETAIL_SAFE_GAP = 10;
/** 盒体比行距矮多少，保证相邻两行之间有可见缝隙。 */
export const BINDING_BOX_SHRINK = 2;

export interface BindingGridLayout {
  rowsPerColumn: number;
  rowHeight: number;
  boxHeight: number;
  lastRowCenterY: number;
  lastRowBottomY: number;
  /** 末行盒体下沿到详情区标题的实际间隙。 */
  gapToDetail: number;
}

/**
 * 由动作总数反推行高与盒高。
 *
 * 实际几何交给 `src/ui/rowGrid.ts` 的共享实现：同一个缺陷在设置页和武器库
 * 各出现过一次，两处再各留一份算式只会让下一次修复漏掉一边。
 *
 * 这里的 `preferredRowStep` 取足够大的值，让行距始终由可用高度决定——
 * 设置页的网格本来就是「填满标题到详情区之间」的布局，没有更小的期望行距。
 */
export function computeBindingGridLayout(actionCount: number): BindingGridLayout {
  const grid = computeRowGrid({
    itemCount: actionCount,
    columns: BINDING_GRID_COLUMNS,
    firstRowCenterY: BINDING_GRID_TOP,
    boundaryY: SETTINGS_DETAIL_TOP,
    safeGap: BINDING_DETAIL_SAFE_GAP,
    boxShrink: BINDING_BOX_SHRINK,
    preferredRowStep: Number.MAX_SAFE_INTEGER,
  });

  return {
    rowsPerColumn: grid.rows,
    rowHeight: grid.rowStep,
    boxHeight: grid.boxHeight,
    lastRowCenterY: grid.lastRowCenterY,
    lastRowBottomY: grid.lastRowBottomY,
    gapToDetail: grid.gapToBoundary,
  };
}
