import { mkdirSync, writeFileSync, appendFileSync } from 'node:fs';
import { resolve, join } from 'node:path';

export const out = resolve(process.env.EZ_EVIDENCE_DIR ?? 'docs/execution/evidence/2026-09-30-campaign-browser');
mkdirSync(out, { recursive: true });
const endpoint = process.env.EZ_CDP_ENDPOINT ?? 'http://127.0.0.1:9335';
export const sleep = (milliseconds) => new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));

export class CampaignBrowser {
  pending = new Map();
  sequence = 0;
  keys = new Set();
  errors = [];
  requests = new Map();
  failures = [];
  firing = false;
  mouse = { x: 0, y: 0 };

  async connect() {
    const targets = await (await fetch(`${endpoint}/json/list`)).json();
    const page = targets.find((target) => target.type === 'page');
    if (!page) throw new Error('隔离浏览器没有测试页');
    this.socket = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((ready, reject) => {
      this.socket.addEventListener('open', ready, { once: true });
      this.socket.addEventListener('error', reject, { once: true });
    });
    this.socket.addEventListener('message', ({ data }) => {
      const message = JSON.parse(data);
      if (this.pending.has(message.id)) {
        const callback = this.pending.get(message.id);
        this.pending.delete(message.id);
        clearTimeout(callback.timeout);
        if (message.error) callback.reject(new Error(JSON.stringify(message.error)));
        else callback.accept(message.result);
      }
      if (message.method === 'Runtime.exceptionThrown') this.errors.push(message.params.exceptionDetails);
      if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') this.errors.push(message.params);
      if (message.method === 'Network.requestWillBeSent') this.requests.set(message.params.requestId, message.params.request.url);
      if (message.method === 'Network.loadingFailed') this.failures.push({ ...message.params, url: this.requests.get(message.params.requestId) });
      if (message.method === 'Network.responseReceived' && message.params.response.status >= 400) this.failures.push(message.params.response);
    });
    this.socket.addEventListener('close', () => {
      for (const callback of this.pending.values()) {
        clearTimeout(callback.timeout);
        callback.reject(new Error('CDP 连接已关闭'));
      }
      this.pending.clear();
    });
    await this.send('Runtime.enable');
    await this.send('Page.enable');
    await this.send('Network.enable');
    await this.send('Emulation.setFocusEmulationEnabled', { enabled: true });
  }

