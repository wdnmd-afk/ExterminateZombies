import assert from 'node:assert/strict';
import { appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { startAcceptanceSession, snapshotExpression } from './cdp-acceptance-session.mjs';

const session = await startAcceptanceSession(process.argv[2] ?? 'mode-isolation-r01', Number(process.argv[3] ?? 9350));
const { browser, save, directory } = session;
const inspect = () => browser.evaluate(snapshotExpression);
const waitScene = async name => { await browser.wait(`window.__GAME__.scene.isActive(${JSON.stringify(name)})`, name, 90000); await sleep(300); };
const saved = () => browser.evaluate("(() => { const { SaveManager, SAVE_KEYS } = window.__ACCEPTANCE__; return { weapons: SaveManager.getUnlockedWeapons(), loadout: SaveManager.getWeaponLoadout(), character: SaveManager.getPreferredCharacterId(), starter: SaveManager.getPreferredStarterWeapon(), records: SaveManager.load(SAVE_KEYS.frenzyRecords, {}) }; })()");
const setMovement = async wanted => {
  for (const key of ['KeyW', 'KeyA', 'KeyS', 'KeyD']) if (browser.keys.has(key) !== wanted.includes(key)) await browser.key(key, wanted.includes(key));
};
const fight = async (label, flame) => {
  const deadline = Date.now() + 180000;
  let lastShot = 0;
  let lastSample = 0;
  let lastLog = 0;
  let cards = 0;
  let idleAfterAttribution = false;
  while (Date.now() < deadline) {
    const data = await inspect();
    if (data.active.some(name => ['GameOverScene', 'LevelClearScene'].includes(name))) return data;
    if (data.active.includes('CardSelectionScene')) {
      await browser.release();
      if (cards++ === 0) {
        const before = await inspect(); await sleep(1600); const after = await inspect();
        assert.equal(after.state.stats.elapsedMs, before.state.stats.elapsedMs);
        assert.equal(after.state.wave, before.state.wave);
        await save(`${label}-first-card-freeze.json`, { before, after });
        await browser.screenshot(`${label}-first-card`);
      }
      await browser.tap('Digit1'); await sleep(120); continue;
    }
    if (!data.enemies || data.diagnostics.pauseReason) { await sleep(100); continue; }
    if (Date.now() - lastSample > 900) {
      appendFileSync(join(directory, `${label}-samples.jsonl`), JSON.stringify(data) + '\n');
      lastSample = Date.now();
    }
    if (Date.now() - lastLog > 15000) {
      browser.log('mode-combat', { label, elapsed: data.state.stats.elapsedMs, wave: data.state.wave, health: data.state.player.health, kills: data.state.stats.kills, sources: data.state.stats.killsBySource });
      lastLog = Date.now();
    }
    if (flame && data.state.stats.killsBySource.unknown >= 3 && !idleAfterAttribution) {
      idleAfterAttribution = true;
      await browser.release();
      await save('natural-flame-attribution.json', data); await browser.screenshot('natural-flame-attribution');
    }
    if (idleAfterAttribution) { await sleep(200); continue; }
    const player = data.diagnostics.player;
    const target = [...data.enemies].sort((first, second) => Math.hypot(first.x - player.x, first.y - player.y) - Math.hypot(second.x - player.x, second.y - player.y))[0];
    if (!target) { await browser.release(); await sleep(150); continue; }
    const distance = Math.hypot(target.x - player.x, target.y - player.y);
    const direction = distance < 90 ? -1 : distance > (flame ? 165 : 390) ? 1 : 0;
    const horizontal = (target.x - player.x) * direction;
    const vertical = (target.y - player.y) * direction;
    const keys = [];
    if (horizontal > 18 && player.x < 1200) keys.push('KeyD');
    if (horizontal < -18 && player.x > 80) keys.push('KeyA');
    if (vertical > 18 && player.y < 640) keys.push('KeyS');
    if (vertical < -18 && player.y > 80) keys.push('KeyW');
    await setMovement(keys); await browser.move('GameScene', target.x, target.y);
    if (flame) await browser.fire(true);
    else if (Date.now() - lastShot > 510) { await browser.fire(true); await sleep(80); await browser.fire(false); lastShot = Date.now(); }
    await sleep(100);
  }
  await browser.release();
  return inspect();
};

try {
  await save('scope.json', { inputOnly: true, overrides: false, scope: '同一浏览器/场景实例：狂潮→无尽自然火焰击杀与自然死亡→战役首关；仅合法首次选枪，无位置/血量/伤害/掉落/计时干预。' });
  const beforeFrenzy = await saved();
  await browser.clickText('MainMenuScene', '狂潮挑战'); await waitScene('FrenzyPreparationScene');
  await browser.tap('Digit3'); await browser.tap('Enter'); await waitScene('GameScene');
  await browser.move('GameScene', 900, 350); await browser.fire(true); await sleep(120); await browser.fire(false);
  await browser.tap('KeyQ'); await browser.tap('KeyE');
  const frenzy = await inspect();
  assert.equal(frenzy.state.mode, 'frenzy'); assert.ok(frenzy.state.player.enhancements.length > 0);
  await save('frenzy-active.json', frenzy);
  await browser.tap('Escape'); await browser.clickText('HUDScene', '返回主页'); await waitScene('MainMenuScene');
  assert.deepEqual(await saved(), beforeFrenzy);
  await browser.clickText('MainMenuScene', '无尽模式'); await waitScene('PreparationScene');
  for (const name of ['FLAMETHROWER', 'TESLA COIL', 'GOLDEN M249', 'RPG-7', 'M4A1']) {
    const entry = (await browser.texts('PreparationScene')).find(text => text.text === name && text.y < 475);
    assert.ok(entry); await browser.click('PreparationScene', entry.x, entry.y);
  }
  await browser.clickText('PreparationScene', '应用编队  →'); await browser.tap('Digit2'); await browser.tap('Enter'); await waitScene('GameScene');
  let endless = await inspect();
  assert.equal(endless.state.mode, 'endless'); assert.equal(endless.state.frenzy, undefined);
  const flameSlot = endless.state.player.owned.indexOf('flamethrower') + 1;
  assert.ok(flameSlot > 0);
  await browser.tap(`Digit${flameSlot}`);
  await browser.wait("window.__GAME__.scene.getScene('GameScene').getState().player.currentWeaponId === 'flamethrower'", 'select legitimately equipped flamethrower');
  endless = await inspect();
  assert.equal(endless.state.player.weapon, 'flamethrower'); assert.deepEqual(endless.state.player.enhancements, []);
  assert.equal(endless.state.stats.kills, 0);
  await save('frenzy-to-endless-fresh.json', endless); await browser.screenshot('frenzy-to-endless-fresh');
  const death = await fight('flame-natural', true);
  assert.ok(death.active.includes('GameOverScene'));
  assert.ok(death.state.stats.killsBySource.unknown > 0);
  const deathTexts = await browser.texts('GameOverScene');
  assert.ok(deathTexts.some(text => text.text.includes(`其他 ${death.state.stats.killsBySource.unknown}`)));
  await save('natural-unknown-death.json', { snapshot: death, texts: deathTexts }); await browser.screenshot('natural-unknown-death');
  await browser.tap('Escape'); await waitScene('MainMenuScene');
  await browser.clickText('MainMenuScene', '进入战前整备'); await waitScene('PreparationScene');
  await browser.tap('Enter'); await waitScene('GameScene');
  const level = await inspect();
  assert.equal(level.state.mode, 'level'); assert.equal(level.state.levelId, 'level_1');
  assert.equal(level.state.frenzy, undefined); assert.equal(level.state.player.endlessOverdrive, null);
  assert.deepEqual(level.state.player.enhancements, []); assert.equal(level.state.stats.kills, 0);
  assert.equal(level.state.player.weapon, 'pistol');
  await save('endless-to-campaign-fresh.json', level);
  await browser.tap('Escape'); const paused = await inspect(); await sleep(2000); await browser.tap('Escape');
  const resumed = await inspect();
  assert.ok(resumed.state.stats.elapsedMs - paused.state.stats.elapsedMs < 1000);
  await save('campaign-pause.json', { paused, resumed });
  const cleared = await fight('campaign-return-natural', false);
  await save('campaign-return-outcome.json', { snapshot: cleared, texts: await browser.texts(cleared.active.includes('LevelClearScene') ? 'LevelClearScene' : cleared.active.includes('GameOverScene') ? 'GameOverScene' : 'HUDScene') });
  await browser.screenshot('campaign-return-outcome');
  assert.equal(browser.errors.length, 0); assert.equal(browser.failures.length, 0);
  await save('result.json', { passed: cleared.active.includes('LevelClearScene'), modeIsolation: true, unknownNatural: death.state.stats.killsBySource.unknown, campaignOutcome: cleared.active, inputOnly: true });
} catch (error) {
  process.exitCode = 1;
  await save('failure.json', { message: error.message, stack: error.stack, snapshot: await inspect().catch(() => null), errors: browser.errors, failedRequests: browser.failures });
  await browser.screenshot('failure').catch(() => {});
  console.error(error);
} finally { await session.close(); }
