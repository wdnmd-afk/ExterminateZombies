import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';
import { snapshotExpression, startAcceptanceSession } from './cdp-acceptance-session.mjs';

const session = await startAcceptanceSession(process.argv[2] ?? 'frenzy-layout-r01', Number(process.argv[3] ?? 9345));
const { browser, save } = session;
const results = [];
const inspect = () => browser.evaluate(snapshotExpression);
const waitScene = async name => { await browser.wait(`window.__GAME__?.scene.isActive(${JSON.stringify(name)})`, name, 30000); await sleep(300); };
const saves = () => browser.evaluate('Object.fromEntries(Object.entries(localStorage))');
const condition = expression => `(() => { const scene = window.__GAME__.scene.getScene('GameScene'); const state = scene.getState(); return ${expression}; })()`;
const overlaps = (first, second) => first.x - first.width / 2 < second.x + second.width / 2 && first.x + first.width / 2 > second.x - second.width / 2 && first.y - first.height / 2 < second.y + second.height / 2 && first.y + first.height / 2 > second.y - second.height / 2;

async function clickVisible(scene, text) {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    const matches = (await browser.texts(scene)).filter(entry => entry.text === text);
    if (matches.length === 1) {
      await browser.click(scene, matches[0].x, matches[0].y);
      return;
    }
    assert.equal(matches.length, 0, `Ambiguous visible action: ${scene}/${text}`);
    await sleep(100);
  }
  throw new Error(`Visible action did not finish entering: ${scene}/${text}`);
}

async function collectTarget(preset, id) {
  const point = await browser.evaluate(`window.__FRENZY_FIXTURE__.prepareTarget(${JSON.stringify(id)})`);
  await browser.move('GameScene', point.x, point.y);
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline && !await browser.evaluate(condition(`state.frenzy.targets[${JSON.stringify(id)}] === 'dropped'`))) {
    const current = await inspect();
    if (current.diagnostics.player.ammoInMag === 0 && !current.reloading) await browser.tap('KeyR');
    await browser.move('GameScene', point.x, point.y);
    await browser.fire(true); await sleep(80); await browser.fire(false); await sleep(220);
  }
  const dropped = await inspect();
  assert.equal(dropped.state.frenzy.targets[id], 'dropped');
  const core = dropped.cores.find(entry => Math.hypot(entry.x - point.x, entry.y - point.y) < 80);
  assert.ok(core);
  await browser.evaluate(`window.__FRENZY_FIXTURE__.parkPlayer(${core.x}, ${core.y + 72})`);
  await browser.key('KeyW', true);
  await browser.wait(condition(`state.frenzy.targets[${JSON.stringify(id)}] === 'collected'`), `${preset}/${id} actual core pickup`, 5000);
  await browser.key('KeyW', false);
  await save(`${preset}-${id}-collected.json`, await inspect());
}

