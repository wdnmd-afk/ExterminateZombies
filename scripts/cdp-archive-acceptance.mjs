import assert from 'node:assert/strict';
import { setTimeout as sleep } from 'node:timers/promises';
import { startAcceptanceSession } from './cdp-acceptance-session.mjs';

const session = await startAcceptanceSession(process.argv[2] ?? 'archive-r01', Number(process.argv[3] ?? 9338));
const { browser, save } = session;
const results = [];
const waitScene = async name => { await browser.wait(`window.__GAME__?.scene.isActive(${JSON.stringify(name)})`, name, 120000); await sleep(750); };
const readSave = () => browser.evaluate(`(async () => { const { SaveManager, SAVE_KEYS } = await import('/src/systems/SaveManager.ts'); return {
  loadout: SaveManager.getWeaponLoadout(), weapons: SaveManager.getUnlockedWeapons(), accessibility: SaveManager.load(SAVE_KEYS.accessibilitySettings, null), levels: SaveManager.load(SAVE_KEYS.unlockedLevels, null)
}; })()`);

async function archiveProbe(sceneName) {
  return browser.evaluate(`(async () => {
    const scene = window.__GAME__.scene.getScene(${JSON.stringify(sceneName)});
    const { getRuntimeDisplayLayout } = await import('/src/systems/DisplayManager.ts');
    const { MONSTER_LIBRARY } = await import('/src/config/monsterLibrary.ts');
    const monsterCodes = new Map(MONSTER_LIBRARY.map((entry, index) => [entry.dossierCode, index]));
    const rows = [], text = [], missing = [];
    const visit = (object, visible) => {
      visible = visible && object.visible !== false && object.alpha !== 0;
      if (!visible) return;
      if (typeof object.text === 'string') text.push({ text: object.text, font: object.style.fontSize, bounds: object.getBounds() });
      if (object.texture?.key === '__MISSING') missing.push({ type: object.type, x: object.x, y: object.y });
      if (object.type === 'Container' && object.list.length >= 6 && object.list[0].type === 'Rectangle') {
        const code = object.list[2]?.text;
        const index = ${JSON.stringify(sceneName)} === 'MonsterLibraryScene' ? monsterCodes.get(code) : /^\\d+$/.test(code ?? '') ? Number(code) - 1 : undefined;
        if (index !== undefined) rows.push({ index, name: object.list[3].text, selected: object.list[0].fillColor === 0xfbc02d, bounds: object.list[0].getBounds(), status: object.list[5].text });
      }
      if (Array.isArray(object.list)) object.list.forEach(child => visit(child, visible));
    };
    scene.children.list.forEach(object => visit(object, true));
    return { rows: rows.sort((first, second) => first.index - second.index), text, missing, layout: getRuntimeDisplayLayout(), keyboardListeners: scene.input.keyboard.listenerCount('keydown') };
  })()`);
}

async function action(scene, label) {
  await browser.clickText(scene, label);
  await sleep(250);
}

async function keyboardChecks(kind, sceneName, count) {
  const expectedSteps = kind === 'weapon'
    ? { ArrowDown: 2, ArrowRight: 1, ArrowUp: -2, ArrowLeft: -1, KeyS: 2, KeyD: 1, KeyW: -2, KeyA: -1 }
    : { ArrowDown: 1, ArrowRight: Math.ceil(count / 2), ArrowUp: -1, ArrowLeft: -Math.ceil(count / 2), KeyS: 1, KeyD: Math.ceil(count / 2), KeyW: -1, KeyA: -Math.ceil(count / 2) };
  const checks = [];
  let expected = 0;
  await browser.tap('Home');
  for (const code of ['End', 'Home', ...Object.keys(expectedSteps)]) {
    if (code === 'End') expected = count - 1;
    else if (code === 'Home') expected = 0;
    else expected = (expected + expectedSteps[code] + count) % count;
    await browser.tap(code);
    await sleep(250);
    const state = await archiveProbe(sceneName);
    const selected = state.rows.filter(row => row.selected);
    assert.equal(selected.length, 1);
    assert.equal(selected[0].index, expected, `Keyboard selection mismatch: ${kind}/${code}`);
    assert.ok(state.text.some(entry => entry.text === selected[0].name && Number.parseFloat(entry.font) >= 30), 'Detail title does not match selected row');
    checks.push({ code, expected, selected: selected[0].name });
  }
  return checks;
}

