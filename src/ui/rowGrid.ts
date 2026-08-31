/**
 * 等距行网格的纯几何计算，**不依赖 Phaser**，因此可在纯 node 测试里断言。
 *
 * 为什么单独抽出来：同一个缺陷已经出现两次，成因完全一致——
 * 行距被写成魔法数字，而行数由内容条目数决定，条目一增加就压过下方元素。
 *
 *   1. 设置页：动作数 18 → 20（加 weapon6）后每列 9 行变 10 行，
 *      末行盒体下沿 522 压过详情区标题 506。
 *   2. 武器库：武器数 8 → 17 后行数 4 变 9，
 *      末行盒体下沿 687 压过页脚分隔线 660 与页脚文案 680。
 *
 * 两次都不会让类型检查或既有测试变红——只在真实渲染里可见。
 * 所以行距必须由「可用高度 ÷ 实际行数」反推，而不是由人手填一个新常数。
 *
 * 关键点：约束必须计入**盒体半高**。只按行中心留间距，算出的空隙会被半高吃掉，
 * 视觉上仍然贴住下方元素（设置页第一版修复就踩了这个坑：声明 12px、实测 3px）。
 */

export interface RowGridRequest {
  /** 需要排布的条目总数。 */
  itemCount: number;
  /** 列数。条目按行优先填充，行数 = ceil(itemCount / columns)。 */
  columns: number;
  /** 首行盒体中心的 y。 */
  firstRowCenterY: number;
  /** 网格不得越过的下边界（下方元素的顶边）。 */
  boundaryY: number;
  /** 末行盒体下沿与 `boundaryY` 之间要保留的可见间隙。 */
  safeGap: number;
  /** 盒体比行距矮多少，保证相邻两行之间有可见缝隙。 */
  boxShrink: number;
  /** 期望行距。空间足够时按它走，不足时才压缩。 */
  preferredRowStep: number;
  /** 行距下限，低于它说明空间真的不够，需要改设计而不是继续压。 */
  minRowStep?: number;
}

export interface RowGridLayout {
  rows: number;
  rowStep: number;
  boxHeight: number;
  lastRowCenterY: number;
  lastRowBottomY: number;
  /** 末行盒体下沿到边界的实际间隙。 */
  gapToBoundary: number;
  /** 是否满足「不越界且间隙达标」。false 表示需要改设计。 */
  fits: boolean;
}

/**
 * 由条目数反推行距与盒高。
 *
 * 约束：`firstRowCenterY + (rows-1)*step + (step-shrink)/2 + safeGap ≤ boundaryY`
 * 解出：`step ≤ (boundaryY - safeGap - firstRowCenterY + shrink/2) / (rows - 0.5)`
 */
export function computeRowGrid(request: RowGridRequest): RowGridLayout {
  const {
    itemCount, columns, firstRowCenterY, boundaryY, safeGap, boxShrink, preferredRowStep,
  } = request;
  const minRowStep = request.minRowStep ?? 1;

  const rows = Math.max(1, Math.ceil(itemCount / Math.max(1, columns)));
  // 单行时没有行距可言，但盒体半高仍然受边界约束：
  //   firstRowCenterY + boxHeight/2 + safeGap ≤ boundaryY
  // 解出 step ≤ 2*(boundaryY - safeGap - firstRowCenterY) + boxShrink。
  // 不能直接返回 preferredRowStep——调用方若传入一个很大的期望值（表示
  // 「行距完全由可用高度决定」），单行就会算出荒谬的盒高。
  const maxStep = rows === 1
    ? 2 * (boundaryY - safeGap - firstRowCenterY) + boxShrink
    : Math.floor((boundaryY - safeGap - firstRowCenterY + boxShrink / 2) / (rows - 0.5));

  const rowStep = Math.max(minRowStep, Math.min(preferredRowStep, maxStep));
  const boxHeight = rowStep - boxShrink;
  const lastRowCenterY = firstRowCenterY + (rows - 1) * rowStep;
  const lastRowBottomY = lastRowCenterY + boxHeight / 2;
  const gapToBoundary = boundaryY - lastRowBottomY;

  return {
    rows,
    rowStep,
    boxHeight,
    lastRowCenterY,
    lastRowBottomY,
    gapToBoundary,
    fits: boxHeight > 0 && gapToBoundary >= safeGap,
  };
}