  send(method, params = {}) {
    const id = ++this.sequence;
    return new Promise((accept, reject) => {
      const timeout = setTimeout(() => { this.pending.delete(id); reject(new Error(`CDP 超时：${method}`)); }, 30_000);
      this.pending.set(id, { accept, reject, timeout });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  async evaluate(expression) {
    const result = await this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
  }

  async wait(expression, label, timeout = 30_000) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      const result = await this.evaluate(expression);
      if (result) return result;
      await sleep(200);
    }
    throw new Error(`等待超时：${label}`);
  }

  log(name, value) {
    const entry = { at: new Date().toISOString(), name, value };
    appendFileSync(join(out, 'actions.jsonl'), `${JSON.stringify(entry)}\n`);
    console.log(name, JSON.stringify(value));
  }

  async screenshot(name) {
    const { data } = await this.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    writeFileSync(join(out, `${name}.png`), Buffer.from(data, 'base64'));
  }

  async key(code, down) {
    const key = code.startsWith('Key') ? code.slice(3).toLowerCase() : code.startsWith('Digit') ? code.slice(5) : code === 'Space' ? ' ' : code;
    const virtual = code.startsWith('Key') ? code.charCodeAt(3) : code.startsWith('Digit') ? code.charCodeAt(5) : { Enter: 13, Escape: 27, Space: 32, End: 35, Home: 36, ArrowLeft: 37, ArrowUp: 38, ArrowRight: 39, ArrowDown: 40 }[code];
    await this.send('Input.dispatchKeyEvent', { type: down ? 'keyDown' : 'keyUp', code, key, windowsVirtualKeyCode: virtual, nativeVirtualKeyCode: virtual });
    if (down) this.keys.add(code); else this.keys.delete(code);
  }

  async tap(code) { await this.key(code, true); await sleep(70); await this.key(code, false); }

  async point(sceneName, x, y) {
    return this.evaluate(`(() => {
      const game = window.__GAME__, scene = game.scene.getScene(${JSON.stringify(sceneName)});
      const point = scene.cameras.main.matrix.transformPoint(${x} - scene.cameras.main.scrollX, ${y} - scene.cameras.main.scrollY);
      const rect = game.canvas.getBoundingClientRect();
      return { x: rect.left + point.x * rect.width / game.scale.gameSize.width, y: rect.top + point.y * rect.height / game.scale.gameSize.height };
    })()`);
  }

  async move(sceneName, x, y) {
    this.mouse = await this.point(sceneName, x, y);
    await this.send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...this.mouse, buttons: this.firing ? 1 : 0 });
  }

  async fire(down) {
    await this.send('Input.dispatchMouseEvent', { type: down ? 'mousePressed' : 'mouseReleased', ...this.mouse, button: 'left', buttons: down ? 1 : 0, clickCount: 1 });
    this.firing = down;
  }

  async click(sceneName, x, y) { await this.move(sceneName, x, y); await this.fire(true); await sleep(80); await this.fire(false); await sleep(220); }

  async texts(sceneName) {
    return this.evaluate(`(() => {
      const scene = window.__GAME__.scene.getScene(${JSON.stringify(sceneName)}), result = [];
      const visit = (object, visible) => {
        visible = visible && object.visible !== false && object.alpha !== 0;
        if (visible && typeof object.text === 'string') { const bounds = object.getBounds(); result.push({ text: object.text, x: bounds.centerX, y: bounds.centerY, width: bounds.width, height: bounds.height }); }
        if (Array.isArray(object.list)) object.list.forEach(child => visit(child, visible));
      };
      scene.children.list.forEach(object => visit(object, true));
      return result;
    })()`);
  }

  async clickText(sceneName, text) {
    const found = (await this.texts(sceneName)).find((entry) => entry.text === text);
    if (!found) throw new Error(`未找到文字按钮：${sceneName} / ${text}`);
    await this.click(sceneName, found.x, found.y);
  }

  async snapshot() {
    return this.evaluate(`(() => {
      const game = window.__GAME__;
      if (!game) return { ready: false };
      const active = game.scene.getScenes(true).map(scene => scene.sys.settings.key);
      const result = { active, frame: game.loop.frame, fps: game.loop.actualFps, canvas: { width: game.scale.gameSize.width, height: game.scale.gameSize.height }, visible: document.visibilityState };
      const scene = game.scene.getScene('GameScene');
      if (active.some(name => ['GameScene', 'CardSelectionScene', 'LevelClearScene', 'GameOverScene'].includes(name))) {
        const state = scene.getState();
        if (state) {
          result.state = { mode: state.mode, levelId: state.levelId, wave: state.waveIndex, stats: state.stats, health: state.player.health, maxHealth: state.player.maxHealth, weapon: state.player.currentWeaponId, owned: state.player.ownedWeapons, magazines: state.player.ammoInMag, reserve: state.player.ammoReserve, medicines: state.player.medicines, enhancements: [...state.player.activeEnhancements] };
          result.diagnostics = scene.getCombatDiagnostics();
        }
      }
      return result;
    })()`);
  }

  async release() {
    for (const code of [...this.keys]) await this.key(code, false);
    if (this.firing) await this.fire(false);
  }

  async close(label) {
    await this.release();
    writeFileSync(join(out, `${label}-browser-events.json`), JSON.stringify({ errors: this.errors, failedRequests: this.failures, requests: this.requests.size }, null, 2));
    this.socket.close();
  }
}

if (process.argv[2] === 'boot') {
  const browser = new CampaignBrowser();
  try {
    await browser.connect();
    await browser.send('Page.navigate', { url: 'http://127.0.0.1:5173/' });
    await browser.wait("window.__GAME__?.scene.isActive('MainMenuScene')", '主菜单预载', 60_000);
    await sleep(1000);
    const before = await browser.snapshot();
    await sleep(1500);
    const after = await browser.snapshot();
    browser.log('boot', { before, after, frameAdvances: after.frame > before.frame });
    await browser.screenshot('01-menu-new-save');
    browser.log('menu-text', await browser.texts('MainMenuScene'));
  } finally { if (browser.socket) await browser.close('boot'); }
}
