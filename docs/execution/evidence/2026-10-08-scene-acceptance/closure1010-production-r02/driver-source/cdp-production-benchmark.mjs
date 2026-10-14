import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { cpus, totalmem, platform, release } from 'node:os';
import { join, relative, resolve } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { startAcceptanceSession } from './cdp-acceptance-session.mjs';

const seconds = Number(process.argv[4] ?? 30);
assert.ok(Number.isFinite(seconds) && seconds >= 10 && seconds <= 120);
const session = await startAcceptanceSession(process.argv[2] ?? 'production-baseline-r01', Number(process.argv[3] ?? 9357), { production: true });
const { browser, save, metadata } = session;
const dist = resolve('dist');
const files = directory => readdirSync(directory, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? files(join(directory, entry.name)) : entry.isFile() ? [join(directory, entry.name)] : []);
const point = (x, y) => browser.evaluate(`(() => {
  const canvas = document.querySelector('canvas'), rect = canvas.getBoundingClientRect();
  const logicalWidth = canvas.width / canvas.height * 720;
  return { x: rect.left + ((${x} + (logicalWidth - 1280) / 2) / logicalWidth) * rect.width, y: rect.top + ${y} / 720 * rect.height };
})()`);
const move = async (x, y) => { browser.mouse = await point(x, y); await browser.send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...browser.mouse, buttons: browser.firing ? 1 : 0 }); };
const click = async (x, y) => { await move(x, y); await browser.fire(true); await sleep(80); await browser.fire(false); await sleep(180); };

try {
  const build = files(dist).sort().map(path => { const bytes = readFileSync(path); return { path: relative(dist, path).replaceAll('\\', '/'), bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') }; });
  await save('build.json', { files: build, totalBytes: build.reduce((total, file) => total + file.bytes, 0), fingerprint: createHash('sha256').update(JSON.stringify(build)).digest('hex') });
  await save('scope.json', { productionOnly: true, gameGlobals: false, inputOnly: true, durationSeconds: seconds, device: { os: platform(), release: release(), cpu: cpus()[0]?.model, memoryBytes: totalmem(), gpu: metadata.gpu }, limitations: '本机 Chrome/headless 浏览器 rAF 基线；不是 Phaser FPS、150 敌压力、真人流畅度或目标低端设备认证。自动截图本身有开销。是否实际进入战斗须人工复核保存的画面。' });
  await browser.send('Performance.enable');
  await browser.tap('Digit2'); await sleep(700);
  await browser.screenshot('production-first-loadout');
  // 正式首次编队面板第一行：固定手枪之后的五把。坐标来自 PreparationScene 的六列布局。
  for (const column of [1, 2, 3, 4, 5]) await click(146 + column * 196, 194);
  await click(1138, 612);
  await browser.tap('Digit1'); await browser.tap('ArrowRight'); await browser.tap('ArrowRight');
  await browser.screenshot('production-preparation');
  await browser.tap('Enter'); await sleep(1400);
  await browser.screenshot('production-gameplay-start');
  assert.equal(await browser.evaluate('typeof window.__GAME__'), 'undefined');
  const before = await browser.send('Performance.getMetrics');
  await browser.evaluate(`(() => {
    const sample = { startedAt: performance.now(), intervals: [], longTasks: [], last: null, active: true };
    const frame = time => { if (!sample.active) return; if (sample.last !== null) sample.intervals.push(time - sample.last); sample.last = time; sample.handle = requestAnimationFrame(frame); };
    sample.handle = requestAnimationFrame(frame);
    if (PerformanceObserver.supportedEntryTypes.includes('longtask')) {
      sample.observer = new PerformanceObserver(list => sample.longTasks.push(...list.getEntries().map(entry => ({ startTime: entry.startTime, duration: entry.duration }))));
      sample.observer.observe({ entryTypes: ['longtask'] });
    }
    window.__PRODUCTION_CADENCE__ = sample;
  })()`);
  const started = Date.now();
  let movement = null, slot = null, nextCapture = 10000, nextHeal = 8000, nextSkill = 6000;
  while (Date.now() - started < seconds * 1000) {
    const elapsed = Date.now() - started;
    const nextMovement = ['KeyD', 'KeyS', 'KeyA', 'KeyW'][Math.floor(elapsed / 2500) % 4];
    if (movement !== nextMovement) { if (movement) await browser.key(movement, false); await browser.key(nextMovement, true); movement = nextMovement; }
    const nextSlot = [3, 4, 5, 6][Math.floor(elapsed / 6000) % 4];
    if (slot !== nextSlot) { await browser.tap(`Digit${nextSlot}`); slot = nextSlot; }
    await move(640 + Math.cos(elapsed / 1200) * 500, 360 + Math.sin(elapsed / 1200) * 275);
    await browser.fire(true); await sleep(210); await browser.fire(false); await sleep(160);
    if (elapsed >= nextHeal) { await browser.tap(nextHeal > 16000 ? 'KeyX' : 'KeyZ'); nextHeal += 8000; }
    if (elapsed >= nextSkill) { await browser.tap('KeyE'); nextSkill += 15000; }
    if (elapsed >= nextCapture) { await browser.screenshot(`production-gameplay-${nextCapture / 1000}`); nextCapture += 10000; }
  }
  await browser.release();
  const cadence = await browser.evaluate(`(() => {
    const sample = window.__PRODUCTION_CADENCE__; sample.active = false; cancelAnimationFrame(sample.handle); sample.observer?.disconnect();
    return { startedAt: sample.startedAt, finishedAt: performance.now(), intervals: sample.intervals, longTasks: sample.longTasks, visibility: document.visibilityState, viewport: { width: innerWidth, height: innerHeight, dpr: devicePixelRatio }, developerGlobalAbsent: typeof window.__GAME__ === 'undefined' };
  })()`);
  const after = await browser.send('Performance.getMetrics');
  await browser.screenshot('production-gameplay-final');
  await save('cadence.json', cadence);
  await save('performance-metrics.json', { before, after });
  const intervals = [...cadence.intervals].sort((first, second) => first - second);
  const percentile = fraction => intervals[Math.max(0, Math.ceil(intervals.length * fraction) - 1)];
  const mean = intervals.reduce((sum, value) => sum + value, 0) / intervals.length;
  const automatedChecksPassed = intervals.length > seconds * 5 && cadence.developerGlobalAbsent && browser.errors.length === 0 && browser.failures.length === 0;
  await save('result.json', { automatedChecksPassed, requiresScreenshotReview: true, measuredMilliseconds: cadence.finishedAt - cadence.startedAt, samples: intervals.length, rafHz: 1000 / mean, frameIntervalMs: { mean, p50: percentile(0.5), p95: percentile(0.95), p99: percentile(0.99), maximum: intervals.at(-1) }, intervalsOver50Ms: intervals.filter(value => value > 50).length, longTasks: cadence.longTasks.length, errors: browser.errors, failedRequests: browser.failures, certification: 'local-baseline-only' });
  assert.equal(automatedChecksPassed, true);
} catch (error) {
  process.exitCode = 1;
  await save('failure.json', { message: error.message, stack: error.stack });
  await browser.screenshot('failure').catch(() => {});
  console.error(error);
} finally {
  await browser.evaluate("if (window.__PRODUCTION_CADENCE__) { window.__PRODUCTION_CADENCE__.active = false; cancelAnimationFrame(window.__PRODUCTION_CADENCE__.handle); window.__PRODUCTION_CADENCE__.observer?.disconnect(); }").catch(() => {});
  await session.close();
}
