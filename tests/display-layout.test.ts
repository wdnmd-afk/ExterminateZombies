import { describe, expect, it } from 'vitest';
import { GAME_WIDTH } from '../src/constants';
import {
  FULL_HUD_SIDEBAR_WIDTH,
  MIN_FIXED_SIDEBAR_WIDTH,
  MIN_HUD_SIDEBAR_WIDTH,
  resolveDisplayLayout,
} from '../src/ui/displayLayout';

/** 覆盖各档位与退化输入，供「任何视口都有侧栏」这条不变量做全量校验。 */
const ALL_VIEWPORTS: Array<[number, number]> = [
  [1920, 1080],
  [2560, 1440],
  [3840, 2160],
  [1920, 1200],
  [2560, 1600],
  [1920, 919],
  [1920, 910],
  [1680, 900],
  [1366, 700],
  [800, 1400],
  [2560, 1080],
  [3200, 1280],
  [3440, 1440],
  [3840, 1600],
  [5120, 1440],
  [0, Number.NaN],
];

describe('宽屏显示布局', () => {
  // 两个常量一旦失去同步，sidebarWidth 会掉回 fallback 档、黑边复现，且症状是视觉回归不是报错。
  it('固定侧栏下限与压缩档下界保持同步', () => {
    expect(MIN_FIXED_SIDEBAR_WIDTH).toBe(MIN_HUD_SIDEBAR_WIDTH);
  });

  // 核心不变量：用户要求任何视口尺寸下左右侧栏都必须存在。
  it('任何视口都产生不低于下限的侧栏且不落回战场内 HUD', () => {
    for (const [width, height] of ALL_VIEWPORTS) {
      const layout = resolveDisplayLayout(width, height);

      expect(layout.sidebarWidth).toBeGreaterThanOrEqual(MIN_FIXED_SIDEBAR_WIDTH);
      expect(layout.hasHudSidebars).toBe(true);
      expect(layout.hudSidebarTier).not.toBe('fallback');
    }
  });

  it('16:9 视口靠加宽逻辑画布换出固定侧栏', () => {
    expect(resolveDisplayLayout(1920, 1080)).toEqual({
      logicalWidth: 1520,
      naturalLogicalWidth: GAME_WIDTH,
      sidebarWidth: MIN_FIXED_SIDEBAR_WIDTH,
      hasHudSidebars: true,
      hudSidebarTier: 'compact',
    });
  });

  // 支持范围：16:9 / 16:10 自然黑边为 0，全靠下限兜出侧栏，因此渲染倍率必须另用自然逻辑宽判定。
  it('全部正常屏幕比例的自然黑边为 0 但仍获得压缩侧栏', () => {
    const normalViewports: Array<[number, number]> = [
      [1920, 1080],
      [2560, 1440],
      [3840, 2160],
      [1920, 1200],
      [2560, 1600],
    ];

    for (const [width, height] of normalViewports) {
      const layout = resolveDisplayLayout(width, height);

      expect(layout.naturalLogicalWidth).toBe(GAME_WIDTH);
      expect(layout.sidebarWidth).toBe(MIN_FIXED_SIDEBAR_WIDTH);
      expect(layout.logicalWidth).toBe(1520);
      expect(layout.hudSidebarTier).toBe('compact');
    }
  });

  it('常见超宽视口为中央战场保留等宽压缩侧栏', () => {
    expect(resolveDisplayLayout(2560, 1080)).toEqual({
      logicalWidth: 1708,
      naturalLogicalWidth: 1708,
      sidebarWidth: 214,
      hasHudSidebars: true,
      hudSidebarTier: 'compact',
    });
  });

  it('宽高比达到 2.5 时启用完整侧栏', () => {
    expect(resolveDisplayLayout(3200, 1280)).toEqual({
      logicalWidth: 1800,
      naturalLogicalWidth: 1800,
      sidebarWidth: 260,
      hasHudSidebars: true,
      hudSidebarTier: 'full',
    });
  });

  // 原用例验证「较窄黑边回退战场内 HUD」，该语义已随固定侧栏消失，改为验证取大生效。
  it('自然黑边不足下限时由固定下限顶替', () => {
    const layout = resolveDisplayLayout(1680, 900);

    // 1680×900 的自然黑边只有 32px，远低于下限。
    expect(layout.naturalLogicalWidth).toBe(GAME_WIDTH + 32 * 2);
    expect(layout.sidebarWidth).toBe(MIN_FIXED_SIDEBAR_WIDTH);
    expect(layout.hasHudSidebars).toBe(true);
    expect(layout.hudSidebarTier).toBe('compact');
  });

  // 阈值本身未删，只是 fallback 一侧不再可达；full 边界仍需回归保护。
  it('三档阈值边界只由剩余侧栏宽度决定', () => {
    // 自然值 119 低于下限，被顶到 120 后进入压缩档，不再落回 fallback。
    expect(resolveDisplayLayout(GAME_WIDTH + 119 * 2, 720).sidebarWidth).toBe(MIN_FIXED_SIDEBAR_WIDTH);
    expect(resolveDisplayLayout(GAME_WIDTH + 119 * 2, 720).hudSidebarTier).toBe('compact');
    expect(resolveDisplayLayout(GAME_WIDTH + MIN_HUD_SIDEBAR_WIDTH * 2, 720).hudSidebarTier).toBe('compact');
    expect(resolveDisplayLayout(GAME_WIDTH + 259 * 2, 720).hudSidebarTier).toBe('compact');
    expect(resolveDisplayLayout(GAME_WIDTH + FULL_HUD_SIDEBAR_WIDTH * 2, 720).hudSidebarTier).toBe('full');
  });

  it('1920×910 视口的自然黑边正好等于固定下限', () => {
    expect(resolveDisplayLayout(1920, 910)).toEqual({
      logicalWidth: 1520,
      naturalLogicalWidth: 1520,
      sidebarWidth: MIN_HUD_SIDEBAR_WIDTH,
      hasHudSidebars: true,
      hudSidebarTier: 'compact',
    });
  });

  // 窗口化 1080p 的实际视口：这 113px 曾被 120 阈值挡在门外，是黑边现象的直接成因。
  it('窗口化 1080p 视口的自然黑边低于下限', () => {
    const layout = resolveDisplayLayout(1920, 919);

    expect(layout.naturalLogicalWidth).toBe(GAME_WIDTH + 113 * 2);
    expect(layout.sidebarWidth).toBe(MIN_FIXED_SIDEBAR_WIDTH);
    expect(layout.hudSidebarTier).toBe('compact');
  });

  // 21:9 是自然黑边就足够的最窄比例，落点变化会直接改变支持范围。
  it('主流 21:9 视口进入压缩侧栏且不受下限影响', () => {
    const ultrawide = resolveDisplayLayout(3440, 1440);

    expect(ultrawide.sidebarWidth).toBe(220);
    expect(ultrawide.naturalLogicalWidth).toBe(ultrawide.logicalWidth);
    expect(ultrawide.hudSidebarTier).toBe('compact');
    expect(resolveDisplayLayout(3840, 1600).hudSidebarTier).toBe('compact');
  });

  it('无效视口尺寸回退到 16:9 并同样受下限保护', () => {
    expect(resolveDisplayLayout(0, Number.NaN)).toEqual({
      logicalWidth: 1520,
      naturalLogicalWidth: GAME_WIDTH,
      sidebarWidth: MIN_FIXED_SIDEBAR_WIDTH,
      hasHudSidebars: true,
      hudSidebarTier: 'compact',
    });
  });
});
