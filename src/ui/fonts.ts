import puhuitiFontUrl from '../assets/downloaded/fonts/alibaba-puhuiti-3/AlibabaPuHuiTi-3-55-Regular.woff2?url';

export const UI_FONT_NAME = 'Alibaba PuHuiTi 3.0';

/**
 * 兜底链保留常见简中系统字体，字体请求失败时仍能显示中文而不是方块。
 * 兜底字体的量度与普惠体不同，因此面板一律走 `src/ui/layout.ts` 的实测排版。
 */
export const UI_FONT_FAMILY = `"${UI_FONT_NAME}", "Microsoft YaHei", "PingFang SC", "Noto Sans SC", sans-serif`;

let fontLoadPromise: Promise<void> | null = null;

/**
 * Phaser Text 会在创建时缓存文字量度，因此首个 Text 出现前必须完成字体加载。
 * 加载失败时保留系统兜底，让启动流程可继续并留下明确错误。
 *
 * 必须用 FontFace 显式加载字体文件，不能改成 `<link>` 样式表 + `document.fonts.ready`：
 * `@font-face` 只在 DOM 里有元素真正用到该字族时才触发下载，而本项目全部文字都画在
 * canvas 上，DOM 侧没有使用者，`document.fonts.ready` 会立刻 resolve。那样 Phaser 会
 * 用兜底字体量出 ascent/descent 并按 font 字符串缓存，之后字体到位也不会重算，
 * 于是 HUD 与结算面板的行距、行位全部对不上（字体错位的直接来源）。
 */
export function loadUiFont(): Promise<void> {
  if (fontLoadPromise) return fontLoadPromise;
  if (typeof document === 'undefined' || typeof FontFace === 'undefined') {
    return Promise.resolve();
  }

  fontLoadPromise = (async () => {
    const font = new FontFace(UI_FONT_NAME, `url(${puhuitiFontUrl}) format("woff2")`, {
      style: 'normal',
      weight: '400',
    });
    const loadedFont = await font.load();
    document.fonts.add(loadedFont);
    await document.fonts.ready;
  })().catch((error: unknown) => {
    console.error('阿里巴巴普惠体加载失败，将使用系统兜底字体。', error);
  });

  return fontLoadPromise;
}
