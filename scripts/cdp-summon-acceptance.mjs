import assert from 'node:assert/strict';
import { setTimeout as sleep } from 'node:timers/promises';
import { startAcceptanceSession, snapshotExpression } from './cdp-acceptance-session.mjs';

const session = await startAcceptanceSession(process.argv[2] ?? 'summon-r01', Number(process.argv[3] ?? 9349));
const { browser, save } = session;
const report = () => browser.evaluate('window.__SUMMON_FIXTURE__.report()');
const drain = async () => { while (await browser.evaluate("window.__GAME__.scene.isActive('CardSelectionScene')")) { await browser.tap('Digit1'); await sleep(100); } };
try {
  await save('fixture-scope.json', { scope: '真实GameScene无尽首波正常刷完后，公开spawn换一个池实体为母体，公开hurt到第三阶段。隔离普通敌人与投射物；真实AI召唤，不读私有账本。两召唤物削至1HP后真实开枪击杀，用于验证补员而非自然难度。' });
  await browser.evaluate("(() => { const game = window.__GAME__; game.scene.getScenes(true).forEach(scene => game.scene.stop(scene.sys.settings.key)); game.scene.start('GameScene', { mode: 'endless' }); })()");
  await browser.wait("(() => { const scene = window.__GAME__.scene.getScene('GameScene'); const state = scene.getCombatDiagnostics(); return window.__GAME__.scene.isActive('GameScene') && state?.waveNumber === 1 && state.wave.waveIndex === 0 && state.wave.pendingInSegment === 0 && state.objects.zombies > 0; })()", 'first wave fully spawned', 60000);
  await browser.evaluate("(async () => { const { attachSummonFixture } = await import('/scripts/cdp-summon-fixture.mjs'); attachSummonFixture(window.__GAME__); })()");
  await browser.screenshot('summon-phase-fixture');
  await browser.wait("(() => { const report = window.__SUMMON_FIXTURE__.report(); return report.current?.alive === report.summon.maxAlive && report.records.filter(entry => entry.name === 'alert' && entry.payload.key === 'boss-ability-summon').length >= 3; })()", 'full cap and another summon attempt', 100000);
  await sleep(1500);
  const capped = await report();
  assert.equal(capped.current.alive, capped.summon.maxAlive);
  assert.equal(capped.current.total, capped.summon.maxAlive);
  assert.ok(capped.frames.every(frame => frame.alive <= capped.summon.maxAlive));
  assert.ok(capped.frames.every(frame => frame.wave.waveIndex === 0 && frame.wave.pendingInSegment === 0));
  await save('capped.json', capped); await browser.screenshot('capped-after-extra-attempt');
  for (let index = 0; index < 2; index++) {
    const target = await browser.evaluate('window.__SUMMON_FIXTURE__.prepareKill()');
    await browser.move('GameScene', target.x, target.y);
    const deadline = Date.now() + 6000;
    while (Date.now() < deadline && (await report()).current.kills === target.kills) {
      await browser.fire(true); await sleep(90); await browser.fire(false); await sleep(400); await drain();
    }
    assert.ok((await report()).current.kills > target.kills);
  }
  await browser.screenshot('two-minions-killed'); await save('after-two-kills.json', await report());
  await drain();
  await browser.wait('(() => { const report = window.__SUMMON_FIXTURE__.report(); return report.current.alive === report.summon.maxAlive && report.current.total >= report.summon.maxAlive + 2; })()', 'natural AI replenishment', 30000);
  const replenished = await report();
  assert.ok(replenished.frames.every(frame => frame.alive <= replenished.summon.maxAlive));
  assert.equal(replenished.current.total, replenished.summon.maxAlive + 2);
  await save('replenished.json', replenished); await browser.screenshot('replenished');
  assert.equal(browser.errors.length, 0); assert.equal(browser.failures.length, 0);
  await save('result.json', { passed: true, cap: replenished.summon.maxAlive, perCast: replenished.summon.count, cappedTotal: capped.current.total, replenishedTotal: replenished.current.total, killedByRealShots: replenished.current.kills, fixtureOnly: true });
} catch (error) {
  process.exitCode = 1;
  await save('failure.json', { message: error.message, stack: error.stack, fixture: await report().catch(() => null), snapshot: await browser.evaluate(snapshotExpression).catch(() => null), errors: browser.errors, failedRequests: browser.failures });
  await browser.screenshot('failure').catch(() => {});
  console.error(error);
} finally { await session.close(); }
