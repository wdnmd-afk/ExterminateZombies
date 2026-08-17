import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from '../constants';
import { resolveDisplayLayout } from '../ui/displayLayout';

const MAX_RENDER_SCALE = 2;

const DISPLAY_LAYOUT = resolveDisplayLayout(
  typeof window === 'undefined' ? GAME_WIDTH : window.innerWidth,
  typeof window === 'undefined' ? GAME_HEIGHT : window.innerHeight,
);

/**
 * 根据物理屏幕像素选择渲染倍率。
 * 游戏仍使用 1280×720 逻辑坐标，仅提高 WebGL 缓冲区和文字纹理精度。
 */
function resolveRenderScale(): number {
  if (typeof window === 'undefined') return 1;

  const devicePixelRatio = Math.max(1, window.devicePixelRatio || 1);
  const physicalFit = Math.min(
    (window.innerWidth * devicePixelRatio) / DISPLAY_LAYOUT.logicalWidth,
    (window.innerHeight * devicePixelRatio) / GAME_HEIGHT,
  );

  return Phaser.Math.Clamp(Math.ceil(physicalFit), 1, MAX_RENDER_SCALE);
}

export const DISPLAY_RENDER_SCALE = resolveRenderScale();
export const DISPLAY_LOGICAL_WIDTH = DISPLAY_LAYOUT.logicalWidth;
export const DISPLAY_SIDEBAR_WIDTH = DISPLAY_LAYOUT.sidebarWidth;
export const DISPLAY_HAS_HUD_SIDEBARS = DISPLAY_LAYOUT.hasHudSidebars;
export const DISPLAY_RENDER_WIDTH = DISPLAY_LOGICAL_WIDTH * DISPLAY_RENDER_SCALE;
export const DISPLAY_RENDER_HEIGHT = GAME_HEIGHT * DISPLAY_RENDER_SCALE;

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
  const viewportWidth = (options.includeSidebars ? DISPLAY_LOGICAL_WIDTH : GAME_WIDTH)
    * DISPLAY_RENDER_SCALE;
  const viewportLeft = (DISPLAY_RENDER_WIDTH - viewportWidth) / 2;

  scene.cameras.main
    .setViewport(viewportLeft, 0, viewportWidth, DISPLAY_RENDER_HEIGHT)
    .setZoom(DISPLAY_RENDER_SCALE)
    .centerOn(GAME_WIDTH / 2, GAME_HEIGHT / 2);

  const applyTextResolution = (gameObject: Phaser.GameObjects.GameObject): void => {
    if (gameObject instanceof Phaser.GameObjects.Text) {
      gameObject.setResolution(DISPLAY_RENDER_SCALE);
    }
  };

  // 正常调用点位于 create() 首行；保留已有对象遍历，防止未来场景在更晚阶段接入。
  scene.children.list.forEach(applyTextResolution);
  scene.events.on(Phaser.Scenes.Events.ADDED_TO_SCENE, applyTextResolution);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
    scene.events.off(Phaser.Scenes.Events.ADDED_TO_SCENE, applyTextResolution);
  });
}
