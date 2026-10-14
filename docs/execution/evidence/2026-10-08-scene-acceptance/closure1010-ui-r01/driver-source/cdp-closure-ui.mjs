import assert from 'node:assert/strict';
import { setTimeout as sleep } from 'node:timers/promises';
import { startAcceptanceSession } from './cdp-acceptance-session.mjs';

const session = await startAcceptanceSession(process.argv[2] ?? 'closure-ui-r01', Number(process.argv[3] ?? 9353));
const { browser, save } = session;
const results = [];
const waitScene = async name => { await browser.wait(`window.__GAME__.scene.isActive(${JSON.stringify(name)})`, name); await sleep(300); };
const readSetting = key => browser.evaluate(`window.__ACCEPTANCE__.SaveManager.load(window.__ACCEPTANCE__.SAVE_KEYS[${JSON.stringify(key)}], null)`);
const settingListeners = () => browser.evaluate(`(() => { const scene = window.__GAME__.scene.getScene('SettingsScene'); return { keydown: scene.input.keyboard.listenerCount('keydown'), pointerdown: scene.input.listenerCount('pointerdown'), wheel: scene.input.listenerCount('wheel') }; })()`);
const startCards = async count => {
  await browser.evaluate("window.__GAME__.scene.getScenes(true).forEach(scene => window.__GAME__.scene.stop(scene.sys.settings.key))");
  await sleep(150);
  return browser.evaluate(`(() => {
    const game = window.__GAME__, owner = game.scene.getScene('GameScene');
    if (window.__UI_CLOSURE_LISTENER__) owner.events.off('card-selected', window.__UI_CLOSURE_LISTENER__);
    window.__UI_CLOSURE_CHOICES__ = [];
    window.__UI_CLOSURE_LISTENER__ = id => window.__UI_CLOSURE_CHOICES__.push(id);
    owner.events.on('card-selected', window.__UI_CLOSURE_LISTENER__);
    const cards = Object.values(window.__ACCEPTANCE__.ENHANCEMENTS).slice(0, ${count});
    game.scene.start('CardSelectionScene', { cards, activeEnhancements: [] });
    return cards.map(card => card.id);
  })()`);
};
const choices = () => browser.evaluate('window.__UI_CLOSURE_CHOICES__');