try {
  const fixtureSource = 'scripts/cdp-frenzy-fixture.mjs';
  await save('scope.json', { fixtureOnly: true, naturalCompletionClaim: false, recordEligible: false, fixtureSource, fixtureSha256: createHash('sha256').update(readFileSync(fixtureSource)).digest('hex'), overrides: ['自然目标移位/固定并削至1HP，真实手枪击杀与W拾核心', '自然生成首领依配置生命阈值切至阶段1/2/3，固定位置', '只验宽窄HUD，不构造成功结算或修改正式纪录'], matrix: { presets: ['shotgun', 'tesla', 'explosive'], phases: [1, 2, 3], widths: [960, 1920], height: 720, dpr: 1 } });
  const baseline = await saves();
  for (const [index, preset] of ['shotgun', 'tesla', 'explosive'].entries()) {
    await clickVisible('MainMenuScene', '狂潮挑战'); await waitScene('FrenzyPreparationScene');
    await browser.tap(`Digit${index + 1}`); await browser.tap('Enter'); await waitScene('GameScene');
    await browser.evaluate("(async () => { const { attachFrenzyFixture } = await import('/scripts/cdp-frenzy-fixture.mjs'); return attachFrenzyFixture(window.__GAME__); })()");
    await browser.tap('Digit1');
    for (const id of ['ammo', 'breach', 'supply']) await collectTarget(preset, id);
    await browser.wait(condition("state.frenzy.phase === 'boss' && scene.getBossStatus() !== null"), 'one real boss spawned', 8000);
    for (const phase of [1, 2, 3]) {
      const changed = await browser.evaluate(`window.__FRENZY_FIXTURE__.focusBossPhase(${phase})`);
      assert.equal(changed.phase, phase);
      await sleep(100); await browser.release(); await browser.tap('Escape');
      const before = await inspect();
      assert.equal(before.diagnostics.pauseReason, 'menu');
      for (const width of [960, 1920]) {
        await browser.send('Emulation.setDeviceMetricsOverride', { width, height: 720, deviceScaleFactor: 1, mobile: false });
        await sleep(450);
        const snapshot = await inspect();
        const texts = await browser.texts('HUDScene');
        const display = await browser.evaluate("(async () => (await import('/src/systems/DisplayManager.ts')).getRuntimeDisplayLayout())()");
        const bossLabels = texts.filter(entry => entry.text.startsWith('BOSS  //') && entry.text.includes(`P${phase}/3`));
        const modeLabels = texts.filter(entry => /^狂潮 \d/.test(entry.text) || entry.text === '最终目标 · 斩杀首领');
        const medicineLabels = texts.filter(entry => ['[Z]', '[X]', '[C]', '绷带', '急救', '饮料'].includes(entry.text));
        assert.equal(snapshot.state.frenzy.presetId, preset); assert.equal(snapshot.state.frenzy.recordEligible, false);
        assert.equal(snapshot.boss.phase, phase); assert.equal(bossLabels.length, 1); assert.equal(modeLabels.length, 2); assert.equal(medicineLabels.length, 6);
        assert.equal(snapshot.state.stats.elapsedMs, before.state.stats.elapsedMs);
        assert.equal(snapshot.state.frenzy.elapsedMs, before.state.frenzy.elapsedMs);
        for (const entry of [...bossLabels, ...modeLabels, ...medicineLabels]) {
          assert.ok(entry.width > 0 && entry.height > 0);
          assert.ok(entry.x - entry.width / 2 >= -0.5 && entry.x + entry.width / 2 <= snapshot.canvas.width + 0.5, `${preset}/${phase}/${width} horizontal bounds: ${entry.text}`);
          assert.ok(entry.y - entry.height / 2 >= -0.5 && entry.y + entry.height / 2 <= snapshot.canvas.height + 0.5, `${preset}/${phase}/${width} vertical bounds: ${entry.text}`);
        }
        for (const mode of modeLabels) for (const medicine of medicineLabels) assert.equal(overlaps(mode, medicine), false);
        const name = `${preset}-phase-${phase}-${width}`;
        await save(`${name}.json`, { passed: true, fixtureOnly: true, snapshot, texts, display });
        await browser.screenshot(name);
        results.push({ name, preset, phase, width, passed: true });
      }
      await browser.tap('Escape');
    }
    const report = await browser.evaluate('window.__FRENZY_FIXTURE__.report()');
    assert.equal(report.bosses.length, 1);
    await save(`${preset}-fixture-report.json`, report);
    assert.deepEqual(await saves(), baseline);
    await browser.tap('Escape'); await browser.clickText('HUDScene', '返回主页'); await waitScene('MainMenuScene');
  }
  assert.equal(results.length, 18);
  assert.deepEqual(await saves(), baseline); assert.deepEqual(browser.errors, []); assert.deepEqual(browser.failures, []);
  await save('result.json', { passed: true, fixtureOnly: true, naturalCompletionClaim: false, results, formalRecordsUnchanged: true });
} catch (error) {
  process.exitCode = 1;
  await save('failure.json', { message: error.message, stack: error.stack, results, snapshot: await inspect().catch(() => null), fixture: await browser.evaluate('window.__FRENZY_FIXTURE__?.report()').catch(() => null), errors: browser.errors, failures: browser.failures });
  await browser.screenshot('failure').catch(() => {});
  console.error(error);
} finally { await session.close(); }
