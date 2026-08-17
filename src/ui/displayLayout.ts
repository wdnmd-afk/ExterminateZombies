import { GAME_HEIGHT, GAME_WIDTH } from '../constants';

/** 侧边空间低于这个宽度时，继续使用战场内的紧凑 HUD。 */
export const MIN_HUD_SIDEBAR_WIDTH = 180;

export interface DisplayLayout {
  logicalWidth: number;
  sidebarWidth: number;
  hasHudSidebars: boolean;
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

  return {
    logicalWidth,
    sidebarWidth,
    hasHudSidebars: sidebarWidth >= MIN_HUD_SIDEBAR_WIDTH,
  };
}
