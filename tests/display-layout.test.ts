import { describe, expect, it } from 'vitest';
import { GAME_WIDTH } from '../src/constants';
import { MIN_HUD_SIDEBAR_WIDTH, resolveDisplayLayout } from '../src/ui/displayLayout';

describe('宽屏显示布局', () => {
  it('16:9 视口保持原始战场宽度并使用战场内 HUD', () => {
    expect(resolveDisplayLayout(1920, 1080)).toEqual({
      logicalWidth: GAME_WIDTH,
      sidebarWidth: 0,
      hasHudSidebars: false,
    });
  });

  it('超宽视口为中央战场保留等宽侧栏', () => {
    expect(resolveDisplayLayout(2560, 1080)).toEqual({
      logicalWidth: 1708,
      sidebarWidth: 214,
      hasHudSidebars: true,
    });
  });

  it('较窄黑边不会启用放不下信息的侧栏 HUD', () => {
    const layout = resolveDisplayLayout(1920, 900);

    expect(layout.sidebarWidth).toBeLessThan(MIN_HUD_SIDEBAR_WIDTH);
    expect(layout.hasHudSidebars).toBe(false);
  });

  it('无效视口尺寸回退到 16:9', () => {
    expect(resolveDisplayLayout(0, Number.NaN)).toEqual({
      logicalWidth: GAME_WIDTH,
      sidebarWidth: 0,
      hasHudSidebars: false,
    });
  });
});
