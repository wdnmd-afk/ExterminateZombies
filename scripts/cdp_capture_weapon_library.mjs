/**
 * CDP 探针：抓武器库页几何，验证武器索引末行不再压过页脚分隔线与页脚文案。
 *
 * 用法（需 npm run dev 已在 5173 提供服务）：
 *   node scripts/cdp_capture_weapon_library.mjs
 *
 * 注意：直跳场景时贴图会渲染成 __MISSING，这对验证几何没影响，
 * 但不能用它判断美术观感。
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';

const URL_TARGET = process.env.EZ_URL ?? 'http://localhost:5173/';
const PORT = Number(process.env.EZ_CDP_PORT ?? 9335);
const OUT_DIR = '.debug-weapon-library-layout';

const CHROME_CANDIDATES = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
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
    this.ws = ws; this.id = 0; this.pending = new Map();
    ws.addEventListener('message', (ev) => {
      const m = JSON.parse(ev.data);
      if (m.id && this.pending.has(m.id)) {
        const { resolve, reject } = this.pending.get(m.id);
        this.pending.delete(m.id);
        if (m.error) reject(new Error(JSON.stringify(m.error))); else resolve(m.result);
      }
    });
  }

  send(method, params = {}) {
    const id = ++this.id;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      setTimeout(() => { if (this.pending.delete(id)) reject(new Error(`CDP timeout: ${method}`)); }, 20000);
    });
  }

  async evaluate(expression) {
    const r = await this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(`页面内异常: ${r.exceptionDetails.text}`);
    return r.result.value;
  }
}

async function main() {
  if (typeof WebSocket !== 'function') throw new Error('此 Node 缺少全局 WebSocket（需要 Node 22+）');
  mkdirSync(OUT_DIR, { recursive: true });

  const browserPath = process.env.EZ_CHROME ?? findBrowser();
  console.log(`[cdp] 浏览器: ${browserPath}`);

  const child = spawn(browserPath, [
    `--remote-debugging-port=${PORT}`, '--headless=new', '--disable-gpu',
    '--window-size=1280,720', `--user-data-dir=${process.cwd()}/${OUT_DIR}/profile`,
    '--no-first-run', '--no-default-browser-check', 'about:blank',
  ], { stdio: 'ignore' });

  const consoleErrors = [];
  try {
    let version = null;
    for (let i = 0; i < 40; i += 1) {
      try { version = await fetchJson('/json/version'); break; } catch { await sleep(250); }
    }
    if (!version) throw new Error('CDP 端点未就绪');
    console.log(`[cdp] ${version.Browser}`);

    const page = (await fetchJson('/json/list')).find((t) => t.type === 'page');
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

    // 解锁全部武器并填满编队，让状态标签与槽位文案都渲染出来。
    await cdp.evaluate(`
      (() => {
        const mgr = window.__GAME__.scene;
        for (const k of ['GameScene','HUDScene','MainMenuScene','PreparationScene']) {
          try { mgr.stop(k); } catch {}
        }
        mgr.start('WeaponLibraryScene');
        return true;
      })()
    `);
    await sleep(2200);

    const geometry = await cdp.evaluate(`
      (() => {
        const s = window.__GAME__.scene.getScene('WeaponLibraryScene');
        if (!s) return { error: 'WeaponLibraryScene not found' };
        const rows = [], texts = [], rules = [];
        // 武器行嵌在两层 Container 里（外层是 createWeaponIndex 的分组容器，
        // 内层是每一行），所以必须递归并累加世界坐标——只遍历一层会得到 0 行，
        // 而 0 行会让「不压过页脚」的判定变成对 -Infinity 的比较，假通过。
        const walk = (node, ox, oy) => {
          const x = ox + (node.x ?? 0);
          const y = oy + (node.y ?? 0);
          if (node.type === 'Container' && Array.isArray(node.list)) {
            node.list.forEach((c) => walk(c, x, y));
            return;
          }
          if (node.type === 'Rectangle') {
            // 武器行盒体：宽 > 200 且高在 10..80 之间。
            if (node.width > 200 && node.height > 10 && node.height < 80) {
              rows.push({ y, h: node.height, top: y - node.height / 2, bottom: y + node.height / 2 });
            }
            // 分隔线：极扁且很宽。
            if (node.height <= 3 && node.width > 400) rules.push({ y, w: node.width });
          }
          if (node.type === 'Text' && typeof node.text === 'string' && node.text.length) {
            texts.push({ text: node.text, x: Math.round(x), y: Math.round(y) });
          }
        };
        s.children.list.forEach((o) => walk(o, 0, 0));
        return { rows, texts, rules };
      })()
    `);

    const shot = await cdp.send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(`${OUT_DIR}/weapon-library.png`, Buffer.from(shot.data, 'base64'));
    writeFileSync(`${OUT_DIR}/geometry.json`, JSON.stringify({ geometry, consoleErrors }, null, 2));

    const rows = geometry.rows ?? [];
    const lowestRow = rows.reduce((m, r) => Math.max(m, r.bottom), -Infinity);
    const footerRule = (geometry.rules ?? []).filter((r) => r.y > 600).sort((a, b) => a.y - b.y)[0];
    const footerTexts = (geometry.texts ?? []).filter((t) => t.y >= 670);
    const subtitle = (geometry.texts ?? []).find((t) => /出战编队$/.test(t.text));
    const capacityHint = (geometry.texts ?? []).find((t) => /编队容量/.test(t.text));

    console.log('\n===== 判定 =====');
    console.log(`武器行数量          : ${rows.length}（期望 17）`);
    // 没抓到行就不能给结论：对 -Infinity 比较会永远「通过」。
    if (rows.length === 0) {
      console.log('探针未抓到任何武器行 —— 判定无效 ❌（不要当成通过）');
      process.exitCode = 1;
      return;
    }
    console.log(`最低行下沿          : ${lowestRow}`);
    console.log(`页脚分隔线 y        : ${footerRule ? footerRule.y : '未找到'}`);
    if (footerRule) {
      const gap = footerRule.y - lowestRow;
      console.log(`间隙                : ${gap}`);
      console.log(`压过页脚分隔线      : ${lowestRow > footerRule.y ? '仍然存在 ❌' : '已消除 ✅'}`);
    }
    footerTexts.forEach((t) => {
      console.log(`页脚文案 y=${t.y}      : ${JSON.stringify(t.text)} ${lowestRow > t.y ? '被压 ❌' : '未被压 ✅'}`);
    });
    console.log(`副标题              : ${subtitle ? JSON.stringify(subtitle.text) : '未找到'}`);
    console.log(`容量提示            : ${capacityHint ? JSON.stringify(capacityHint.text) : '未找到'}`);
    console.log(`控制台错误          : ${consoleErrors.length}`);
    if (consoleErrors.length) consoleErrors.slice(0, 5).forEach((e) => console.log(`  - ${e}`));
    console.log(`\n产出: ${OUT_DIR}/weapon-library.png, ${OUT_DIR}/geometry.json`);
  } finally {
    child.kill();
  }
}

main().catch((err) => {
  console.error('[cdp] 失败:', err.message);
  process.exit(1);
});
