/**
 * 一次性 CDP 探针：抓设置页几何，验证键位网格与「音频设置 / 辅助选项」标题不再叠字。
 *
 * 为什么不用 Playwright：本机已装 Chrome，Node 22 自带全局 WebSocket，
 * 直接讲 CDP 就够了，不必为一次布局验证往 devDependencies 里加浏览器驱动。
 *
 * 用法（需 npm run dev 已在 5173 提供服务）：
 *   node scripts/cdp_capture_settings.mjs
 *
 * 产出：
 *   .debug-settings-layout/settings.png   截图
 *   .debug-settings-layout/geometry.json  真实运行时坐标
 *
 * 注意：本脚本用 scene.start 直跳设置页，贴图会渲染成 __MISSING。
 * 这对验证几何没影响，但不能用它判断美术观感。
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';

const URL_TARGET = process.env.EZ_URL ?? 'http://localhost:5173/';
const PORT = Number(process.env.EZ_CDP_PORT ?? 9333);
const OUT_DIR = '.debug-settings-layout';

const CHROME_CANDIDATES = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
];

function findBrowser() {
  for (const p of CHROME_CANDIDATES) {
    if (existsSync(p)) return p;
  }
  throw new Error('未找到 Chrome/Edge，可用 EZ_CHROME 指定完整路径');
}

async function fetchJson(path) {
  const res = await fetch(`http://127.0.0.1:${PORT}${path}`);
  if (!res.ok) throw new Error(`CDP HTTP ${res.status} on ${path}`);
  return res.json();
}

/** 极简 CDP 客户端：只需要 id 关联和 await 语义。 */
class Cdp {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(JSON.stringify(msg.error)));
        else resolve(msg.result);
      }
    });
  }

  send(method, params = {}) {
    const id = ++this.id;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`CDP timeout: ${method}`));
        }
      }, 20000);
    });
  }

  /** 求值并把异常显式抛出，避免静默拿到 undefined 当成"通过"。 */
  async evaluate(expression) {
    const r = await this.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (r.exceptionDetails) {
      throw new Error(`页面内异常: ${r.exceptionDetails.text} ${JSON.stringify(r.result?.value ?? '')}`);
    }
    return r.result.value;
  }
}

