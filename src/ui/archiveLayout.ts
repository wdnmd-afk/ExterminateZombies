import { computeRowGrid, type RowGridLayout } from './rowGrid';

export type ArchiveKind = 'weapon' | 'monster';

export const ARCHIVE_LAYOUTS = {
  weapon: {
    indexLeft: 64,
    indexWidth: 626,
    columnGap: 12,
    firstRowCenterY: 223,
    footerRuleY: 660,
    footerTextY: 680,
    footerFontSize: '13px',
    order: 'row',
  },
  monster: {
    indexLeft: 64,
    indexWidth: 604,
    columnGap: 16,
    firstRowCenterY: 215,
    footerRuleY: 674,
    footerTextY: 690,
    footerFontSize: '12px',
    order: 'column',
  },
} as const;

export interface ArchiveIndexLayout {
  grid: RowGridLayout;
  rowWidth: number;
  positions: Array<{ x: number; y: number }>;
}

/** 两页保留原来的排列顺序，但行距、盒高和页脚留白使用同一个几何约束。 */
export function computeArchiveIndexLayout(kind: ArchiveKind, itemCount: number): ArchiveIndexLayout {
  if (!Number.isInteger(itemCount) || itemCount < 0) {
    throw new Error('档案条目数量必须是非负整数');
  }
  const layout = ARCHIVE_LAYOUTS[kind];
  const grid = computeRowGrid({
    itemCount,
    columns: 2,
    firstRowCenterY: layout.firstRowCenterY,
    boundaryY: layout.footerRuleY,
    safeGap: 16,
    boxShrink: 6,
    preferredRowStep: 55,
  });
  const rowWidth = (layout.indexWidth - layout.columnGap) / 2;
  const positions = Array.from({ length: itemCount }, (_entry, entryIndex) => {
    const column = layout.order === 'row' ? entryIndex % 2 : Math.floor(entryIndex / grid.rows);
    const row = layout.order === 'row' ? Math.floor(entryIndex / 2) : entryIndex % grid.rows;
    return {
      x: layout.indexLeft + rowWidth / 2 + column * (rowWidth + layout.columnGap),
      y: layout.firstRowCenterY + row * grid.rowStep,
    };
  });
  return { grid, rowWidth, positions };
}

/** 延续图鉴的整表循环选择；按真实的行/列优先顺序映射方向，不选中缺失的尾格。 */
export function resolveArchiveNavigationIndex(
  kind: ArchiveKind,
  code: string,
  currentIndex: number,
  itemCount: number,
): number | null {
  if (!Number.isInteger(itemCount) || itemCount <= 0) return null;
  const rowFirst = ARCHIVE_LAYOUTS[kind].order === 'row';
  const verticalStep = rowFirst ? 2 : 1;
  const horizontalStep = rowFirst ? 1 : Math.ceil(itemCount / 2);
  let offset: number;
  switch (code) {
    case 'ArrowUp':
    case 'KeyW':
      offset = -verticalStep;
      break;
    case 'ArrowDown':
    case 'KeyS':
      offset = verticalStep;
      break;
    case 'ArrowLeft':
    case 'KeyA':
      offset = -horizontalStep;
      break;
    case 'ArrowRight':
    case 'KeyD':
      offset = horizontalStep;
      break;
    case 'Home':
      return 0;
    case 'End':
      return itemCount - 1;
    default:
      return null;
  }
  if (!Number.isInteger(currentIndex) || currentIndex < 0 || currentIndex >= itemCount) return 0;
  return ((currentIndex + offset) % itemCount + itemCount) % itemCount;
}
