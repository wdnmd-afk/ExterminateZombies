import arkPixelFontUrl from '../assets/downloaded/fonts/ark-pixel-font-12px-proportional/ark-pixel-12px-proportional-zh_cn.woff2?url';

export const PIXEL_FONT_NAME = 'Ark Pixel 12px Proportional';
export const PIXEL_FONT_FAMILY = `"${PIXEL_FONT_NAME}", sans-serif`;

let fontLoadPromise: Promise<void> | null = null;

/**
 * Phaser Text 会在创建时缓存文字量度，因此首个 Text 出现前必须完成字体加载。
 * 加载失败时保留 sans-serif 兜底，让启动流程可继续并留下明确错误。
 */
export function loadPixelFont(): Promise<void> {
  if (fontLoadPromise) return fontLoadPromise;
  if (typeof document === 'undefined' || typeof FontFace === 'undefined') {
    return Promise.resolve();
  }

  fontLoadPromise = (async () => {
    const font = new FontFace(PIXEL_FONT_NAME, `url(${arkPixelFontUrl}) format("woff2")`, {
      style: 'normal',
      weight: '400',
    });
    const loadedFont = await font.load();
    document.fonts.add(loadedFont);
    await document.fonts.ready;
  })().catch((error: unknown) => {
    console.error('方舟像素字体加载失败，将使用浏览器兜底字体。', error);
  });

  return fontLoadPromise;
}
