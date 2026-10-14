import { spawn } from 'node:child_process';
import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { createServer as createPortProbe } from 'node:net';
import { join, relative, resolve } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { createServer } from 'vite';

export async function startAcceptanceSession(runId, port, options = {}) {
  if (!/^[a-z0-9-]+$/.test(runId)) throw new Error('Invalid acceptance run id');
  if (options.resumeRunId && !/^[a-z0-9-]+$/.test(options.resumeRunId)) throw new Error('Invalid resume run id');
  const workspace = resolve('.');
  const directory = join(workspace, 'docs/execution/evidence/2026-10-08-scene-acceptance', runId);
  const profile = join(workspace, `.debug-scene-${options.resumeRunId ?? runId}`);
  if (existsSync(directory) || (!options.resumeRunId && existsSync(profile))) throw new Error('Run directory already exists; preserve it and choose a new id');
  if (options.resumeRunId && !existsSync(profile)) throw new Error('Requested natural-save profile does not exist');
  if (relative(workspace, profile).startsWith('..')) throw new Error('Profile is outside workspace');
  const chromePath = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
  const endpoint = `http://127.0.0.1:${port}`;
  const metadata = { runId, startedAt: new Date().toISOString(), profile, endpoint, errors: [], independentProfile: true, resumedFrom: options.resumeRunId ?? null };
  metadata.sourceHashes = Object.fromEntries([...new Set(['src/scenes/GameScene.ts', 'src/scenes/SettingsScene.ts', 'src/systems/BattlefieldRenderer.ts', 'src/ui/components.ts', 'src/config/testing.ts', 'scripts/cdp-scene-acceptance.mjs', 'scripts/cdp-acceptance-session.mjs', 'scripts/cdp-combat-policy.mjs', relative(workspace, resolve(process.argv[1])).replaceAll('\\', '/')])].map(path => [path, createHash('sha256').update(readFileSync(join(workspace, path))).digest('hex')]));
  let devServer;
  let chrome;
  let browser;
  let closing = false;
  const save = async (name, value) => writeFile(join(directory, name), JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });
  const close = async () => {
    if (closing) return;
    closing = true;
    if (browser?.socket?.readyState === WebSocket.OPEN) {
      try {
        await browser.release();
        await save('browser-events.json', { errors: browser.errors, failedRequests: browser.failures, requests: browser.requests.size });
        await browser.send('Browser.close');
      } catch (error) { if (error.message !== 'CDP 连接已关闭') metadata.errors.push(`browser cleanup: ${error.message}`); }
      browser.socket.close();
    }
    if (chrome) {
      for (let count = 0; count < 40 && chrome.exitCode === null && chrome.signalCode === null; count++) await sleep(100);
      if (chrome.exitCode === null && chrome.signalCode === null) chrome.kill();
      metadata.browserClosed = chrome.exitCode !== null || chrome.signalCode !== null;
    }
    if (devServer) {
      try { await devServer.close(); metadata.devServerClosed = true; }
      catch (error) { metadata.errors.push(`server cleanup: ${error.message}`); }
    }
    metadata.finishedAt = new Date().toISOString();
    await save('session.json', metadata);
  };
  try {
    const portProbe = createPortProbe();
    await new Promise((accept, reject) => { portProbe.once('error', reject); portProbe.listen(port, '127.0.0.1', accept); });
    await new Promise((accept, reject) => portProbe.close((error) => error ? reject(error) : accept()));
    await mkdir(directory, { recursive: true });
    if (!options.resumeRunId) await mkdir(profile);
    devServer = await createServer({ root: workspace, logLevel: 'warn', server: { host: '127.0.0.1', port: port + 1000, strictPort: true, open: false } });
    await devServer.listen();
    metadata.url = `http://127.0.0.1:${port + 1000}/`;
    chrome = spawn(chromePath, [
      '--headless=new', '--remote-debugging-address=127.0.0.1', `--remote-debugging-port=${port}`,
      `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check',
      '--disable-background-networking', '--disable-background-timer-throttling',
      '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows',
      ...(process.env.EZ_CHROME_RENDERER === 'auto' ? [] : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader']), '--window-size=1600,1000',
      '--force-device-scale-factor=1', 'about:blank',
    ], { windowsHide: true, stdio: 'ignore' });
    metadata.browserPid = chrome.pid;
    chrome.on('error', (error) => { metadata.errors.push(error.message); });
    const deadline = Date.now() + 20000;
    let ready = false;
    while (Date.now() < deadline && !ready) {
      if (chrome.exitCode !== null || metadata.errors.length) throw new Error('Chrome launch failed');
      try {
        const targets = await (await fetch(`${endpoint}/json/list`, { signal: AbortSignal.timeout(1000) })).json();
        ready = targets.some((target) => target.type === 'page' && target.url === 'about:blank');
      } catch {}
      if (!ready) await sleep(200);
    }
    if (!ready) throw new Error('Isolated Chrome did not become ready');
    process.env.EZ_EVIDENCE_DIR = directory;
    process.env.EZ_CDP_ENDPOINT = endpoint;
    const { CampaignBrowser } = await import('./cdp-campaign-browser.mjs');
    browser = new CampaignBrowser();
    await browser.connect();
    const originalSend = browser.send.bind(browser);
    browser.send = (method, params) => {
      if (method.startsWith('Input.')) appendFileSync(join(directory, 'inputs.jsonl'), JSON.stringify({ at: Date.now(), method, params }) + '\n');
      return originalSend(method, params);
    };
    metadata.browserVersion = await browser.send('Browser.getVersion');
    metadata.rendering = process.env.EZ_CHROME_RENDERER === 'auto' ? 'Headless default renderer; FPS not a target-device performance claim' : 'Headless SwiftShader; FPS not a target-device performance claim';
    await browser.send('Page.navigate', { url: metadata.url });
    await browser.wait("window.__GAME__?.scene.isActive('MainMenuScene')", 'normal preload', 120000);
    await sleep(700);
    metadata.gpu = await browser.evaluate(`(() => { const gl = window.__GAME__.renderer.gl; if (!gl) return { type: 'canvas' }; const debug = gl.getExtension('WEBGL_debug_renderer_info'); return { type: 'webgl', renderer: gl.getParameter(debug ? debug.UNMASKED_RENDERER_WEBGL : gl.RENDERER), vendor: gl.getParameter(debug ? debug.UNMASKED_VENDOR_WEBGL : gl.VENDOR) }; })()`);
    await browser.screenshot('boot-menu');
    await browser.evaluate(`(async () => {
      const [{ WEAPONS }, { Zombie }, { Prop }, { EnemyProjectile }, { CountershotProjectile }, { EVENTS, DEPTH }, { SaveManager, SAVE_KEYS }, { EnhancementManager }, { ENHANCEMENTS }, { FRENZY_TARGETS, FRENZY_VERSION }, { ZOMBIES }, { getFrenzyScore }] = await Promise.all([
        import('/src/config/weapons.ts'), import('/src/entities/Zombie.ts'), import('/src/entities/Prop.ts'),
        import('/src/entities/EnemyProjectile.ts'), import('/src/entities/CountershotProjectile.ts'), import('/src/constants.ts'), import('/src/systems/SaveManager.ts'),
        import('/src/systems/EnhancementManager.ts'), import('/src/config/enhancements.ts'), import('/src/config/frenzy.ts'), import('/src/config/zombies.ts'), import('/src/systems/FrenzyRules.ts')
      ]);
      window.__ACCEPTANCE__ = { WEAPONS, Zombie, Prop, EnemyProjectile, CountershotProjectile, EVENTS, DEPTH, SaveManager, SAVE_KEYS, EnhancementManager, ENHANCEMENTS, FRENZY_TARGETS, FRENZY_VERSION, ZOMBIES, getFrenzyScore, tactical: ${options.tactical === true}, queue: [] };
    })()`);
    browser.log('ready', { runId, url: metadata.url, version: metadata.browserVersion.product });
    metadata.testing = await browser.evaluate("(async () => { const { TESTING_FLAGS } = await import('/src/config/testing.ts'); const { isDeveloperCheatEnabled } = await import('/src/systems/DeveloperCheats.ts'); return { flags: TESTING_FLAGS, developerCheat: isDeveloperCheatEnabled() }; })()");
    return { browser, save, close, directory, metadata };
  } catch (error) {
    metadata.errors.push(error.message);
    if (existsSync(directory)) await close();
    throw error;
  }
}

export const snapshotExpression = `(() => {
  const game = window.__GAME__, scene = game.scene.getScene('GameScene'), meta = window.__ACCEPTANCE__;
  const active = game.scene.getScenes(true).map(entry => entry.sys.settings.key);
  const result = { active, at: game.loop.time, frame: game.loop.frame, fps: game.loop.actualFps, canvas: { width: game.scale.gameSize.width, height: game.scale.gameSize.height } };
  if (!active.some(key => ['GameScene', 'HUDScene', 'CardSelectionScene', 'LevelClearScene', 'GameOverScene', 'FrenzyResultScene'].includes(key))) return result;
  const state = scene.getState();
  result.sceneTime = scene.time.now;
  const diagnostics = scene.getCombatDiagnostics();
  result.diagnostics = diagnostics;
  if (!state) return result;
  result.state = { mode: state.mode, levelId: state.levelId, wave: state.waveIndex, stats: state.stats, player: { characterId: state.player.characterId, health: state.player.health, maxHealth: state.player.maxHealth, weapon: state.player.currentWeaponId, owned: state.player.ownedWeapons, magazines: state.player.ammoInMag, reserve: state.player.ammoReserve, medicines: state.player.medicines, medicineUse: state.player.medicineUse, items: state.player.items, currentItemId: state.player.currentItemId, enhancements: [...state.player.activeEnhancements] }, frenzy: state.frenzy };
  result.state.player.endlessOverdrive = state.player.endlessOverdrive;
  if (!scene.physics.world || diagnostics?.gameEnded || !active.includes('GameScene')) return result;
  if (!scene.events.listeners(meta.EVENTS.pickupCollected).includes(meta.listener)) {
    meta.listener = payload => { meta.queue.push({ at: game.loop.time, type: 'pickup', payload }); if (meta.queue.length > 300) meta.queue.shift(); };
    scene.events.on(meta.EVENTS.pickupCollected, meta.listener);
  }
  result.events = meta.queue.splice(0);
  result.weapon = meta.tactical ? meta.EnhancementManager.resolveWeaponDef(state.player.currentWeaponId, state.player.activeEnhancements) : meta.WEAPONS[state.player.currentWeaponId];
  result.weaponStatuses = scene.getWeaponStatuses();
  result.reloading = scene.isWeaponReloading();
  result.reload = scene.getWeaponReloadStatus();
  result.skill = scene.getSkillStatus();
  result.boss = scene.getBossStatus();
  result.performance = scene.getPerformanceStats();
  result.walls = scene.getBreakableObstacleSnapshots();
  const bodies = scene.physics.world.bodies.entries.filter(body => body.enable).map(body => body.gameObject);
  result.enemies = bodies.filter(object => object instanceof meta.Zombie && object.isCombatActive()).map(object => ({ id: object.def.id, token: object.getLifecycleToken(), x: object.x, y: object.y, vx: object.body.velocity.x, vy: object.body.velocity.y, health: object.health, maxHealth: object.maxHealth, radius: object.def.radius, abilityKind: object.def.ability?.kind ?? null, phase: object.getBossPhaseStatus() }));
  result.projectiles = bodies.filter(object => object.active && (object instanceof meta.EnemyProjectile || (object instanceof meta.CountershotProjectile && object.flight.side === 'hostile'))).map(object => ({ x: object.x, y: object.y, vx: object.body.velocity.x, vy: object.body.velocity.y, radius: object.body.halfWidth }));
  result.props = bodies.filter(object => object instanceof meta.Prop && object.active && !object.triggered).map(object => ({ id: object.itemId, x: object.x, y: object.y, radius: object.def.effect.radius, lingering: object.def.effect.lingering }));
  result.tiles = scene.physics.world.staticBodies.entries.filter(body => body.enable && body.gameObject.ownerObstacle).map(body => ({ x: body.center.x, y: body.center.y, width: body.width, height: body.height }));
  result.cores = scene.children.list.filter(object => object.type === 'Arc' && object.visible && object.depth === meta.DEPTH.pickup && object.radius === 21).map(object => ({ x: object.x, y: object.y }));
  result.blastWarnings = scene.children.list.filter(object => object.type === 'Arc' && object.visible && object.depth === meta.DEPTH.effect && object.fillColor === 0xe75b45 && object.fillAlpha === 0.16).map(object => ({ x: object.x, y: object.y, radius: object.radius }));
  if (state.frenzy) result.frenzyTargets = meta.FRENZY_TARGETS.map(definition => {
    const matches = result.enemies.filter(enemy => enemy.id === definition.zombieId && enemy.maxHealth === Math.round(meta.ZOMBIES[definition.zombieId].health * definition.healthMultiplier));
    return { id: definition.id, status: state.frenzy.targets[definition.id], enemy: matches.length === 1 ? matches[0] : null };
  });
  return result;
})()`;
