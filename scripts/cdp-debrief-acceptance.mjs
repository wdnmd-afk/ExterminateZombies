import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';
import { startAcceptanceSession } from './cdp-acceptance-session.mjs';

const root = 'docs/execution/evidence/2026-10-08-scene-acceptance';
const sourceFiles = {
  clear: `${root}/attribution-r01/natural-unknown-clear-result.json`,
  death: `${root}/campaign-r03/level-16-attempt-1-result.json`,
  frenzy: `${root}/frenzy-tactical-r02/frenzy-1-result.json`,
};
const sources = Object.fromEntries(Object.entries(sourceFiles).map(([key, file]) => [key, JSON.parse(readFileSync(file, 'utf8'))]));
const debriefData = record => {
  const state = record.final.state;
  const scoreLabel = record.texts.findIndex(entry => entry.text === '得分  //  SCORE');
  assert.ok(scoreLabel >= 0);
  const score = Number(record.texts[scoreLabel + 1].text);
  assert.ok(Number.isFinite(score));
  return { ...state.stats, mode: state.mode, levelId: state.levelId, score, wave: state.wave, characterId: state.player.characterId, starterWeaponId: record.save.starter, enhancements: state.player.enhancements.length };
};
const clearData = debriefData(sources.clear);
const deathData = debriefData(sources.death);
const frenzyData = { run: sources.frenzy.final.state.frenzy, newRecord: true, best: sources.frenzy.save.frenzyRecords['hunt-v1'].shotgun };
const cases = [
  { id: 'clear', scene: 'LevelClearScene', data: { ...clearData, nextLevelId: 'level_2', unlockedLevelId: 'level_2' }, buttons: 2, hint: '药品与强化是局内资源，进入下一关时归零', menu: '返回主菜单' },
  { id: 'single-button-fixture', scene: 'LevelClearScene', data: { ...clearData, nextLevelId: null, unlockedLevelId: null }, buttons: 1, hint: '药品与强化是局内资源，本局结算后归零', menu: '返回主菜单' },
  { id: 'death', scene: 'GameOverScene', data: deathData, buttons: 2, hint: '药品与强化是局内资源，重开后归零', menu: '返回主菜单' },
  { id: 'frenzy', scene: 'FrenzyResultScene', data: frenzyData, buttons: 3, hint: '更换猎杀顺序，尝试用上一枚核心的奖励攻下下一个目标。', menu: '返回主页' },
];
const session = await startAcceptanceSession(process.argv[2] ?? 'debrief-layout-r01', Number(process.argv[3] ?? 9342));
const { browser, save } = session;
const results = [];
const waitScene = async scene => {
  await browser.wait(`window.__GAME__.scene.isActive(${JSON.stringify(scene)})`, scene, 30000);
  await sleep(350);
};
const saves = () => browser.evaluate('Object.fromEntries(Object.keys(localStorage).sort().map(key => [key, localStorage.getItem(key)]))');
const enter = async spec => {
  await browser.release();
  await browser.evaluate(`(() => { const game = window.__GAME__; game.scene.getScenes(false).forEach(scene => game.scene.stop(scene.sys.settings.key)); game.scene.start(${JSON.stringify(spec.scene)}, ${JSON.stringify(spec.data)}); return true; })()`);
  await waitScene(spec.scene);
  await browser.move(spec.scene, 640, 150);
  await sleep(150);
};
const bounds = async spec => browser.evaluate(`(async () => {
  const game = window.__GAME__;
  const scene = game.scene.getScene(${JSON.stringify(spec.scene)});
  const { getRuntimeDisplayLayout } = await import('/src/systems/DisplayManager.ts');
  const rectangle = object => { const box = object.getBounds(); return { left: box.left, right: box.right, top: box.top, bottom: box.bottom, width: box.width, height: box.height }; };
  const hint = scene.children.list.find(object => object.text === ${JSON.stringify(spec.hint)});
  const buttons = scene.children.list.filter(object => object.type === 'Rectangle' && object.input?.enabled);
  return { viewport: { width: innerWidth, height: innerHeight, devicePixelRatio }, display: getRuntimeDisplayLayout(), hint: hint ? { text: hint.text, scale: hint.scaleX, bounds: rectangle(hint) } : null, buttons: buttons.map(rectangle) };
})()`);
try {
  await save('scope.json', { fixtureOnly: true, naturalCompletionClaim: false, sourceFiles, singleButtonFixture: '只移除首关重放数据的nextLevelId来覆盖一按钮版式，不伪称战役自然通关。', recordWrites: false, scope: '独立profile直接进入三个生产结算场景；自然数据仅作布局重放。真实鼠标/键盘验证跳转，不调用结算/纪录写入逻辑，不改自然验收profile。' });
  for (const viewport of [{ width: 960, height: 720, deviceScaleFactor: 1 }, { width: 960, height: 720, deviceScaleFactor: 2 }, { width: 1280, height: 720, deviceScaleFactor: 1 }, { width: 1280, height: 720, deviceScaleFactor: 2 }, { width: 1920, height: 1080, deviceScaleFactor: 1 }, { width: 1920, height: 1080, deviceScaleFactor: 2 }]) {
    const prefix = `${viewport.width}-dpr${viewport.deviceScaleFactor}`;
    await browser.release();
    await browser.send('Emulation.setDeviceMetricsOverride', { ...viewport, mobile: false });
    await browser.send('Page.reload', { ignoreCache: true });
    await browser.wait("window.__GAME__?.scene.isActive('MainMenuScene')", 'reload after DPR change', 120000);
    await sleep(500);
    for (const spec of cases) {
      const before = await saves();
      await enter(spec);
      const layout = await bounds(spec);
      await save(`${prefix}-${spec.id}.json`, layout);
      await browser.screenshot(`${prefix}-${spec.id}`);
      assert.equal(layout.viewport.width, viewport.width);
      assert.equal(layout.viewport.height, viewport.height);
      assert.equal(layout.viewport.devicePixelRatio, viewport.deviceScaleFactor);
      assert.equal(layout.buttons.length, spec.buttons);
      assert.ok(layout.hint);
      assert.ok(layout.hint.bounds.top >= Math.max(...layout.buttons.map(button => button.bottom)) + 12);
      assert.ok(layout.hint.bounds.bottom <= 696);
      assert.ok(layout.hint.bounds.left >= 64 && layout.hint.bounds.right <= 1216);
      assert.ok(layout.buttons.every(button => button.width === 300 && button.height === 56 && button.top === 588));
      assert.deepEqual(await saves(), before, '只重放结算不得写存档');
      await browser.clickText(spec.scene, spec.menu);
      await waitScene('MainMenuScene');
      results.push({ name: `${prefix}-${spec.id}`, passed: true, menuClick: true, layout });
    }
    await enter(cases[0]);
    await browser.clickText('LevelClearScene', '下一关整备'); await waitScene('PreparationScene');
    results.push({ name: `${prefix}-next-preparation`, passed: true });
    await enter(cases[2]);
    await browser.tap('KeyR'); await waitScene('GameScene');
    const retry = await browser.evaluate("(() => { const state = window.__GAME__.scene.getScene('GameScene').getState(); return { mode: state.mode, levelId: state.levelId, kills: state.stats.kills }; })()");
    assert.deepEqual(retry, { mode: 'level', levelId: deathData.levelId, kills: 0 });
    results.push({ name: `${prefix}-death-retry`, passed: true, state: retry });
    await enter(cases[3]);
    await browser.clickText('FrenzyResultScene', '更换预设'); await waitScene('FrenzyPreparationScene');
    results.push({ name: `${prefix}-frenzy-change-preset`, passed: true });
    await enter(cases[3]);
    await browser.tap('Enter'); await waitScene('GameScene');
    const frenzy = await browser.evaluate("(() => { const state = window.__GAME__.scene.getScene('GameScene').getState(); return { mode: state.mode, presetId: state.frenzy.presetId, kills: state.frenzy.kills }; })()");
    assert.deepEqual(frenzy, { mode: 'frenzy', presetId: 'shotgun', kills: 0 });
    results.push({ name: `${prefix}-frenzy-enter-retry`, passed: true, state: frenzy });
    await enter(cases[3]); await browser.tap('Escape'); await waitScene('MainMenuScene');
    results.push({ name: `${prefix}-frenzy-escape`, passed: true });
    await save(`${prefix}-interactions.json`, results.filter(result => result.name.startsWith(prefix)));
  }
  assert.equal(browser.errors.length, 0);
  assert.equal(browser.failures.length, 0);
  await save('result.json', { passed: true, fixtureOnly: true, results });
  console.log(JSON.stringify({ passed: true, checks: results.length }));
} catch (error) {
  process.exitCode = 1;
  await save('failure.json', { message: error.message, stack: error.stack, active: await browser.evaluate('window.__GAME__.scene.getScenes(true).map(scene => scene.sys.settings.key)'), results });
  console.error(error);
} finally { await session.close(); }
