/**
 * G5-2 的 V3/V4 实景探针：确认第二关地面/铁轨/边界真的以位图出现在屏幕上。
 *
 * 为什么不能复用 `cdp_capture_settings.mjs` 的做法：那个脚本先 `mgr.stop()` 掉
 * PreloadScene 再直跳目标场景，于是贴图渲染成 `__MISSING`（该文件第 14-15 行已注明
 * "不能用它判断美术观感"）。而 G5-2 要验的恰恰是"位图有没有真的到屏幕上"，
 * 所以本脚本必须**等页面正常启动到主菜单**——那证明 PreloadScene 已跑完、
 * 纹理已进全局 TextureManager——之后才切 GameScene。
 *
 * 用法（需 npm run dev 已在提供服务）：
 *   node scripts/cdp_verify_battlefield_bitmap.mjs
 *
 * 注意 Vite 默认只监听 IPv6 回环，因此默认 URL 用 localhost 而不是 127.0.0.1。
 *
 * 产出：
 *   .debug-g52-bitmap/level2.png        第二关基线截图
 *   .debug-g52-bitmap/level1.png        第一关对照截图（回归项：其余关卡应仍为程序化）
 *   .debug-g52-bitmap/probe.json        全部只读探针结果
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';

const URL_TARGET = process.env.EZ_URL ?? 'http://localhost:5173/';
const PORT = Number(process.env.EZ_CDP_PORT ?? 9344);
const OUT_DIR = '.debug-g52-bitmap';

const CHROME_CANDIDATES = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
];

function findBrowser() {
  for (const p of CHROME_CANDIDATES) if (existsSync(p)) return p;
  throw new Error('未找到 Chrome/Edge，可用 EZ_CHROME 指定完整路径');
}

async function fetchJson(path) {
  const res = await fetch(`http://127.0.0.1:${PORT}${path}`);
  if (!res.ok) throw new Error(`CDP HTTP ${res.status} on ${path}`);
  return res.json();
}

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
      }, 25000);
    });
  }

  async evaluate(expression) {
    const r = await this.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (r.exceptionDetails) {
      // 必须把 exception.description 一起带出来：只报 text 时 Chrome 只给
      // "Uncaught" 三个字，定位不到任何东西。
      const d = r.exceptionDetails;
      const detail = d.exception?.description ?? d.exception?.value ?? JSON.stringify(d.exception ?? {});
      throw new Error(`页面内异常: ${d.text} :: ${detail}`);
    }
    return r.result.value;
  }
}

/** 等条件成立，不用固定 sleep 冒充状态等待（TESTING_RULES 12.2 第 5 条）。 */
async function waitFor(cdp, expression, label, tries = 60) {
  for (let i = 0; i < tries; i += 1) {
    if (await cdp.evaluate(expression)) return true;
    await sleep(500);
  }
  throw new Error(`等待超时：${label}`);
}

/** 分步执行并标注步骤名：失败时能立刻定位是哪一步，而不是只拿到一句 Uncaught。 */
async function step(label, fn) {
  process.stdout.write(`[cdp] ${label} ... `);
  try {
    const value = await fn();
    console.log('ok');
    return value;
  } catch (err) {
    console.log('失败');
    throw new Error(`步骤「${label}」: ${err.message}`);
  }
}

/**
 * 每步之后立刻落盘。
 *
 * 首版把 writeFileSync 放在脚本末尾，结果 level_1 回归步骤崩溃时，
 * 前面已经取得的 level_2 纹理、显示列表和像素证据**全部丢失**——
 * 这些恰好是本轮唯一要的东西。证据必须在拿到的那一刻就持久化，
 * 不能押在"脚本能跑到最后"这个前提上。
 */
function persist(outDir, result) {
  writeFileSync(`${outDir}/probe.json`, JSON.stringify(result, null, 2));
}

