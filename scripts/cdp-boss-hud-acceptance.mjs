import assert from 'node:assert/strict';
import { setTimeout as sleep } from 'node:timers/promises';
import { snapshotExpression, startAcceptanceSession } from './cdp-acceptance-session.mjs';
import { assertBossHudLayout, bossHudSourceHashes, inspectBossHud } from './cdp-boss-hud-layout.mjs';
import { campaignPreparationAction } from './cdp-menu-navigation.mjs';

const session = await startAcceptanceSession(process.argv[2] ?? 'boss-hud-layout-r01', Number(process.argv[3] ?? 9348));
const { browser, save } = session;
const results = [];
const inspect = () => browser.evaluate(snapshotExpression);
const saves = () => browser.evaluate('Object.fromEntries(Object.keys(localStorage).sort().map(key => [key, localStorage.getItem(key)]))');
const waitScene = async name => { await browser.wait(`window.__GAME__?.scene.isActive(${JSON.stringify(name)})`, name, 30000); await sleep(400); };

try {
  await save('scope.json', { fixtureOnly: true, naturalMechanismClaim: false, overrides: ['独立profile正常整备进入首关并用ESC暂停', '仅替换暂停中的getBossStatus显示数据：名称/阶段来自四Boss正式配置，反击提示固定1.25倍/1.2秒', '不修改实体生命、阶段、计时、奖励或正式纪录；结束恢复原方法并核对状态不变'], matrix: { bosses: ['tank_boss', 'bomber_boss', 'hunter_boss', 'matriarch_boss'], phases: [1, 2, 3], widths: [960, 1920], height: 720, dpr: 1 }, sourceHashes: bossHudSourceHashes(['scripts/cdp-boss-hud-acceptance.mjs']) });
  const preparation = campaignPreparationAction(await browser.texts('MainMenuScene'));
  await browser.click('MainMenuScene', preparation.x, preparation.y); await waitScene('PreparationScene');
  for (const name of ['M4A1', 'AA-12', 'GOLDEN M249', 'TESLA COIL', 'AK-47']) {
    const matches = (await browser.texts('PreparationScene')).filter(entry => entry.text === name && entry.y < 475);
    assert.equal(matches.length, 1);
    await browser.click('PreparationScene', matches[0].x, matches[0].y);
  }
  await browser.clickText('PreparationScene', '应用编队  →');
  await browser.tap('Digit1'); await browser.tap('Enter'); await waitScene('GameScene');
  await browser.tap('Escape');
  await browser.wait("window.__GAME__.scene.getScene('GameScene').getPauseReason() === 'menu'", 'normal pause');
  const baseline = await saves();
  const before = await inspect();
  await save('before.json', before);
  const cases = await browser.evaluate(`(() => {
    const scene = window.__GAME__.scene.getScene('GameScene');
    const original = Object.getOwnPropertyDescriptor(scene, 'getBossStatus');
    const initialMethod = scene.getBossStatus;
    if (scene.getPauseReason() !== 'menu') throw new Error('HUD replay requires a paused battle');
    window.__BOSS_HUD_FIXTURE__ = {
      status: null,
      render(status) { this.status = structuredClone(status); window.__GAME__.scene.getScene('HUDScene').refreshBossStatus(); },
      restore() {
        if (original) Object.defineProperty(scene, 'getBossStatus', original); else delete scene.getBossStatus;
        if (scene.getBossStatus !== initialMethod) throw new Error('Boss status method was not restored');
        window.__GAME__.scene.getScene('HUDScene').refreshBossStatus();
        return true;
      }
    };
    scene.getBossStatus = () => window.__BOSS_HUD_FIXTURE__.status;
    return ['tank_boss', 'bomber_boss', 'hunter_boss', 'matriarch_boss'].flatMap(id => {
      const definition = window.__ACCEPTANCE__.ZOMBIES[id];
      return [definition.bossPhaseLabel, ...definition.bossPhases.map(phase => phase.label)].map((phaseLabel, index) => ({ id, phase: index + 1, status: { name: definition.name, phase: index + 1, totalPhases: 3, phaseLabel, health: definition.health * (index === 0 ? 1 : definition.bossPhases[index - 1].healthRatio - 0.01), maxHealth: definition.health, recovery: { active: true, remaining: 1200, damageMultiplier: 1.25 } } }));
    });
  })()`);
  assert.equal(cases.length, 12); await save('cases.json', cases);
  for (const spec of cases) {
    assert.ok(spec.status.phaseLabel);
    await browser.evaluate(`window.__BOSS_HUD_FIXTURE__.render(${JSON.stringify(spec.status)})`);
    for (const width of [960, 1920]) {
      await browser.send('Emulation.setDeviceMetricsOverride', { width, height: 720, deviceScaleFactor: 1, mobile: false });
      await sleep(450);
      const name = `${spec.id}-phase-${spec.phase}-${width}`;
      const layout = await inspectBossHud(browser);
      const snapshot = await inspect();
      assert.equal(snapshot.diagnostics.pauseReason, 'menu');
      assert.equal(snapshot.state.stats.elapsedMs, before.state.stats.elapsedMs);
      assert.equal(layout.viewport.width, width);
      assert.ok(layout.title.text.includes(spec.status.name) && layout.title.text.includes(spec.status.phaseLabel) && layout.title.text.includes(`P${spec.phase}/3`));
      assertBossHudLayout(layout, name);
      await save(`${name}.json`, { passed: true, fixtureOnly: true, spec, layout, elapsedMs: snapshot.state.stats.elapsedMs });
      await browser.screenshot(name);
      results.push({ name, passed: true, cssFontSize: layout.title.cssFontSize, logicalFontSize: layout.title.logicalFontSize });
    }
  }
  assert.equal(await browser.evaluate('window.__BOSS_HUD_FIXTURE__.restore()'), true);
  const after = await inspect();
  assert.deepEqual(after.state, before.state);
  assert.deepEqual(after.boss, before.boss);
  assert.deepEqual(await saves(), baseline);
  assert.deepEqual(browser.errors, []); assert.deepEqual(browser.failures, []);
  await save('after.json', after);
  await save('result.json', { passed: true, fixtureOnly: true, naturalMechanismClaim: false, stateUnchanged: true, saveUnchanged: true, statusMethodRestored: true, results });
} catch (error) {
  process.exitCode = 1;
  await save('failure.json', { message: error.message, stack: error.stack, results, snapshot: await inspect().catch(() => null), layout: await inspectBossHud(browser).catch(() => null), errors: browser.errors, failures: browser.failures });
  await browser.screenshot('failure').catch(() => {});
  console.error(error);
} finally {
  await browser.evaluate('window.__BOSS_HUD_FIXTURE__?.restore()').catch(() => {});
  await session.close();
}
