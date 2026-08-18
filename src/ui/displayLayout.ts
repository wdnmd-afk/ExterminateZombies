import { GAME_HEIGHT, GAME_WIDTH } from '../constants';

/**
 * 侧边空间低于这个宽度时，继续使用战场内的紧凑 HUD。
 * 取 120 的依据：低于 120px 的侧栏只放得下图标与数字，无法承载完整图文列，
 * 与其给一个残缺形态，不如直接回退战场内 HUD。
 * 注意全部 16:9 / 16:10 屏幕算出的侧栏宽度都是 0，本来就走这一档。
 */
export const MIN_HUD_SIDEBAR_WIDTH = 120;
/** 侧边空间达到这个宽度时，展示完整刻度与详情。 */
export const FULL_HUD_SIDEBAR_WIDTH = 260;

export type HudSidebarTier = 'fallback' | 'compact' | 'full';

export interface DisplayLayout {
  logicalWidth: number;
  sidebarWidth: number;
  hasHudSidebars: boolean;
  hudSidebarTier: HudSidebarTier;
}

/**
 * 保持中央战场为 16:9，只把更宽视口多出的空间纳入渲染画布。
 * 逻辑宽度固定为偶数，让左右侧栏始终拥有整数坐标和完全相同的宽度。
 */
export function resolveDisplayLayout(viewportWidth: number, viewportHeight: number): DisplayLayout {
  const safeWidth = Number.isFinite(viewportWidth) && viewportWidth > 0 ? viewportWidth : GAME_WIDTH;
  const safeHeight = Number.isFinite(viewportHeight) && viewportHeight > 0 ? viewportHeight : GAME_HEIGHT;
  const aspectWidth = GAME_HEIGHT * (safeWidth / safeHeight);
  const sidebarWidth = Math.max(0, Math.ceil((aspectWidth - GAME_WIDTH) / 2));
  const logicalWidth = GAME_WIDTH + sidebarWidth * 2;
  const hudSidebarTier: HudSidebarTier = sidebarWidth >= FULL_HUD_SIDEBAR_WIDTH
    ? 'full'
    : sidebarWidth >= MIN_HUD_SIDEBAR_WIDTH
      ? 'compact'
      : 'fallback';

  return {
    logicalWidth,
    sidebarWidth,
    hasHudSidebars: hudSidebarTier !== 'fallback',
    hudSidebarTier,
  };
}
