import { describe, expect, it } from 'vitest';
import { computeRowGrid } from '../src/ui/rowGrid';
import {
  FOOTER_RULE_Y,
  LEGACY_BOX_HEIGHT,
  LEGACY_ROW_STEP,
  WEAPON_INDEX_FIRST_ROW_Y,
  computeWeaponIndexGrid,
} from '../src/scenes/weaponLibraryLayout';
import { WEAPON_LIBRARY } from '../src/config/weaponLibrary';
import { MAX_WEAPON_LOADOUT_SIZE } from '../src/config/loadout';

/**
 * 这组测试锁的是一个反复出现、且只在真实渲染里可见的缺陷类：
 * 行距写成魔法数字，而行数由内容条目数决定，条目一增加就压过下方元素。
 * 设置页（动作 18→20）和武器库（武器 8→17）已各中一次。
 */
describe('等距行网格', () => {
  const base = {
    columns: 2,
    firstRowCenterY: 223,
    boundaryY: 660,
    safeGap: 16,
    boxShrink: 6,
    preferredRowStep: 55,
  };

  it('空间充足时保持期望行距', () => {
    const layout = computeRowGrid({ ...base, itemCount: 8 });
    expect(layout.rowStep).toBe(base.preferredRowStep);
    expect(layout.fits).toBe(true);
  });

  it('空间不足时压缩行距而不是越界', () => {
    const layout = computeRowGrid({ ...base, itemCount: 17 });
    expect(layout.rowStep).toBeLessThan(base.preferredRowStep);
    expect(layout.lastRowBottomY).toBeLessThanOrEqual(base.boundaryY);
    expect(layout.fits).toBe(true);
  });

  it('间隙计算计入盒体半高', () => {
    // 只按行中心留间距会算出虚假的空隙——设置页第一版修复就踩了这个坑。
    const layout = computeRowGrid({ ...base, itemCount: 17 });
    const centerGap = base.boundaryY - layout.lastRowCenterY;
    expect(layout.gapToBoundary).toBeLessThan(centerGap);
    expect(layout.gapToBoundary).toBe(centerGap - layout.boxHeight / 2);
  });

  it('相邻两行之间保留可见缝隙', () => {
    const layout = computeRowGrid({ ...base, itemCount: 17 });
    expect(layout.rowStep - layout.boxHeight).toBe(base.boxShrink);
    expect(layout.boxHeight).toBeGreaterThan(0);
  });

  it('单行不会被放大成荒谬行距', () => {
    const layout = computeRowGrid({ ...base, itemCount: 1 });
    expect(layout.rows).toBe(1);
    expect(layout.rowStep).toBe(base.preferredRowStep);
  });
});

describe('武器库索引布局', () => {
  it('当前武器数下末行不压过页脚', () => {
    const layout = computeWeaponIndexGrid(WEAPON_LIBRARY.length);
    // 页脚分隔线 660、页脚文案顶边 680。原实现末行下沿 687，同时压过两者。
    expect(layout.lastRowBottomY).toBeLessThanOrEqual(FOOTER_RULE_Y);
    expect(layout.fits).toBe(true);
  });

  it('武器数增长到 40 之前都不会压过页脚', () => {
    for (let n = 1; n <= 40; n += 1) {
      const layout = computeWeaponIndexGrid(n);
      expect(
        layout.lastRowBottomY,
        `武器数 ${n} 时末行下沿 ${layout.lastRowBottomY} 压过页脚 ${FOOTER_RULE_Y}`,
      ).toBeLessThanOrEqual(FOOTER_RULE_Y);
      expect(layout.boxHeight, `武器数 ${n} 的盒高必须为正`).toBeGreaterThan(0);
    }
  });

  /**
   * 回归证据：原实现（写死 55px / 48px 盒高）在当前武器数下确实越界。
   * 这条断言保证上面的测试不是自我印证——它证明旧代码会被判红。
   */
  it('写死 55px 的原实现在 17 把武器下会越界', () => {
    const rows = Math.ceil(WEAPON_LIBRARY.length / 2);
    const legacyBottom = WEAPON_INDEX_FIRST_ROW_Y
      + (rows - 1) * LEGACY_ROW_STEP
      + LEGACY_BOX_HEIGHT / 2;
    expect(legacyBottom).toBe(687);
    expect(legacyBottom).toBeGreaterThan(FOOTER_RULE_Y);
  });
});

describe('武器库文案', () => {
  it('编队容量文案与实际上限一致', () => {
    // 写死「五槽 / 容量 5」会与同屏的 LOADOUT 6 / 6 自相矛盾。
    expect(MAX_WEAPON_LOADOUT_SIZE).toBe(6);
  });
});
