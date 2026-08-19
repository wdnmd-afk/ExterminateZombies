import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from '../constants';
import {
  resolveDisplayLayout,
  type DisplayLayout,
  type HudSidebarTier,
} from '../ui/displayLayout';

const MAX_RENDER_SCALE = 2;
const DISPLAY_RESIZE_DEBOUNCE_MS = 150;

let displayLayout = resolveDisplayLayout(
  typeof window === 'undefined' ? GAME_WIDTH : window.innerWidth,
  typeof window === 'undefined' ? GAME_HEIGHT : window.innerHeight,
);

/**
 * 根据物理屏幕像素选择渲染倍率。
 * 游戏仍使用 1280×720 逻辑坐标，仅提高 WebGL 缓冲区和文字纹理精度。
 */
function resolveRenderScale(layout: DisplayLayout): number {
  if (typeof window === 'undefined') return 1;

  const devicePixelRatio = Math.max(1, window.devicePixelRatio || 1);
  const physicalFit = Math.min(
    // 分母取自然逻辑宽而非实际逻辑宽：为固定侧栏而强制加宽只影响布局，
    // 不应把文字精度从 2 倍压到 1 倍。也不能只保留垂直项——
    // 那样 800×1400 这类窄高视口会拿到 2 倍率，白白分配远超视口宽度的缓冲。
    (window.innerWidth * devicePixelRatio) / layout.naturalLogicalWidth,
    (window.innerHeight * devicePixelRatio) / GAME_HEIGHT,
  );

  return Phaser.Math.Clamp(Math.ceil(physicalFit), 1, MAX_RENDER_SCALE);
}

export interface RuntimeDisplayLayout extends DisplayLayout {
  renderScale: number;
  renderWidth: number;
  renderHeight: number;
}

export type DisplayLayoutListener = (
  layout: Readonly<RuntimeDisplayLayout>,
  previous: Readonly<RuntimeDisplayLayout>,
) => void;

/** 渲染倍率在本次页面会话内保持稳定；动态布局只改变逻辑画布宽度。 */
export const DISPLAY_RENDER_SCALE = resolveRenderScale(displayLayout);
export let DISPLAY_LOGICAL_WIDTH = displayLayout.logicalWidth;
export let DISPLAY_SIDEBAR_WIDTH = displayLayout.sidebarWidth;
export let DISPLAY_HAS_HUD_SIDEBARS = displayLayout.hasHudSidebars;
export let DISPLAY_HUD_SIDEBAR_TIER: HudSidebarTier = displayLayout.hudSidebarTier;
export let DISPLAY_RENDER_WIDTH = DISPLAY_LOGICAL_WIDTH * DISPLAY_RENDER_SCALE;
export const DISPLAY_RENDER_HEIGHT = GAME_HEIGHT * DISPLAY_RENDER_SCALE;

const displayLayoutListeners = new Set<DisplayLayoutListener>();

export function getRuntimeDisplayLayout(): Readonly<RuntimeDisplayLayout> {
  return {
    ...displayLayout,
    renderScale: DISPLAY_RENDER_SCALE,
    renderWidth: DISPLAY_RENDER_WIDTH,
    renderHeight: DISPLAY_RENDER_HEIGHT,
  };
}

export function subscribeDisplayLayout(listener: DisplayLayoutListener): () => void {
  displayLayoutListeners.add(listener);
  return () => displayLayoutListeners.delete(listener);
}

function applyDisplayLayout(game: Phaser.Game, nextLayout: DisplayLayout): void {
  if (nextLayout.logicalWidth === DISPLAY_LOGICAL_WIDTH
    && nextLayout.sidebarWidth === DISPLAY_SIDEBAR_WIDTH
    && nextLayout.hudSidebarTier === DISPLAY_HUD_SIDEBAR_TIER) return;

  const previous = getRuntimeDisplayLayout();
  displayLayout = nextLayout;
  DISPLAY_LOGICAL_WIDTH = nextLayout.logicalWidth;
  DISPLAY_SIDEBAR_WIDTH = nextLayout.sidebarWidth;
  DISPLAY_HAS_HUD_SIDEBARS = nextLayout.hasHudSidebars;
  DISPLAY_HUD_SIDEBAR_TIER = nextLayout.hudSidebarTier;
  DISPLAY_RENDER_WIDTH = DISPLAY_LOGICAL_WIDTH * DISPLAY_RENDER_SCALE;

  // 保持中央战场逻辑尺寸不变，只修改包含左右侧栏的渲染画布宽度。
  game.scale.setGameSize(DISPLAY_RENDER_WIDTH, DISPLAY_RENDER_HEIGHT);
  const current = getRuntimeDisplayLayout();
  for (const listener of [...displayLayoutListeners]) listener(current, previous);
}

/** 监听窗口与全屏变化；返回清理函数，便于未来销毁或热重载时解除监听。 */
export function installResponsiveDisplay(game: Phaser.Game): () => void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return () => undefined;

  let resizeTimer: number | null = null;
  const schedule = (): void => {
    if (resizeTimer !== null) window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => {
      resizeTimer = null;
      applyDisplayLayout(game, resolveDisplayLayout(window.innerWidth, window.innerHeight));
    }, DISPLAY_RESIZE_DEBOUNCE_MS);
  };
  const cleanup = (): void => {
    if (resizeTimer !== null) window.clearTimeout(resizeTimer);
    resizeTimer = null;
    window.removeEventListener('resize', schedule);
    document.removeEventListener('fullscreenchange', schedule);
    game.events.off(Phaser.Core.Events.DESTROY, cleanup);
  };

  window.addEventListener('resize', schedule);
  document.addEventListener('fullscreenchange', schedule);
  game.events.once(Phaser.Core.Events.DESTROY, cleanup);
  return cleanup;
}

interface HighResolutionSceneOptions {
  /** HUD 使用完整宽画布；其它场景只渲染中央 16:9 战场。 */
  includeSidebars?: boolean;
}

/**
 * 为场景接入统一高清摄像机与文字纹理。
 * 必须在场景 create() 的首行调用，确保后续动态文字也能被监听到。
 */
export function configureHighResolutionScene(
  scene: Phaser.Scene,
  options: HighResolutionSceneOptions = {},
): void {
  const applyCameraLayout = (): void => {
    const viewportWidth = (options.includeSidebars ? DISPLAY_LOGICAL_WIDTH : GAME_WIDTH)
      * DISPLAY_RENDER_SCALE;
    const viewportLeft = (DISPLAY_RENDER_WIDTH - viewportWidth) / 2;

    scene.cameras.main
      .setViewport(viewportLeft, 0, viewportWidth, DISPLAY_RENDER_HEIGHT)
      .setZoom(DISPLAY_RENDER_SCALE)
      .centerOn(GAME_WIDTH / 2, GAME_HEIGHT / 2);
  };
  applyCameraLayout();

  const applyTextResolution = (gameObject: Phaser.GameObjects.GameObject): void => {
    if (gameObject instanceof Phaser.GameObjects.Text) {
      gameObject.setResolution(DISPLAY_RENDER_SCALE);
    }
  };

  // 正常调用点位于 create() 首行；保留已有对象遍历，防止未来场景在更晚阶段接入。
  scene.children.list.forEach(applyTextResolution);
  scene.events.on(Phaser.Scenes.Events.ADDED_TO_SCENE, applyTextResolution);
  const unsubscribeDisplayLayout = subscribeDisplayLayout(applyCameraLayout);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
    scene.events.off(Phaser.Scenes.Events.ADDED_TO_SCENE, applyTextResolution);
    unsubscribeDisplayLayout();
  });
}
