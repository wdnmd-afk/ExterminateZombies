import assert from 'node:assert/strict';
import { setTimeout as sleep } from 'node:timers/promises';
import { startAcceptanceSession, snapshotExpression } from './cdp-acceptance-session.mjs';

const session = await startAcceptanceSession(process.argv[2] ?? 'visual-r01', Number(process.argv[3] ?? 9343));
const { browser, save } = session;
const results = [];
const inspect = () => browser.evaluate(snapshotExpression);
const waitScene = async name => { await browser.wait(`window.__GAME__?.scene.isActive(${JSON.stringify(name)})`, name, 90000); await sleep(350); };
const drainCards = async () => {
  while ((await inspect()).active.includes('CardSelectionScene')) { await browser.tap('Digit1'); await sleep(150); }
};
const separateEnemies = () => browser.evaluate(`(() => {
  const scene = window.__GAME__.scene.getScene('GameScene');
  const enemies = scene.physics.world.bodies.entries.map(body => body.gameObject).filter(object => object instanceof window.__ACCEPTANCE__.Zombie && object.isCombatActive());
  enemies.forEach((enemy, index) => enemy.body.reset(index % 2 ? 70 : 1210, 75 + index * 12));
  return enemies.length;
})()`);

try {
  await browser.clickText('MainMenuScene', '进入战前整备'); await waitScene('PreparationScene');
  for (const name of ['M4A1', 'AA-12', 'GOLDEN M249', 'TESLA COIL', 'AK-47']) {
    const entry = (await browser.texts('PreparationScene')).find(text => text.text === name && text.y < 475);
    await browser.click('PreparationScene', entry.x, entry.y);
  }
  await browser.clickText('PreparationScene', '应用编队  →');
  await browser.tap('Enter'); await waitScene('GameScene');
  await browser.evaluate(`(() => {
    const scene = window.__GAME__.scene.getScene('GameScene');
    const observation = { frames: [], label: '' };
    window.__VISUAL__ = observation;
    const observer = () => {
      const counts = {}, alpha = {};
      const visit = (object, parentAlpha) => {
        if (!object.visible || !object.active) return;
        const opacity = parentAlpha * object.alpha;
        if (opacity <= 0) return;
        const key = object.texture?.key;
        if (key && (key.startsWith('game-effect-') || key.startsWith('game-particle-'))) {
          counts[key] = (counts[key] ?? 0) + 1;
          alpha[key] = Math.max(alpha[key] ?? 0, opacity);
        }
        if (Array.isArray(object.list)) object.list.forEach(child => visit(child, opacity));
      };
      scene.children.list.forEach(object => visit(object, 1));
      observation.frames.push({ frame: scene.game.loop.frame, time: scene.time.now, counts, alpha, kills: scene.getState().stats.kills });
      if (observation.frames.length > 2400) observation.frames.shift();
    };
    scene.events.on('postupdate', observer);
    scene.events.once('shutdown', () => scene.events.off('postupdate', observer));
  })()`);
  for (const [label, blood, flash, flashIndex] of [['enabled', true, 'high', 3], ['disabled', false, 'off', 0], ['low', true, 'low', 1]]) {
    await browser.release(); await drainCards();
    await browser.tap('Escape');
    await browser.wait("window.__GAME__.scene.getScene('GameScene').getPauseReason() === 'menu'", 'pause before settings');
    await browser.clickText('HUDScene', '返回主页'); await waitScene('MainMenuScene');
    await browser.clickText('MainMenuScene', '设置'); await waitScene('SettingsScene');
    const labels = await browser.texts('SettingsScene');
    const bloodRow = labels.find(entry => entry.text === '血液');
    const flashRow = labels.find(entry => entry.text === '闪光');
    assert.ok(bloodRow && flashRow);
    await browser.click('SettingsScene', blood ? 1108 : 1060, bloodRow.y);
    await browser.click('SettingsScene', 1060 + flashIndex * 48, flashRow.y);
    const settings = await browser.evaluate("(async () => { const { SaveManager, SAVE_KEYS } = await import('/src/systems/SaveManager.ts'); return SaveManager.load(SAVE_KEYS.accessibilitySettings, null); })()");
    assert.equal(settings.blood, blood); assert.equal(settings.flash, flash);
    await browser.screenshot(`${label}-settings`);
    await browser.clickText('SettingsScene', '返回主菜单'); await waitScene('MainMenuScene');
    await browser.clickText('MainMenuScene', '继续游戏'); await waitScene('GameScene');
    await separateEnemies(); await sleep(1200);
    let ready = await inspect();
    while (!ready.skill.ready) { await separateEnemies(); await drainCards(); await sleep(300); ready = await inspect(); }
    await browser.wait(`(() => { const scene = window.__GAME__.scene.getScene('GameScene'); return scene.physics.world.bodies.entries.some(body => body.gameObject instanceof window.__ACCEPTANCE__.Zombie && body.gameObject.isCombatActive()); })()`, 'natural target', 30000);
    const fixture = await browser.evaluate(`(() => {
      const scene = window.__GAME__.scene.getScene('GameScene');
      const player = scene.getCombatDiagnostics().player;
      const enemies = scene.physics.world.bodies.entries.map(body => body.gameObject).filter(object => object instanceof window.__ACCEPTANCE__.Zombie && object.isCombatActive());
      const target = enemies.find(enemy => enemy.def.id === 'walker') ?? enemies[0];
      const before = { id: target.def.id, health: target.health, x: target.x, y: target.y, token: target.getLifecycleToken() };
      enemies.filter(enemy => enemy !== target).forEach((enemy, index) => enemy.body.reset(index % 2 ? 70 : 1210, 80 + index * 12));
      target.body.reset(player.x + 140, player.y);
      if (target.health > 1) target.hurt(target.health - 1);
      window.__VISUAL__.frames = [];
      return { before, after: { x: target.x, y: target.y, health: target.health }, kills: scene.getState().stats.kills, bypass: 'Existing naturally spawned enemy repositioned and weakened to 1 HP; final kill uses real player bullet. No natural combat difficulty claim.' };
    })()`);
    await browser.move('GameScene', fixture.after.x, fixture.after.y);
    const deadline = Date.now() + 5000;
    let after = await inspect();
    while (Date.now() < deadline && after.state.stats.kills === fixture.kills) {
      await browser.fire(true); await sleep(80); await browser.fire(false); await sleep(140); after = await inspect();
    }
    assert.ok(after.state.stats.kills > fixture.kills);
    await browser.screenshot(`${label}-kill`);
    await drainCards();
    await browser.tap('KeyE');
    await sleep(80);
    await browser.screenshot(`${label}-explosion`);
    await sleep(500);
    const frames = await browser.evaluate('window.__VISUAL__.frames');
    const peaks = {}, opacity = {};
    for (const frame of frames) {
      for (const [key, count] of Object.entries(frame.counts)) peaks[key] = Math.max(peaks[key] ?? 0, count);
      for (const [key, alpha] of Object.entries(frame.alpha)) opacity[key] = Math.max(opacity[key] ?? 0, alpha);
    }
    const result = { label, settings, fixture, frames, peaks, opacity, after: await inspect() };
    await save(`${label}-observed.json`, result);
    if (blood) assert.ok(peaks['game-particle-blood'] > 0);
    else assert.equal(peaks['game-particle-blood'] ?? 0, 0);
    if (flash === 'off') {
      assert.equal(peaks['game-particle-spark'] ?? 0, 0);
      assert.equal(peaks['game-effect-explosion'] ?? 0, 0);
      for (const key of Object.keys(peaks).filter(key => key.includes('muzzle'))) assert.equal(peaks[key], 0);
    } else assert.ok(peaks['game-effect-explosion'] > 0);
    results.push({ label, settings, peaks, opacity, kills: after.state.stats.kills - fixture.kills });
  }
  assert.ok(results[2].opacity['game-effect-explosion'] < results[0].opacity['game-effect-explosion']);
  await browser.send('Page.reload'); await waitScene('MainMenuScene');
  await browser.clickText('MainMenuScene', '设置'); await waitScene('SettingsScene');
  const persisted = await browser.evaluate("(async () => { const { SaveManager, SAVE_KEYS } = await import('/src/systems/SaveManager.ts'); return SaveManager.load(SAVE_KEYS.accessibilitySettings, null); })()");
  assert.equal(persisted.blood, true); assert.equal(persisted.flash, 'low');
  await browser.screenshot('persisted-after-reload');
  assert.equal(browser.errors.length, 0); assert.equal(browser.failures.length, 0);
  await save('result.json', { passed: true, results, persisted, fixtureOnlyCombat: true });
} catch (error) {
  process.exitCode = 1;
  await save('failure.json', { message: error.message, stack: error.stack, results, snapshot: await inspect().catch(() => null), errors: browser.errors, failedRequests: browser.failures });
  await browser.screenshot('failure').catch(() => {});
  console.error(error);
} finally { await session.close(); }