try {
  await save('scope.json', { playerPath: '设置／整备／制作与许可均从主页进入；不写存档', cardFixture: '仅卡片场景直接入场，用正式增强定义缩短掉落前置，不证明自然抽卡或通关', criteria: '完整点击、键盘、宽窄/DPR、纹理与监听生命周期，截图另作目视复核' });
  await browser.clickText('MainMenuScene', '设置'); await waitScene('SettingsScene');
  const initialListeners = await settingListeners();
  const up = (await browser.texts('SettingsScene')).find(entry => entry.text === '向上移动');
  assert.ok(up);
  await browser.click('SettingsScene', 370, up.y);
  await browser.clickText('SettingsScene', '返回主菜单');
  assert.equal(await browser.evaluate("window.__GAME__.scene.isActive('SettingsScene')"), true);
  await browser.tap('Escape');
  assert.equal(await browser.evaluate("window.__GAME__.scene.isActive('SettingsScene')"), true);
  await browser.click('SettingsScene', 370, up.y); await browser.tap('KeyK');
  assert.equal((await readSetting('keybinds')).moveUp, 'K');
  await browser.clickText('SettingsScene', '恢复默认键位');
  assert.equal((await readSetting('keybinds')).moveUp, 'W');
  results.push({ name: 'rebind-disabled-return-escape-reset', passed: true });

  const volume = (await browser.texts('SettingsScene')).find(entry => entry.text === '总音量');
  await browser.move('SettingsScene', 800, volume.y); await browser.fire(true);
  await browser.move('SettingsScene', 847, volume.y); await sleep(100); await browser.fire(false);
  assert.ok(Math.abs((await readSetting('audioSettings')).masterVolume - 0.5) < 0.02);
  const flash = (await browser.texts('SettingsScene')).find(entry => entry.text === '闪光');
  await browser.click('SettingsScene', 1060, flash.y);
  assert.equal((await readSetting('accessibilitySettings')).flash, 'off');
  await browser.click('SettingsScene', 1156, flash.y);
  assert.equal((await readSetting('accessibilitySettings')).flash, 'medium');
  results.push({ name: 'volume-drag-accessibility', passed: true });

  for (const [width, height, dpr] of [[1600, 1000, 1], [900, 720, 2]]) {
    await browser.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: dpr, mobile: false });
    await sleep(700);
    const texts = await browser.texts('SettingsScene');
    assert.ok(texts.every(entry => entry.x - entry.width / 2 >= -1 && entry.x + entry.width / 2 <= 1281 && entry.y + entry.height / 2 <= 721));
    const textures = await browser.evaluate(`(() => {
      const game = window.__GAME__, scene = game.scene.getScene('SettingsScene'), frames = [];
      const visit = object => { if (object.texture?.key === 'ui-panel-frame') frames.push({ input: Boolean(object.input), frame: object.frame.name }); if (Array.isArray(object.list)) object.list.forEach(visit); };
      scene.children.list.forEach(visit);
      return { keys: game.textures.getTextureKeys().filter(key => key.startsWith('ui-')), frames, dpr: devicePixelRatio };
    })()`);
    assert.equal(textures.keys.length, 9);
    assert.equal(textures.frames.length, 16);
    assert.ok(textures.frames.every(frame => !frame.input));
    await save(`settings-${width}-dpr${dpr}.json`, { texts, textures });
    await browser.screenshot(`settings-${width}-dpr${dpr}`);
    results.push({ name: `settings-${width}-dpr${dpr}`, passed: true });
  }
  await browser.send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 1000, deviceScaleFactor: 1, mobile: false });
  await sleep(500);
  await browser.clickText('SettingsScene', '返回主菜单'); await waitScene('MainMenuScene');
  await browser.clickText('MainMenuScene', '设置'); await waitScene('SettingsScene');
  assert.deepEqual(await settingListeners(), initialListeners);
  await browser.clickText('SettingsScene', '返回主菜单'); await waitScene('MainMenuScene');
  await browser.clickText('MainMenuScene', '制作与许可'); await waitScene('CreditsScene');
  await browser.screenshot('credits-bitmap-back');
  await browser.clickText('CreditsScene', '返回主菜单'); await waitScene('MainMenuScene');
  results.push({ name: 'settings-reentry-credits-player-path', passed: true });

  await browser.clickText('MainMenuScene', '无尽模式'); await waitScene('PreparationScene');
  for (const name of ['M4A1', 'AA-12', 'GOLDEN M249', 'TESLA COIL', 'AK-47']) {
    const entry = (await browser.texts('PreparationScene')).find(text => text.text === name && text.y < 475);
    assert.ok(entry, name); await browser.click('PreparationScene', entry.x, entry.y);
  }
  await browser.clickText('PreparationScene', '应用编队  →');
  await browser.tap('Digit2');
  await browser.clickText('PreparationScene', '编辑武器库');
  const cancel = (await browser.texts('PreparationScene')).find(entry => entry.text.startsWith('取消'));
  assert.ok(cancel); await browser.click('PreparationScene', cancel.x, cancel.y);
  await browser.screenshot('preparation-shared-controls');
  await browser.clickText('PreparationScene', '返回'); await waitScene('MainMenuScene');
  results.push({ name: 'preparation-loadout-character-cancel-back', passed: true });

  await browser.move('MainMenuScene', 640, 600); await browser.fire(true);
  const cardIds = await startCards(4); await waitScene('CardSelectionScene');
  await browser.move('CardSelectionScene', 232, 420); await browser.fire(false); await sleep(180);
  assert.deepEqual(await choices(), []);
  await browser.move('CardSelectionScene', 232, 420); await browser.fire(true); await sleep(90);
  assert.deepEqual(await choices(), []);
  await browser.fire(false); await sleep(150);
  assert.deepEqual(await choices(), [cardIds[0]]);
  await browser.tap('Digit2');
  assert.deepEqual(await choices(), [cardIds[0]]);
  await browser.screenshot('cards-complete-click');
  results.push({ name: 'cards-cross-scene-release-complete-click-once', passed: true, fixture: true });
  await startCards(4); await waitScene('CardSelectionScene'); await browser.tap('Digit2');
  assert.deepEqual(await choices(), [cardIds[1]]);
  await startCards(4); await waitScene('CardSelectionScene'); await browser.clickText('CardSelectionScene', '跳过本次强化  [ESC]');
  assert.deepEqual(await choices(), [null]);
  await startCards(0); await waitScene('CardSelectionScene');
  await browser.move('CardSelectionScene', 640, 360); await browser.fire(true);
  assert.deepEqual(await choices(), []);
  await browser.fire(false); await sleep(150);
  assert.deepEqual(await choices(), [null]);
  results.push({ name: 'cards-keyboard-skip-empty-complete-click', passed: true, fixture: true });
  assert.deepEqual(browser.errors, []); assert.deepEqual(browser.failures, []);
  await save('result.json', { passed: true, results, errors: browser.errors, failures: browser.failures, visualReview: '请结合保存截图目视，不把几何断言代替美术判断' });
} catch (error) {
  process.exitCode = 1;
  await save('failure.json', { message: error.message, stack: error.stack, results });
  await browser.screenshot('failure').catch(() => {});
  console.error(error);
} finally { await session.close(); }