async function main() {
  if (typeof WebSocket !== 'function') throw new Error('此 Node 缺少全局 WebSocket（需 Node 22+）');
  mkdirSync(OUT_DIR, { recursive: true });

  const browserPath = process.env.EZ_CHROME ?? findBrowser();
  console.log(`[cdp] 浏览器 ${browserPath}`);
  console.log(`[cdp] 目标 ${URL_TARGET}`);

  const child = spawn(browserPath, [
    `--remote-debugging-port=${PORT}`,
    '--headless=new',
    '--disable-gpu',
    '--window-size=1280,720',
    // TESTING_RULES 9.3.1：不解除后台节流，rAF 停摆，Phaser 场景状态机永不推进。
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
    '--disable-background-timer-throttling',
    `--user-data-dir=${process.cwd()}/${OUT_DIR}/profile`,
    '--no-first-run',
    '--no-default-browser-check',
    'about:blank',
  ], { stdio: 'ignore', detached: false });

  const consoleErrors = [];
  const consoleWarnings = [];
  const result = {};

  try {
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
      if (m.method === 'Runtime.consoleAPICalled') {
        const text = m.params.args.map((a) => a.value ?? a.description).join(' ');
        if (m.params.type === 'error') consoleErrors.push(text);
        if (m.params.type === 'warning') consoleWarnings.push(text);
      }
      if (m.method === 'Log.entryAdded') {
        const e = m.params.entry;
        if (e.level === 'error') consoleErrors.push(e.text);
        if (e.level === 'warning') consoleWarnings.push(e.text);
      }
    });
    await cdp.send('Emulation.setFocusEmulationEnabled', { enabled: true });

    // 强制视口精确等于逻辑画布。仅靠 --window-size 不够：浏览器边框会把视口挤到
    // 1264x625，截图相对逻辑坐标的横纵缩放不一致（0.988 vs 0.868），
    // 按逻辑坐标取样会落到画布外的黑边上，把"画布外"误读成"地面是纯色"。
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 1280, height: 720, deviceScaleFactor: 1, mobile: false,
    });

    await cdp.send('Page.navigate', { url: URL_TARGET });
    await waitFor(cdp, `!!(window.__GAME__ && window.__GAME__.scene)`, 'window.__GAME__ 就绪');

    // 9.3.1 判别法：先确认帧在推进，否则"卡在预载"是节流而不是产品缺陷。
    const f1 = await cdp.evaluate(`window.__GAME__.loop.frame`);
    await sleep(1200);
    const f2 = await cdp.evaluate(`window.__GAME__.loop.frame`);
    result.frameAdvance = { before: f1, after: f2, advancing: f2 > f1 };
    if (f2 <= f1) throw new Error(`帧未推进（${f1} -> ${f2}），后台节流未解除`);
    console.log(`[cdp] 帧推进 ${f1} -> ${f2}`);

    // 关键：等主菜单 active，这才证明 PreloadScene 真的跑完、纹理已入 TextureManager。
    // 直跳会拿到 __MISSING，验不了"位图是否到屏幕上"。
    await waitFor(
      cdp,
      `!!window.__GAME__.scene.getScene('MainMenuScene')?.scene.isActive()`,
      'MainMenuScene active（即预载完成）',
      120,
    );
    console.log('[cdp] 预载完成，已到主菜单');

    // ---- V3：纹理是否真的在 TextureManager 里，且不是 __MISSING ----
    result.textures = await step('V3 纹理检查', () => cdp.evaluate(`
      (() => {
        const tm = window.__GAME__.textures;
        const keys = ['env-battlefield-level2-ground','env-battlefield-level2-rail','env-battlefield-level2-boundary'];
        const out = {};
        for (const k of keys) {
          const exists = tm.exists(k);
          let w = null, h = null, missing = null;
          if (exists) {
            const src = tm.get(k).getSourceImage();
            w = src.width; h = src.height;
            // __MISSING 是 Phaser 的占位纹理，尺寸恒为 32x32 且 key 不同；
            // 这里比对真实来源尺寸，能直接判出"纹理名存在但取到占位图"。
            missing = tm.get(k).key === '__MISSING';
          }
          out[k] = { exists, width: w, height: h, isMissingPlaceholder: missing };
        }
        return out;
      })()
    `));
    persist(OUT_DIR, result);

    // ---- V4：切第二关，检查显示列表与画面像素 ----
    await step('切到 level_2', () => cdp.evaluate(`
      (() => {
        const mgr = window.__GAME__.scene;
        mgr.stop('MainMenuScene');
        mgr.start('GameScene', { mode: 'level', levelId: 'level_2', characterId: 'watcher' });
        return true;
      })()
    `));
    await step('等 GameScene active', () =>
      waitFor(cdp, `!!window.__GAME__.scene.getScene('GameScene')?.scene.isActive()`, 'GameScene active'));
    await sleep(2500);

    result.level2DisplayList = await step('V4 显示列表', () => cdp.evaluate(`
      (() => {
        const s = window.__GAME__.scene.getScene('GameScene');
        const atGround = s.children.list.filter((o) => o.depth === 0);
        const byType = {};
        for (const o of atGround) byType[o.type] = (byType[o.type] || 0) + 1;
        return {
          totalAtGroundDepth: atGround.length,
          byType,
          tileSprites: atGround.filter((o) => o.type === 'TileSprite').map((o) => ({
            texture: o.texture?.key ?? null, w: Math.round(o.width), h: Math.round(o.height),
            x: Math.round(o.x), y: Math.round(o.y),
          })),
          images: atGround.filter((o) => o.type === 'Image').map((o) => ({
            texture: o.texture?.key ?? null, x: Math.round(o.x), y: Math.round(o.y),
            w: Math.round(o.displayWidth), h: Math.round(o.displayHeight),
          })),
        };
      })()
    `));
    persist(OUT_DIR, result);

    /**
     * 像素判据：这是本轮唯一能证明"位图真的到了屏幕上"的证据。
     *
     * 若地面仍是程序化纯色填充，取样区内像素几乎全等（stdev 接近 0）；
     * 位图瓦片带噪点，stdev 必然明显大于 0。铁轨带同理，且应比地面亮。
     */
    // 记录画布在页面中的真实矩形，供截图分析脚本换算坐标，
    // 不必假设"截图 == 逻辑画布"。
    result.canvasRect = await step('画布几何', () => cdp.evaluate(`
      (() => {
        const c = document.querySelector('canvas');
        const r = c.getBoundingClientRect();
        const cam = window.__GAME__.scene.getScene('GameScene')?.cameras?.main;
        return {
          cssLeft: Math.round(r.left), cssTop: Math.round(r.top),
          cssWidth: Math.round(r.width), cssHeight: Math.round(r.height),
          bufferWidth: c.width, bufferHeight: c.height,
          innerWidth: window.innerWidth, innerHeight: window.innerHeight,
          dpr: window.devicePixelRatio,
          // 逻辑画布宽度会被宽屏侧栏加宽（1280 -> 1520），战场世界仍是 1280x720
          // 但被推到画布中央。取样必须补这个偏移，否则一直在采左侧栏。
          scaleGameSize: {
            w: window.__GAME__.scale.gameSize.width,
            h: window.__GAME__.scale.gameSize.height,
          },
          // 相机在逻辑画布中的视口，即战场区域的真实位置。
          cameraViewport: cam ? {
            x: Math.round(cam.x), y: Math.round(cam.y),
            w: Math.round(cam.width), h: Math.round(cam.height),
            scrollX: Math.round(cam.scrollX), scrollY: Math.round(cam.scrollY),
          } : null,
        };
      })()
    `));
    persist(OUT_DIR, result);

    result.pixels = await step('V4 像素取样', () => cdp.evaluate(`
      (() => {
        const c = document.querySelector('canvas');
        const gl = c.getContext('webgl2') || c.getContext('webgl');
        const dpr = c.width / 1280;
        function sample(lx, ly, lw, lh) {
          const x = Math.round(lx * dpr), y = Math.round(ly * dpr);
          const w = Math.max(1, Math.round(lw * dpr)), h = Math.max(1, Math.round(lh * dpr));
          const buf = new Uint8Array(w * h * 4);
          // WebGL 读取原点在左下，需翻转 y。
          gl.readPixels(x, c.height - y - h, w, h, gl.RGBA, gl.UNSIGNED_BYTE, buf);
          const lums = [];
          let rs = 0, gs = 0, bs = 0;
          for (let i = 0; i < buf.length; i += 4) {
            rs += buf[i]; gs += buf[i+1]; bs += buf[i+2];
            lums.push(0.299*buf[i] + 0.587*buf[i+1] + 0.114*buf[i+2]);
          }
          const n = lums.length;
          const mean = lums.reduce((a,b)=>a+b,0)/n;
          const stdev = Math.sqrt(lums.reduce((a,b)=>a+(b-mean)**2,0)/n);
          const uniq = new Set(lums.map((v)=>Math.round(v))).size;
          return {
            meanColor: '#' + [rs/n, gs/n, bs/n].map((v)=>Math.round(v).toString(16).padStart(2,'0')).join(''),
            meanLum: +mean.toFixed(1), stdev: +stdev.toFixed(2), distinctLums: uniq, samples: n,
          };
        }
        return {
          dpr,
          canvas: { w: c.width, h: c.height },
          // 中央维修通道内的空地：应是位图地面 + 半透明通道底色
          groundOpenArea: sample(600, 330, 60, 40),
          // 上铁轨带内部（y=92..208），应比地面亮且方差更大
          railBandTop: sample(600, 130, 60, 40),
          // 下铁轨带
          railBandBottom: sample(600, 550, 60, 40),
          // 顶边界带（y=0..20）
          boundaryTop: sample(600, 4, 60, 12),
          // 左边界带（x=0..20）
          boundaryLeft: sample(4, 300, 12, 60),
        };
      })()
    `));
    persist(OUT_DIR, result);

    await step('截图 level2', async () => {
      const shot2 = await cdp.send('Page.captureScreenshot', { format: 'png' });
      writeFileSync(`${OUT_DIR}/level2.png`, Buffer.from(shot2.data, 'base64'));
    });

    // ---- V4 回归：第一关必须仍是程序化（无 TileSprite、无位图键） ----
    //
    // 整段包在 try 里：`mgr.stop('GameScene')` 会触发 GameScene.handleShutdown →
    // EffectSpritePool.destroy → ObjectPool.forEachActive，而该链在 Group 已被
    // Phaser 销毁后调 group.getChildren() 会抛 "reading 'entries'"。
    // 那是与 G5-2 无关的关停期问题，不能让它吞掉本轮的 level_2 结论。
    // 把它记成一条独立结果，而不是让整个脚本失败。
    try {
      await step('切到 level_1（回归）', () => cdp.evaluate(`
        (() => {
          const mgr = window.__GAME__.scene;
          mgr.stop('GameScene'); mgr.stop('HUDScene');
          mgr.start('GameScene', { mode: 'level', levelId: 'level_1', characterId: 'watcher' });
          return true;
        })()
      `));
      await step('等 GameScene(level_1) active', () =>
        waitFor(cdp, `!!window.__GAME__.scene.getScene('GameScene')?.scene.isActive()`, 'GameScene(level_1) active'));
      await sleep(2000);

      result.level1Regression = await step('V4 level_1 回归检查', () => cdp.evaluate(`
      (() => {
        const s = window.__GAME__.scene.getScene('GameScene');
        const atGround = s.children.list.filter((o) => o.depth === 0);
        const byType = {};
        for (const o of atGround) byType[o.type] = (byType[o.type] || 0) + 1;
        const usesBitmapKeys = atGround.some((o) =>
          typeof o.texture?.key === 'string' && o.texture.key.startsWith('env-battlefield-'));
        return { totalAtGroundDepth: atGround.length, byType, usesBitmapKeys };
      })()
      `));
      persist(OUT_DIR, result);

      await step('截图 level1', async () => {
        const shot1 = await cdp.send('Page.captureScreenshot', { format: 'png' });
        writeFileSync(`${OUT_DIR}/level1.png`, Buffer.from(shot1.data, 'base64'));
      });
    } catch (err) {
      result.level1Regression = { blocked: true, reason: err.message };
      console.log(`[cdp] level_1 回归被关停期异常阻断（不影响 level_2 结论）：${err.message}`);
    }

    result.consoleErrors = consoleErrors;
    // 只留与本轮相关的告警，避免整份日志噪声淹没结论。
    result.relevantWarnings = consoleWarnings.filter((w) =>
      /battlefield|Battlefield|texture|MISSING/i.test(w));

    persist(OUT_DIR, result);
    console.log('\n' + JSON.stringify(result, null, 2));
    console.log(`\n[cdp] 证据写入 ${OUT_DIR}/`);
  } finally {
    try { child.kill(); } catch {}
  }
}

main().catch((err) => {
  console.error(`[cdp] 失败: ${err.message}`);
  process.exitCode = 1;
});
