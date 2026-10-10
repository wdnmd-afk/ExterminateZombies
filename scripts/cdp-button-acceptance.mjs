import assert from 'node:assert/strict';
import { setTimeout as sleep } from 'node:timers/promises';
import { startAcceptanceSession } from './cdp-acceptance-session.mjs';

const session = await startAcceptanceSession(process.argv[2] ?? 'buttons-r01', Number(process.argv[3] ?? 9352));
const { browser, save } = session;
const active = () => browser.evaluate("window.__GAME__.scene.getScenes(true).map(scene => scene.sys.settings.key)");
const enterResult = async () => {
  await browser.evaluate("(() => { const game = window.__GAME__; game.scene.getScenes(true).forEach(scene => game.scene.stop(scene.sys.settings.key)); game.scene.start('LevelClearScene', { levelId: 'level_1', nextLevelId: 'level_2', kills: 44 }); return true; })()");
  await browser.wait("window.__GAME__.scene.isActive('LevelClearScene')", 'controlled result scene');
  await sleep(250);
};
const results = [];
try {
  await save('scope.json', { fixtureOnly: true, scope: '独立浏览器真实结算场景，直接入场仅缩短战役前置；全部按钮动作使用CDP真实鼠标/键盘，不证明自然通关。' });
  await browser.move('MainMenuScene', 300, 610); await browser.fire(true);
  await enterResult();
  const button = (await browser.texts('LevelClearScene')).find(text => text.text === '下一关整备');
  assert.ok(button);
  await browser.move('LevelClearScene', button.x, button.y);
  await browser.fire(false); await sleep(300);
  const release = await active();
  await save('cross-scene-release.json', { active: release, expected: 'LevelClearScene' });
  await browser.screenshot('cross-scene-release');
  assert.ok(release.includes('LevelClearScene'), 'Old-scene release must not select a new-scene action');
  results.push({ name: 'cross-scene-release', passed: true });
  await browser.move('LevelClearScene', 640, 300); await browser.fire(true);
  await browser.move('LevelClearScene', button.x, button.y); await browser.fire(false); await sleep(200);
  assert.ok((await active()).includes('LevelClearScene'));
  results.push({ name: 'drag-in', passed: true });
  await browser.move('LevelClearScene', button.x, button.y); await browser.fire(true);
  await browser.move('LevelClearScene', 640, 300); await browser.fire(false); await sleep(200);
  await browser.move('LevelClearScene', button.x, button.y); await browser.fire(false); await sleep(200);
  assert.ok((await active()).includes('LevelClearScene'));
  results.push({ name: 'drag-out-cancels', passed: true });
  await browser.clickText('LevelClearScene', '下一关整备');
  await browser.wait("window.__GAME__.scene.isActive('PreparationScene')", 'valid label click');
  await browser.screenshot('valid-label-click');
  results.push({ name: 'valid-label-click', passed: true });
  await enterResult();
  await browser.click('LevelClearScene', button.x - 115, button.y + 15);
  await browser.wait("window.__GAME__.scene.isActive('PreparationScene')", 'valid background click');
  results.push({ name: 'valid-background-click', passed: true });
  await enterResult(); await browser.tap('Escape');
  await browser.wait("window.__GAME__.scene.isActive('MainMenuScene')", 'result ESC');
  await sleep(500);
  await browser.clickText('MainMenuScene', '狂潮挑战');
  await browser.wait("window.__GAME__.scene.isActive('FrenzyPreparationScene')", 'menu action');
  await sleep(250);
  await browser.tap('Digit3'); await browser.tap('Enter');
  await browser.wait("window.__GAME__.scene.isActive('GameScene')", 'preset keyboard entry');
  results.push({ name: 'escape-menu-and-preset-keyboard', passed: true });
  await save('result.json', { passed: true, fixtureOnly: true, results });
} catch (error) {
  process.exitCode = 1;
  await save('failure.json', { message: error.message, active: await active(), results });
  console.error(error);
} finally { await session.close(); }
