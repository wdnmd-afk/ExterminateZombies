import { describe, expect, it } from 'vitest';
import { GAME_WIDTH } from '../src/constants';
import {
  FULL_HUD_SIDEBAR_WIDTH,
  MIN_HUD_SIDEBAR_WIDTH,
  resolveDisplayLayout,
} from '../src/ui/displayLayout';

describe('宽屏显示布局', () => {
  it('16:9 视口保持原始战场宽度并使用战场内 HUD', () => {
    expect(resolveDisplayLayout(1920, 1080)).toEqual({
      logicalWidth: GAME_WIDTH,
      sidebarWidth: 0,
      hasHudSidebars: false,
      hudSidebarTier: 'fallback',
    });
  });

  // 支持范围锁定：正常屏幕只指 16:9 / 16:10，两者算出的侧栏宽度都是 0，必须落在战场内 HUD。
  it('全部正常屏幕比例都不产生侧栏', () => {
    const normalViewports: Array<[number, number]> = [
      [1920, 1080],
      [2560, 1440],
      [3840, 2160],
      [1920, 1200],
      [2560, 1600],
    ];

    for (const [width, height] of normalViewports) {
      const layout = resolveDisplayLayout(width, height);

      expect(layout.sidebarWidth).toBe(0);
      expect(layout.hasHudSidebars).toBe(false);
      expect(layout.hudSidebarTier).toBe('fallback');
    }
  });

  it('常见超宽视口为中央战场保留等宽压缩侧栏', () => {
    expect(resolveDisplayLayout(2560, 1080)).toEqual({
      logicalWidth: 1708,
      sidebarWidth: 214,
      hasHudSidebars: true,
      hudSidebarTier: 'compact',
    });
  });

  it('宽高比达到 2.5 时启用完整侧栏', () => {
    expect(resolveDisplayLayout(3200, 1280)).toEqual({
      logicalWidth: 1800,
      sidebarWidth: 260,
      hasHudSidebars: true,
      hudSidebarTier: 'full',
    });
  });

  it('较窄黑边不会启用放不下信息的侧栏 HUD', () => {
    const layout = resolveDisplayLayout(1680, 900);

    expect(layout.sidebarWidth).toBeLessThan(MIN_HUD_SIDEBAR_WIDTH);
    expect(layout.hasHudSidebars).toBe(false);
    expect(layout.hudSidebarTier).toBe('fallback');
  });

  it('三档阈值边界只由剩余侧栏宽度决定', () => {
    expect(resolveDisplayLayout(GAME_WIDTH + 119 * 2, 720).hudSidebarTier).toBe('fallback');
    expect(resolveDisplayLayout(GAME_WIDTH + MIN_HUD_SIDEBAR_WIDTH * 2, 720).hudSidebarTier).toBe('compact');
    expect(resolveDisplayLayout(GAME_WIDTH + 259 * 2, 720).hudSidebarTier).toBe('compact');
    expect(resolveDisplayLayout(GAME_WIDTH + FULL_HUD_SIDEBAR_WIDTH * 2, 720).hudSidebarTier).toBe('full');
  });

  it('1920×910 视口正好落在压缩侧栏下边界', () => {
    expect(resolveDisplayLayout(1920, 910)).toEqual({
      logicalWidth: 1520,
      sidebarWidth: MIN_HUD_SIDEBAR_WIDTH,
      hasHudSidebars: true,
      hudSidebarTier: 'compact',
    });
  });

  // 21:9 是侧栏 HUD 实际服务的最窄比例，落点变化会直接改变支持范围。
  it('主流 21:9 视口进入压缩侧栏', () => {
    expect(resolveDisplayLayout(3440, 1440).hudSidebarTier).toBe('compact');
    expect(resolveDisplayLayout(3840, 1600).hudSidebarTier).toBe('compact');
  });

  it('无效视口尺寸回退到 16:9', () => {
    expect(resolveDisplayLayout(0, Number.NaN)).toEqual({
      logicalWidth: GAME_WIDTH,
      sidebarWidth: 0,
      hasHudSidebars: false,
      hudSidebarTier: 'fallback',
    });
  });
});
