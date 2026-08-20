import puhuitiFontUrl from '../assets/downloaded/fonts/alibaba-puhuiti-3/AlibabaPuHuiTi-3-55-Regular.woff2?url';

export const UI_FONT_NAME = 'Alibaba PuHuiTi 3.0';

/**
 * 兜底链保留常见简中系统字体，字体请求失败时仍能显示中文而不是方块。
 * 兜底字体的量度与普惠体不同，因此面板一律走 `src/ui/layout.ts` 的实测排版。
 */
export const UI_FONT_FAMILY = `"${UI_FONT_NAME}", "Microsoft YaHei", "PingFang SC", "Noto Sans SC", sans-serif`;

/**
 * 字体加载超时上限（毫秒）。
 *
 * 普惠体 woff2 有 5.2MB，`FontFace.load()` 在请求挂起时既不 resolve 也不 reject，
 * 而 BootScene.create() 是 async 且 await 它之后才 `scene.start(preload)`，
 * 所以没有超时的话一次网络异常就会把启动流程永久停在 BOOTING 黑屏。
 */
const FONT_LOAD_TIMEOUT_MS = 8000;

/** 给永不 settle 的 Promise 补一个 reject 出口，让下游 catch 能接住并降级。 */
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer = 0;
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      timer = window.setTimeout(
        () => reject(new Error(`${label} 超时 ${ms}ms`)),
        ms,
      );
    }),
  ]).finally(() => window.clearTimeout(timer)) as Promise<T>;
}

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
    const loadedFont = await withTimeout(
      font.load(),
      FONT_LOAD_TIMEOUT_MS,
      '普惠体字体文件加载',
    );
    document.fonts.add(loadedFont);
    await withTimeout(
      document.fonts.ready,
      FONT_LOAD_TIMEOUT_MS,
      'document.fonts.ready',
    );
  })().catch((error: unknown) => {
    console.error('阿里巴巴普惠体加载失败，将使用系统兜底字体。', error);
  });

  return fontLoadPromise;
}