function checkBounds(kind, probe) {
  const boundary = kind === 'weapon' ? 660 : 674;
  for (const row of probe.rows) {
    assert.ok(row.bounds.y >= 150);
    assert.ok(row.bounds.y + row.bounds.height <= boundary - 10, `Row overlaps footer: ${kind}/${row.index}`);
  }
  for (let first = 0; first < probe.rows.length; first++) {
    for (let second = first + 1; second < probe.rows.length; second++) {
      const left = probe.rows[first].bounds, right = probe.rows[second].bounds;
      const overlap = left.x < right.x + right.width && left.x + left.width > right.x && left.y < right.y + right.height && left.y + left.height > right.y;
      assert.equal(overlap, false, `Archive rows overlap: ${kind}/${first}/${second}`);
    }
  }
  assert.equal(probe.missing.length, 0);
}

async function preparation() {
  await action('MainMenuScene', '进入战前整备');
  await waitScene('PreparationScene');
  for (const name of ['M4A1', 'AA-12', 'GOLDEN M249', 'TESLA COIL', 'AK-47']) {
    const entry = (await browser.texts('PreparationScene')).find(text => text.text === name && text.y < 475);
    assert.ok(entry, name);
    await browser.click('PreparationScene', entry.x, entry.y);
  }
  await action('PreparationScene', '应用编队  →');
  await browser.tap('Escape');
  await waitScene('MainMenuScene');
}