async function main() {
  if (typeof WebSocket !== 'function') {
    throw new Error('此 Node 缺少全局 WebSocket（需要 Node 22+）');
  }
  mkdirSync(OUT_DIR, { recursive: true });

  const browserPath = process.env.EZ_CHROME ?? findBrowser();
  console.log(`[cdp] 浏览器: ${browserPath}`);

  const child = spawn(browserPath, [
    `--remote-debugging-port=${PORT}`,
    '--headless=new',
    '--disable-gpu',
    '--window-size=1280,720',
    `--user-data-dir=${process.cwd()}/${OUT_DIR}/profile`,
    '--no-first-run',
    '--no-default-browser-check',
    'about:blank',
  ], { stdio: 'ignore', detached: false });

  const consoleErrors = [];
  try {
    // 等 CDP HTTP 端点就绪
    let version = null;
    for (let i = 0; i < 40; i += 1) {
      try { version = await fetchJson('/json/version'); break; } catch { await sleep(250); }
    }
    if (!version) throw new Error('CDP 端点未就绪');
    console.log(`[cdp] ${version.Browser}`);

    const targets = await fetchJson('/json/list');
    const page = targets.find((t) => t.type === 'page');
    if (!page) throw new Error('未找到 page target');

    const ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((res, rej) => {
      ws.addEventListener('open', res, { once: true });
      ws.addEventListener('error', rej, { once: true });
    });
    const cdp = new Cdp(ws);

    await cdp.send('Runtime.enable');
    await cdp.send('Page.enable');
    await cdp.send('Log.enable');
    ws.addEventListener('message', (ev) => {
      const m = JSON.parse(ev.data);
      if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
        consoleErrors.push(m.params.args.map((a) => a.value ?? a.description).join(' '));
      }
      if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') {
        consoleErrors.push(m.params.entry.text);
      }
    });

    await cdp.send('Page.navigate', { url: URL_TARGET });
    await sleep(3500);

    // 等 Phaser 起来
    // 不检查 window.Phaser：Phaser 是 ES module import，不会挂到全局。
    // main.ts 显式暴露的是 window.__GAME__，这才是可靠的就绪信号。
    const booted = await cdp.evaluate(`!!(window.__GAME__ && window.__GAME__.scene)`);
    if (!booted) {
      // 项目可能没把 game 挂到 window，退回从 canvas 找
      const hasCanvas = await cdp.evaluate(`!!document.querySelector('canvas')`);
      throw new Error(`Phaser 未就绪（canvas=${hasCanvas}）。需要页面暴露 window.__GAME__ 才能做场景跳转。`);
    }

    // 直跳设置页
    await cdp.evaluate(`
      (() => {
        const mgr = window.__GAME__.scene;
        for (const k of ['GameScene','HUDScene','MainMenuScene','PreparationScene']) {
          try { mgr.stop(k); } catch {}
        }
        mgr.start('SettingsScene');
        return true;
      })()
    `);
    await sleep(2000);

    // 抓真实几何：绑定行盒体 + 两个详情标题
    const geometry = await cdp.evaluate(`
      (() => {
        const s = window.__GAME__.scene.getScene('SettingsScene');
        if (!s) return { error: 'SettingsScene not found' };
        const rects = [], texts = [];
        s.children.list.forEach((o) => {
          if (o.type === 'Rectangle' && o.getData && o.getData('settingsControl')) {
            rects.push({ x: o.x, y: o.y, w: o.width, h: o.height,
                         top: o.y - o.height * o.originY, bottom: o.y + o.height * (1 - o.originY) });
          }
          if (o.type === 'Text' && typeof o.text === 'string' && o.text.length) {
            texts.push({ text: o.text, x: Math.round(o.x), y: Math.round(o.y),
                         top: Math.round(o.y - o.height * o.originY),
                         bottom: Math.round(o.y + o.height * (1 - o.originY)) });
          }
        });
        return { rects, texts };
      })()
    `);

    const shot = await cdp.send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(`${OUT_DIR}/settings.png`, Buffer.from(shot.data, 'base64'));
    writeFileSync(`${OUT_DIR}/geometry.json`, JSON.stringify({ geometry, consoleErrors }, null, 2));

    // 判定：绑定盒体下沿 vs 两个详情标题上沿
    const boxes = (geometry.rects ?? []).filter((r) => r.w === 360);
    const lowestBox = boxes.reduce((m, r) => Math.max(m, r.bottom), -Infinity);
    const headers = (geometry.texts ?? []).filter((t) => t.text === '音频设置' || t.text === '辅助选项');
    const weaponSix = (geometry.texts ?? []).find((t) => t.text === '武器栏 6');
    const sixValue = (geometry.texts ?? []).find((t) => t.text === 'SIX' || t.text === '6');

    console.log('\n===== 判定 =====');
    console.log(`绑定盒体数量        : ${boxes.length}（期望 20）`);
    console.log(`最低盒体下沿        : ${lowestBox}`);
    headers.forEach((h) => console.log(`标题 ${h.text} 上沿     : ${h.top}`));
    const minHeaderTop = headers.length ? Math.min(...headers.map((h) => h.top)) : NaN;
    console.log(`标题最小上沿        : ${minHeaderTop}`);
    console.log(`间隙                : ${minHeaderTop - lowestBox}`);
    console.log(`叠字               : ${lowestBox > minHeaderTop ? '仍然存在 ❌' : '已消除 ✅'}`);
    console.log(`「武器栏 6」标签    : ${weaponSix ? `y=${weaponSix.y} ✅` : '缺失 ❌'}`);
    console.log(`第 6 槽键位文案     : ${sixValue ? `"${sixValue.text}" ${sixValue.text === '6' ? '✅' : '❌ 仍是原始代号'}` : '未找到'}`);
    console.log(`控制台错误          : ${consoleErrors.length}`);
    if (consoleErrors.length) consoleErrors.slice(0, 5).forEach((e) => console.log(`  - ${e}`));
    console.log(`\n产出: ${OUT_DIR}/settings.png, ${OUT_DIR}/geometry.json`);
  } finally {
    child.kill();
  }
}

main().catch((err) => {
  console.error('[cdp] 失败:', err.message);
  process.exit(1);
});
