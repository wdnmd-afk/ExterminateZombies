import { describe, expect, it } from 'vitest';
import { MONSTER_LIBRARY } from '../src/config/monsterLibrary';
import { WEAPON_LIBRARY } from '../src/config/weaponLibrary';
import {
  FOOTER_RULE_Y,
  WEAPON_INDEX_FIRST_ROW_Y,
  computeWeaponIndexGrid,
} from '../src/scenes/weaponLibraryLayout';
import {
  ARCHIVE_LAYOUTS,
  computeArchiveIndexLayout,
  resolveArchiveNavigationIndex,
  type ArchiveKind,
} from '../src/ui/archiveLayout';

const archiveKinds: ArchiveKind[] = ['weapon', 'monster'];
const navigationCodes = [
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
  'KeyW', 'KeyS', 'KeyA', 'KeyD', 'Home', 'End',
];

describe('档案索引排列', () => {
  it('武器库保留行优先顺序，奇数尾项位于左列', () => {
    const layout = computeArchiveIndexLayout('weapon', 5);
    expect(layout.rowWidth).toBe(307);
    expect(layout.positions).toEqual([
      { x: 217.5, y: 223 },
      { x: 536.5, y: 223 },
      { x: 217.5, y: 278 },
      { x: 536.5, y: 278 },
      { x: 217.5, y: 333 },
    ]);
  });

  it('怪物图鉴保留列优先顺序，左列比右列多一项', () => {
    const layout = computeArchiveIndexLayout('monster', 5);
    expect(layout.rowWidth).toBe(294);
    expect(layout.positions).toEqual([
      { x: 211, y: 215 },
      { x: 211, y: 270 },
      { x: 211, y: 325 },
      { x: 521, y: 215 },
      { x: 521, y: 270 },
    ]);
  });

  it('当前 17 项武器保持已有行距和盒高', () => {
    expect(WEAPON_LIBRARY).toHaveLength(17);
    const layout = computeArchiveIndexLayout('weapon', WEAPON_LIBRARY.length);
    expect(layout.grid).toMatchObject({ rows: 9, rowStep: 49, boxHeight: 43, fits: true });
    expect(layout.positions[16]).toEqual({ x: 217.5, y: 615 });
  });

  it('当前 18 项图鉴同时约束行距、盒高和页脚留白', () => {
    expect(MONSTER_LIBRARY).toHaveLength(18);
    const layout = computeArchiveIndexLayout('monster', MONSTER_LIBRARY.length);
    expect(layout.grid).toMatchObject({ rows: 9, rowStep: 52, boxHeight: 46, fits: true });
    expect(layout.positions[17]).toEqual({ x: 521, y: 631 });
  });

  it('保留原武器布局模块的导出契约', () => {
    expect(WEAPON_INDEX_FIRST_ROW_Y).toBe(223);
    expect(FOOTER_RULE_Y).toBe(660);
    for (let itemCount = 0; itemCount <= 40; itemCount += 1) {
      expect(computeWeaponIndexGrid(itemCount)).toEqual(computeArchiveIndexLayout('weapon', itemCount).grid);
    }
  });

  it('保留两页各自的页脚坐标，不套用同一个底边', () => {
    expect(ARCHIVE_LAYOUTS.weapon).toMatchObject({ footerRuleY: 660, footerTextY: 680 });
    expect(ARCHIVE_LAYOUTS.monster).toMatchObject({ footerRuleY: 674, footerTextY: 690 });
  });

  it('旧图鉴公式在 18 项时仍位于实际页脚上方', () => {
    const rowCount = Math.ceil(18 / 2);
    const legacyStep = Math.min(55, (638 - 215) / (rowCount - 1));
    const legacyBottom = 215 + (rowCount - 1) * legacyStep + 48 / 2;
    expect(legacyBottom).toBe(662);
    expect(legacyBottom).toBeLessThan(ARCHIVE_LAYOUTS.monster.footerRuleY);
  });

  it('旧图鉴公式在 20 项时叠行，新网格保留 6px 行间隙', () => {
    // 旧公式只约束最后一行的中心，无法保证固定 48px 盒体互不重叠。
    const rowCount = Math.ceil(20 / 2);
    const legacyStep = Math.min(55, (638 - 215) / (rowCount - 1));
    expect(legacyStep).toBe(47);
    expect(legacyStep).toBeLessThan(48);
    const layout = computeArchiveIndexLayout('monster', 20);
    expect(layout.grid).toMatchObject({ rowStep: 46, boxHeight: 40, fits: true });
    expect(layout.grid.rowStep - layout.grid.boxHeight).toBe(6);
  });
});

describe.each(archiveKinds)('%s 档案几何边界', (kind) => {
  it('1 至 40 项的位置均在索引区域内，并与页脚保留至少 16px', () => {
    const bounds = ARCHIVE_LAYOUTS[kind];
    for (let itemCount = 1; itemCount <= 40; itemCount += 1) {
      const { positions, rowWidth, grid } = computeArchiveIndexLayout(kind, itemCount);
      expect(positions).toHaveLength(itemCount);
      expect(new Set(positions.map((position) => `${position.x}/${position.y}`)).size).toBe(itemCount);
      expect(grid.fits).toBe(true);
      expect(grid.boxHeight).toBeGreaterThan(0);
      expect(grid.rowStep - grid.boxHeight).toBe(6);
      for (const position of positions) {
        expect(position.x - rowWidth / 2).toBeGreaterThanOrEqual(bounds.indexLeft);
        expect(position.x + rowWidth / 2).toBeLessThanOrEqual(bounds.indexLeft + bounds.indexWidth);
        expect(position.y + grid.boxHeight / 2).toBeLessThanOrEqual(bounds.footerRuleY - 16);
      }
      expect(Math.max(...positions.map((position) => position.y)) + grid.boxHeight / 2)
        .toBe(grid.lastRowBottomY);
    }
  });

  it('空档案不生成占位条目', () => {
    expect(computeArchiveIndexLayout(kind, 0).positions).toEqual([]);
  });

  it.each([-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])('拒绝非法数量 %s', (itemCount) => {
    expect(() => computeArchiveIndexLayout(kind, itemCount)).toThrow('档案条目数量必须是非负整数');
  });
});