try {
  await preparation();
  const baseline = await readSave();
  await save('baseline.json', baseline);
  const viewports = [
    { width: 1920, height: 720, deviceScaleFactor: 1, mobile: false },
    { width: 1920, height: 900, deviceScaleFactor: 2, mobile: false },
    { width: 960, height: 720, deviceScaleFactor: 1, mobile: false },
    { width: 960, height: 720, deviceScaleFactor: 2, mobile: false },
  ];
  for (const [viewportIndex, viewport] of viewports.entries()) {
    await browser.send('Emulation.setDeviceMetricsOverride', viewport);
    await browser.send('Page.reload');
    await waitScene('MainMenuScene');
    for (const [kind, sceneName, button, count] of [['weapon', 'WeaponLibraryScene', '武器库', 17], ['monster', 'MonsterLibraryScene', '怪物图鉴', 18]]) {
      await action('MainMenuScene', button);
      await waitScene(sceneName);
      const baselineProbe = await archiveProbe(sceneName);
      assert.equal(baselineProbe.rows.length, count);
      checkBounds(kind, baselineProbe);
      const keys = await keyboardChecks(kind, sceneName, count);
      const selections = [];
      for (let index = 0; index < count; index++) {
        const row = (await archiveProbe(sceneName)).rows[index];
        await browser.move(sceneName, row.bounds.x + row.bounds.width / 2, row.bounds.y + row.bounds.height / 2);
        let current;
        const deadline = Date.now() + 6000;
        do {
          await sleep(150);
          current = await archiveProbe(sceneName);
        } while (Date.now() < deadline && current.rows.find(entry => entry.selected)?.index !== index);
        assert.equal(current.rows.find(entry => entry.selected)?.index, index, `Actual archive selection ${kind}/${index}`);
        await sleep(300);
        current = await archiveProbe(sceneName);
        assert.ok(current.text.some(entry => entry.text === current.rows[index].name && Number.parseFloat(entry.font) >= 30));
        selections.push({ index, name: current.rows[index].name, texts: current.text });
        checkBounds(kind, current);
        if (index === 0 || index === count - 1 || (kind === 'monster' && index >= 14)) {
          await browser.screenshot(`viewport-${viewportIndex}-${kind}-${index}`);
        }
      }
      const after = await archiveProbe(sceneName);
      const row = after.rows[0];
      await browser.move(sceneName, row.bounds.x + 80, row.bounds.y + row.bounds.height / 2);
      await sleep(300);
      assert.equal((await archiveProbe(sceneName)).rows.find(entry => entry.selected).index, 0);
      results.push({ case: 'U-12/U-13', viewport, kind, baseline: baselineProbe, keys, selections, after });
      await browser.tap('Escape');
      await waitScene('MainMenuScene');
    }
  }
  await browser.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
  await browser.send('Page.reload');
  await waitScene('MainMenuScene');
  for (let round = 1; round <= 3; round++) {
    await action('MainMenuScene', '武器库');
    await waitScene('WeaponLibraryScene');
    const before = await readSave();
    await browser.tap('Home');
    await browser.tap('Enter');
    assert.deepEqual((await readSave()).loadout, before.loadout);
    const requiredText = await browser.texts('WeaponLibraryScene');
    assert.ok(requiredText.some(entry => entry.text.includes('不能移出')));
    await browser.tap('End');
    await browser.tap('Space');
    assert.deepEqual((await readSave()).loadout, before.loadout);
    assert.ok((await browser.texts('WeaponLibraryScene')).some(entry => entry.text.includes('尚未解锁')));
    const current = await archiveProbe('WeaponLibraryScene');
    const owned = current.rows.find(row => row.name === 'M4A1');
    await browser.move('WeaponLibraryScene', owned.bounds.x + 70, owned.bounds.y + owned.bounds.height / 2);
    await sleep(250);
    await browser.key('Enter', true);
    for (let repeat = 0; repeat < 5; repeat++) {
      await browser.send('Input.dispatchKeyEvent', { type: 'keyDown', code: 'Enter', key: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13, autoRepeat: true });
      await sleep(110);
    }
    await browser.key('Enter', false);
    const removed = await readSave();
    assert.equal(removed.loadout.length, 5);
    assert.equal(removed.loadout.includes('rifle'), false);
    await browser.tap('Space');
    const restored = await readSave();
    assert.equal(restored.loadout.length, 6);
    assert.equal(restored.loadout.includes('rifle'), true);
    await browser.screenshot(`reentry-${round}-weapon`);
    results.push({ case: 'U-13 reentry', round, listeners: (await archiveProbe('WeaponLibraryScene')).keyboardListeners, removed, restored });
    await browser.tap('Escape');
    await waitScene('MainMenuScene');
    const beforeMonster = await readSave();
    await action('MainMenuScene', '怪物图鉴');
    await waitScene('MonsterLibraryScene');
    await browser.tap('End'); await browser.tap('Home');
    assert.deepEqual(await readSave(), beforeMonster);
    results.push({ case: 'U-13 monster no write', round, listeners: (await archiveProbe('MonsterLibraryScene')).keyboardListeners });
    await browser.tap('Escape'); await waitScene('MainMenuScene');
  }
  // 独立测试存档只补一把许可以到达满编队分支；不把它算作自然关卡奖励。
  await browser.evaluate("(async () => { const { SaveManager } = await import('/src/systems/SaveManager.ts'); SaveManager.unlockWeapon('smg'); })()");
  await save('full-loadout-fixture.json', { changes: 'Grant smg license in isolated test save only; bypasses natural reward', before: baseline, after: await readSave() });
  await action('MainMenuScene', '武器库'); await waitScene('WeaponLibraryScene');
  const row = (await archiveProbe('WeaponLibraryScene')).rows.find(entry => entry.name === 'MP5');
  await browser.move('WeaponLibraryScene', row.bounds.x + 65, row.bounds.y + row.bounds.height / 2);
  await sleep(250);
  const beforeFull = await readSave();
  await browser.tap('Enter');
  assert.deepEqual((await readSave()).loadout, beforeFull.loadout);
  assert.ok((await browser.texts('WeaponLibraryScene')).some(entry => entry.text.includes('编队已满')));
  await browser.screenshot('full-loadout-rejected');
  results.push({ case: 'U-13 full loadout fixture', passed: true, texts: await browser.texts('WeaponLibraryScene') });
  await browser.tap('Escape'); await waitScene('MainMenuScene');
  await action('MainMenuScene', '设置'); await waitScene('SettingsScene');
  const settingTexts = await browser.texts('SettingsScene');
  const flash = settingTexts.find(entry => entry.text === '闪光');
  assert.ok(flash);
  await browser.click('SettingsScene', 1060, flash.y);
  assert.equal((await readSave()).accessibility.flash, 'off');
  await browser.screenshot('settings-flash-off');
  results.push({ case: 'U-07 flash preference UI only', saved: await readSave(), texts: await browser.texts('SettingsScene') });
  await action('SettingsScene', '返回主菜单'); await waitScene('MainMenuScene');
  await browser.send('Page.reload'); await waitScene('MainMenuScene');
  assert.equal((await readSave()).accessibility.flash, 'off');
  assert.equal(browser.errors.length, 0);
  assert.equal(browser.failures.length, 0);
  await save('result.json', { passed: true, results, finalSave: await readSave(), limitations: 'Full-loadout branch uses smg license fixture; no combat blood/flash or sound mixing claim' });
} catch (error) {
  process.exitCode = 1;
  const active = await browser.evaluate("window.__GAME__?.scene.getScenes(true).map(scene => scene.sys.settings.key) ?? []").catch(probeError => ({ probeError: probeError.message }));
  await save('failure.json', { message: error.message, stack: error.stack, results, active, browserErrors: browser.errors, failedRequests: browser.failures });
  await browser.screenshot('failure').catch(captureError => console.error('Failure screenshot unavailable:', captureError.message));
  console.error(error);
} finally { await session.close(); }
