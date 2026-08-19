import { GAME_HEIGHT, GAME_WIDTH } from '../constants';

/**
 * 侧边空间低于这个宽度时，继续使用战场内的紧凑 HUD。
 * 取 120 的依据：低于 120px 的侧栏只放得下图标与数字，无法承载完整图文列，
 * 与其给一个残缺形态，不如直接回退战场内 HUD。
 *
 * 注意：`MIN_FIXED_SIDEBAR_WIDTH` 引入后 `sidebarWidth` 恒 >= 本值，
 * 因此 `'fallback'` 档已不可达，本常量只剩「压缩档下界」这一层语义。
 */
export const MIN_HUD_SIDEBAR_WIDTH = 120;
/** 侧边空间达到这个宽度时，展示完整刻度与详情。 */
export const FULL_HUD_SIDEBAR_WIDTH = 260;

/**
 * 侧栏 HUD 的固定最小宽度：任何视口尺寸下左右侧栏都必须存在。
 * 自然黑边不足时主动加宽逻辑画布，让 Phaser FIT 整体等比缩小换出侧栏空间。
 *
 * 必须恒等于 `MIN_HUD_SIDEBAR_WIDTH`。一旦小于它，`sidebarWidth` 会重新掉进 `'fallback'` 档，
 * 侧栏不再绘制、左右两条纯色黑边复现——症状是视觉回归而不是报错，极难定位。
 * 因此这里直接引用而非写死 120，避免两个常量各改一处后失去同步。
 */
export const MIN_FIXED_SIDEBAR_WIDTH = MIN_HUD_SIDEBAR_WIDTH;

/**
 * `'fallback'`（战场内 HUD）在 `MIN_FIXED_SIDEBAR_WIDTH` 生效后已不可达。
 * 保留原因：`HUDScene` 中由 `USE_SIDE_HUD` 控制的战场内布局分支尚未删除，
 * 删除涉及二十余处布局常量塌陷，属独立重构，需另开执行文档后再做。
 */
export type HudSidebarTier = 'fallback' | 'compact' | 'full';

export interface DisplayLayout {
  logicalWidth: number;
  /**
   * 不含「为满足最小侧栏宽度而强制加宽」的那部分逻辑宽度。
   * 仅供 `DisplayManager.resolveRenderScale()` 判定渲染倍率使用：
   * 若用 `logicalWidth` 作分母，强制加宽会把倍率从 2 压到 1，文字与 WebGL 缓冲精度直接减半。
   */
  naturalLogicalWidth: number;
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
  // 视口自然产生的黑边宽度。超宽屏这一项就够用，无需牺牲战场显示尺寸。
  const naturalSidebarWidth = Math.max(0, Math.ceil((aspectWidth - GAME_WIDTH) / 2));
  // 不足下界时取大：靠加宽逻辑画布换出侧栏空间，中央战场世界仍是完整的 GAME_WIDTH×GAME_HEIGHT。
  const sidebarWidth = Math.max(naturalSidebarWidth, MIN_FIXED_SIDEBAR_WIDTH);
  const logicalWidth = GAME_WIDTH + sidebarWidth * 2;
  const naturalLogicalWidth = GAME_WIDTH + naturalSidebarWidth * 2;
  const hudSidebarTier: HudSidebarTier = sidebarWidth >= FULL_HUD_SIDEBAR_WIDTH
    ? 'full'
    : sidebarWidth >= MIN_HUD_SIDEBAR_WIDTH
      ? 'compact'
      : 'fallback';

  return {
    logicalWidth,
    naturalLogicalWidth,
    sidebarWidth,
    hasHudSidebars: hudSidebarTier !== 'fallback',
    hudSidebarTier,
  };
}