describe('档案方向映射与整表循环', () => {
  it.each([
    { kind: 'weapon', code: 'ArrowUp', currentIndex: 8, itemCount: 17, expected: 6 },
    { kind: 'weapon', code: 'ArrowDown', currentIndex: 8, itemCount: 17, expected: 10 },
    { kind: 'weapon', code: 'ArrowLeft', currentIndex: 8, itemCount: 17, expected: 7 },
    { kind: 'weapon', code: 'ArrowRight', currentIndex: 8, itemCount: 17, expected: 9 },
    { kind: 'weapon', code: 'ArrowUp', currentIndex: 0, itemCount: 17, expected: 15 },
    { kind: 'weapon', code: 'ArrowDown', currentIndex: 16, itemCount: 17, expected: 1 },
    { kind: 'weapon', code: 'ArrowLeft', currentIndex: 0, itemCount: 17, expected: 16 },
    { kind: 'weapon', code: 'ArrowRight', currentIndex: 16, itemCount: 17, expected: 0 },
    { kind: 'monster', code: 'ArrowUp', currentIndex: 4, itemCount: 18, expected: 3 },
    { kind: 'monster', code: 'ArrowDown', currentIndex: 4, itemCount: 18, expected: 5 },
    { kind: 'monster', code: 'ArrowLeft', currentIndex: 13, itemCount: 18, expected: 4 },
    { kind: 'monster', code: 'ArrowRight', currentIndex: 4, itemCount: 18, expected: 13 },
    { kind: 'monster', code: 'ArrowUp', currentIndex: 0, itemCount: 18, expected: 17 },
    { kind: 'monster', code: 'ArrowDown', currentIndex: 17, itemCount: 18, expected: 0 },
    { kind: 'monster', code: 'ArrowLeft', currentIndex: 0, itemCount: 18, expected: 9 },
    { kind: 'monster', code: 'ArrowRight', currentIndex: 17, itemCount: 18, expected: 8 },
    { kind: 'monster', code: 'ArrowLeft', currentIndex: 0, itemCount: 17, expected: 8 },
    { kind: 'monster', code: 'ArrowRight', currentIndex: 16, itemCount: 17, expected: 8 },
  ] satisfies Array<{ kind: ArchiveKind; code: string; currentIndex: number; itemCount: number; expected: number }>)
    ('$kind $code：$currentIndex → $expected（共 $itemCount 项）', ({ kind, code, currentIndex, itemCount, expected }) => {
      expect(resolveArchiveNavigationIndex(kind, code, currentIndex, itemCount)).toBe(expected);
    });
});

describe.each(archiveKinds)('%s 键盘导航边界', (kind) => {
  it.each([
    ['ArrowUp', 'KeyW'], ['ArrowDown', 'KeyS'], ['ArrowLeft', 'KeyA'], ['ArrowRight', 'KeyD'],
  ])('%s 与 %s 使用同一方向映射', (arrowCode, letterCode) => {
    expect(resolveArchiveNavigationIndex(kind, letterCode, 4, 17))
      .toBe(resolveArchiveNavigationIndex(kind, arrowCode, 4, 17));
  });

  it('Home/End 直接跳转首尾', () => {
    expect(resolveArchiveNavigationIndex(kind, 'Home', 8, 17)).toBe(0);
    expect(resolveArchiveNavigationIndex(kind, 'End', 8, 17)).toBe(16);
  });

  it.each(navigationCodes)('单项档案的 %s 始终停留在首项', (code) => {
    expect(resolveArchiveNavigationIndex(kind, code, 0, 1)).toBe(0);
  });

  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])('数量 %s 时不导航', (itemCount) => {
    for (const code of navigationCodes) {
      expect(resolveArchiveNavigationIndex(kind, code, 0, itemCount)).toBeNull();
    }
  });

  it.each([-1, 17, 1.5, Number.NaN, Number.POSITIVE_INFINITY])('非法索引 %s 可恢复且不影响首尾跳转', (currentIndex) => {
    for (const code of navigationCodes.filter((candidate) => candidate !== 'End')) {
      expect(resolveArchiveNavigationIndex(kind, code, currentIndex, 17)).toBe(0);
    }
    expect(resolveArchiveNavigationIndex(kind, 'End', currentIndex, 17)).toBe(16);
  });

  it.each(['Enter', 'NumpadEnter', 'Space', 'Escape', 'Tab', 'KeyQ', ''])('不接管非导航键 %s', (code) => {
    expect(resolveArchiveNavigationIndex(kind, code, 4, 17)).toBeNull();
  });

  it.each([2, 3, 5, 17, 18])('%s 项时所有导航结果均对应真实条目', (itemCount) => {
    for (let currentIndex = 0; currentIndex < itemCount; currentIndex += 1) {
      for (const code of navigationCodes) {
        const nextIndex = resolveArchiveNavigationIndex(kind, code, currentIndex, itemCount);
        expect(nextIndex).not.toBeNull();
        expect(Number.isInteger(nextIndex)).toBe(true);
        expect(nextIndex).toBeGreaterThanOrEqual(0);
        expect(nextIndex).toBeLessThan(itemCount);
      }
    }
  });
});
