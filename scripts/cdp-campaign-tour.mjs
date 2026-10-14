import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { CampaignBrowser, sleep, out } from './cdp-campaign-browser.mjs';

const browser = new CampaignBrowser();
const label = process.argv[2] ?? 'tour';
const results = [];
let previousUnlocks;

async function openLevel(level, index) {
  const desiredPage = Math.floor(index / 10);
  let currentPage = await browser.evaluate("window.__GAME__.scene.getScene('MainMenuScene').levelPage");
  while (currentPage !== desiredPage) {
    await browser.clickText('MainMenuScene', currentPage < desiredPage ? '下一页 ›' : '‹ 上一页');
    currentPage = await browser.evaluate("window.__GAME__.scene.getScene('MainMenuScene').levelPage");
  }
  const title = await browser.evaluate(`window.__GAME__.scene.getScene('MainMenuScene').levelRows.get(${JSON.stringify(level.id)}).title.text`);
  await browser.clickText('MainMenuScene', title);
  assert.equal(await browser.evaluate("window.__GAME__.scene.getScene('MainMenuScene').selectedLevelId"), level.id);
  const startText = await browser.evaluate("window.__GAME__.scene.getScene('MainMenuScene').startButtonText.text");
  await browser.clickText('MainMenuScene', startText);
  await browser.wait("window.__GAME__.scene.isActive('PreparationScene')", `${level.id} 整备`);
  await sleep(250);
  await browser.tap('Enter');
  await browser.wait("window.__GAME__.scene.isActive('GameScene')", `${level.id} 入场`);
  await sleep(300);
}

try {
  await browser.connect();
  previousUnlocks = await browser.evaluate("localStorage.getItem('ez:unlockedLevels')");
  const levels = await browser.evaluate("import('/src/config/levels.ts').then(module => module.LEVELS.map(level => ({id:level.id,name:level.name})))");
  const flags = await browser.evaluate("import('/src/config/testing.ts').then(module => module.TESTING_FLAGS)");
  browser.log('tour-fixture', { previousUnlocks, flags, purpose: '仅临时开放关卡选择，不作为自然逐关解锁证据；生命、弹药、武器参数保持正式值' });
  await browser.evaluate(`localStorage.setItem('ez:unlockedLevels', ${JSON.stringify(JSON.stringify(levels.map(level => level.id)))})`);
  await browser.send('Page.reload');
  await browser.wait("window.__GAME__?.scene.isActive('MainMenuScene')", '测试存档主菜单', 60_000);
  await sleep(800);
  assert.equal(await browser.evaluate("window.__GAME__.scene.getScene('MainMenuScene').levelPage"), 2);
  await browser.screenshot(`${label}-menu-page3-unlocked`);
  for (const [index, level] of levels.entries()) {
    const errorsBefore = browser.errors.length;
    await openLevel(level, index);
    const before = await browser.snapshot();
    assert.equal(before.state.levelId, level.id);
    assert.equal(before.state.health, before.state.maxHealth);
    assert.ok(before.diagnostics.objects.props > 0);
    await browser.key('KeyD', true);
    await sleep(350);
    await browser.key('KeyD', false);
    const moved = await browser.snapshot();
    assert.ok(moved.diagnostics.player.x > before.diagnostics.player.x + 12, `${level.id} 移动无响应`);
    await browser.key('KeyA', true);
    await sleep(350);
    await browser.key('KeyA', false);
    await browser.move('GameScene', 640, 40);
    await browser.fire(true);
    await sleep(100);
    await browser.fire(false);
    const fired = await browser.snapshot();
    assert.ok(fired.state.magazines[fired.state.weapon] < before.state.magazines[before.state.weapon], `${level.id} 开火未消耗弹匣`);
    await browser.screenshot(`${label}-${String(index + 1).padStart(2, '0')}-combat`);
    let collision = null;
    if (level.id === 'level_4' || level.id === 'level_8') {
      const toward = level.id === 'level_4' ? 'KeyA' : 'KeyD';
      const away = level.id === 'level_4' ? 'KeyD' : 'KeyA';
      await browser.key(toward, true);
      await sleep(1500);
      const contact = await browser.snapshot();
      await sleep(450);
      const blocked = await browser.snapshot();
      await browser.key(toward, false);
      assert.ok(Math.abs(blocked.diagnostics.player.x - contact.diagnostics.player.x) < 3, `${level.id} 障碍未阻挡玩家`);
      await browser.screenshot(`${label}-${index + 1}-wall-contact`);
      await browser.key(away, true);
      await sleep(450);
      await browser.key(away, false);
      const escaped = await browser.snapshot();
      assert.ok(Math.abs(escaped.diagnostics.player.x - blocked.diagnostics.player.x) > 20, `${level.id} 接触障碍后无法离开`);
      collision = { contact: contact.diagnostics.player, blocked: blocked.diagnostics.player, escaped: escaped.diagnostics.player };
    }
    await browser.tap('Escape');
    await browser.wait("window.__GAME__.scene.getScene('GameScene').getPauseReason() === 'menu'", `${level.id} 暂停`);
    const paused = await browser.snapshot();
    await sleep(450);
    const frozen = await browser.snapshot();
    assert.equal(frozen.state.stats.elapsedMs, paused.state.stats.elapsedMs);
    assert.equal(frozen.diagnostics.objects.zombies, paused.diagnostics.objects.zombies);
    await browser.tap('Digit2');
    await browser.wait("window.__GAME__.scene.isActive('MainMenuScene')", `${level.id} 返回主菜单`);
    await sleep(650);
    assert.equal(await browser.evaluate("window.__GAME__.scene.getScene('MainMenuScene').selectedLevelId"), level.id);
    assert.equal(await browser.evaluate("window.__GAME__.scene.getScene('MainMenuScene').levelPage"), Math.floor(index / 10));
    assert.equal(browser.errors.length, errorsBefore, `${level.id} 浏览器异常`);
    const result = { level: level.id, pass: true, before, moved, fired, paused, frozen, collision };
    results.push(result);
    browser.log('tour-pass', { level: level.id, fps: fired.fps, collisionChecked: collision !== null });
    writeFileSync(join(out, `${label}-results.json`), JSON.stringify({ results, allPassed: results.length === levels.length, fixtureOnly: true }, null, 2));
  }
} catch (error) {
  browser.log('tour-failed', { completed: results.length, message: error.message });
  await browser.screenshot(`${label}-failure`);
  writeFileSync(join(out, `${label}-failure.json`), JSON.stringify({ completed: results.length, error: error.message, stack: error.stack }, null, 2));
  process.exitCode = 1;
} finally {
  if (previousUnlocks !== undefined) {
    const expression = previousUnlocks === null ? "localStorage.removeItem('ez:unlockedLevels')" : `localStorage.setItem('ez:unlockedLevels', ${JSON.stringify(previousUnlocks)})`;
    await browser.evaluate(expression);
    browser.log('tour-fixture-restored', await browser.evaluate("localStorage.getItem('ez:unlockedLevels')"));
  }
  if (browser.socket) await browser.close(label);
}
