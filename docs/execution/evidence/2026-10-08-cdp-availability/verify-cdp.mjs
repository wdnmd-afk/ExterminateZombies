import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { createServer as createPortProbe } from 'node:net';
import { dirname, join, resolve } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const evidenceDirectory = dirname(fileURLToPath(import.meta.url));
const workspace = resolve(evidenceDirectory, '../../../..');
const profile = join(workspace, '.debug-cdp-availability-20261008');
const resultPath = join(evidenceDirectory, 'result.json');
const chromePath = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const endpoint = 'http://127.0.0.1:9336';
if (existsSync(resultPath) || existsSync(profile)) throw new Error('Use a fresh evidence directory and test profile');
if (!profile.startsWith(workspace + '/'.replace('/', process.platform === 'win32' ? '\\' : '/'))) {
  throw new Error('Test profile must stay within the workspace');
}

const result = {
  startedAt: new Date().toISOString(),
  passed: false,
  scope: 'Standalone local CDP connectivity and normal project boot, not a complete gameplay acceptance',
  fixture: 'Fresh isolated profile; no save, health, ammo or progression overrides',
  rendering: 'Headless Chrome with SwiftShader; not target-device performance evidence',
  errors: [],
  failedRequests: [],
};
let devServer;
let chrome;
let socket;
let sequence = 0;
const pending = new Map();

function send(method, params = {}) {
  const id = ++sequence;
  return new Promise((accept, reject) => {
    const timeout = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); }, 15000);
    pending.set(id, { accept, reject, timeout });
    socket.send(JSON.stringify({ id, method, params }));
  });
}

async function evaluate(expression) {
  const response = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (response.exceptionDetails) throw new Error(JSON.stringify(response.exceptionDetails));
  return response.result.value;
}

try {
  // 先证明端口空闲，避免误接到用户已有的调试浏览器。
  const probe = createPortProbe();
  await new Promise((accept, reject) => { probe.once('error', reject); probe.listen(9336, '127.0.0.1', accept); });
  await new Promise((accept, reject) => probe.close((error) => error ? reject(error) : accept()));
  await mkdir(profile, { recursive: false });
  devServer = await createServer({
    root: workspace,
    logLevel: 'warn',
    server: { host: '127.0.0.1', port: 0, strictPort: true, open: false },
  });
  await devServer.listen();
  const address = devServer.httpServer.address();
  if (!address || typeof address === 'string' || address.address !== '127.0.0.1') throw new Error('Unexpected Vite binding');
  result.url = `http://127.0.0.1:${address.port}/`;
  chrome = spawn(chromePath, [
    '--headless=new', '--remote-debugging-address=127.0.0.1', '--remote-debugging-port=9336',
    `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check',
    '--disable-background-networking', '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows',
    '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    '--window-size=1600,1000', '--force-device-scale-factor=1', 'about:blank',
  ], { windowsHide: true, stdio: 'ignore' });
  result.browserPid = chrome.pid;
  chrome.on('error', (error) => { result.browserLaunchError = error.message; });
  const connectionDeadline = Date.now() + 20000;
  let target;
  while (Date.now() < connectionDeadline) {
    if (result.browserLaunchError || chrome.exitCode !== null) throw new Error(result.browserLaunchError ?? 'Chrome exited before CDP connected');
    try {
      const response = await fetch(`${endpoint}/json/list`, { signal: AbortSignal.timeout(1000) });
      const targets = await response.json();
      target = targets.find((entry) => entry.type === 'page' && entry.url === 'about:blank');
      if (target) break;
    } catch {}
    await sleep(200);
  }
  if (!target) throw new Error('New isolated Chrome did not expose its blank test page');
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((accept, reject) => {
    socket.addEventListener('open', accept, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
  socket.addEventListener('message', ({ data }) => {
    const message = JSON.parse(data);
    const callback = pending.get(message.id);
    if (callback) {
      clearTimeout(callback.timeout);
      pending.delete(message.id);
      if (message.error) callback.reject(new Error(JSON.stringify(message.error)));
      else callback.accept(message.result);
    }
    if (message.method === 'Runtime.exceptionThrown') result.errors.push(message.params.exceptionDetails);
    if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') result.errors.push(message.params);
    if (message.method === 'Network.loadingFailed') result.failedRequests.push(message.params);
    if (message.method === 'Network.responseReceived' && message.params.response.status >= 400) {
      result.failedRequests.push({ url: message.params.response.url, status: message.params.response.status });
    }
  });
  result.browserVersion = await send('Browser.getVersion');
  await send('Runtime.enable');
  await send('Network.enable');
  await send('Page.enable');
  await send('Emulation.setFocusEmulationEnabled', { enabled: true });
  await send('Page.navigate', { url: result.url });
  const bootDeadline = Date.now() + 120000;
  while (Date.now() < bootDeadline) {
    if (await evaluate("Boolean(window.__GAME__?.scene.isActive('MainMenuScene'))")) {
      result.menuReady = true;
      break;
    }
    await sleep(300);
  }
  if (!result.menuReady) throw new Error('Project did not reach MainMenuScene through normal preload');
  await sleep(1000);
  result.snapshot = await evaluate(`(() => {
    const game = window.__GAME__;
    return {
      title: document.title,
      activeScenes: game.scene.getScenes(true).map(scene => scene.sys.settings.key),
      frame: game.loop.frame,
      fps: game.loop.actualFps,
      canvas: { width: game.canvas.width, height: game.canvas.height },
      visibility: document.visibilityState,
      fonts: document.fonts.status
    };
  })()`);
  const screenshot = await send('Page.captureScreenshot', { format: 'png' });
  await writeFile(join(evidenceDirectory, 'main-menu.png'), Buffer.from(screenshot.data, 'base64'), { flag: 'wx' });
  result.screenshot = 'main-menu.png';
  result.passed = result.errors.length === 0 && result.failedRequests.length === 0;
  if (!result.passed) process.exitCode = 1;
} catch (error) {
  result.error = error instanceof Error ? error.message : String(error);
  process.exitCode = 1;
} finally {
  if (socket?.readyState === WebSocket.OPEN) {
    try { await send('Browser.close'); } catch (error) { result.browserCloseNote = String(error); }
    socket.close();
  }
  if (chrome) {
    for (let attempt = 0; attempt < 30 && chrome.exitCode === null && chrome.signalCode === null; attempt++) await sleep(100);
    if (chrome.exitCode === null && chrome.signalCode === null) chrome.kill();
    result.browserClosed = chrome.exitCode !== null || chrome.signalCode !== null;
  }
  if (devServer) {
    try { await devServer.close(); result.devServerClosed = true; }
    catch (error) { result.cleanupError = String(error); result.passed = false; process.exitCode = 1; }
  }
  for (const callback of pending.values()) clearTimeout(callback.timeout);
  result.finishedAt = new Date().toISOString();
  await writeFile(resultPath, JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
}
console.log(JSON.stringify(result, null, 2));
