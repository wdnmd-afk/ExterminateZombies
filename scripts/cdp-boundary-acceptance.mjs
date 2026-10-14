import assert from 'node:assert/strict';
import { setTimeout as sleep } from 'node:timers/promises';
import { startAcceptanceSession } from './cdp-acceptance-session.mjs';

const session = await startAcceptanceSession(process.argv[2] ?? 'boundary-r01', Number(process.argv[3] ?? 9340));
const { browser, save } = session;
const results = [];
try {
  await save('fixture-scope.json', { injected: 'Isolated production-entity scene, fixed sources and bullets, no AI/natural drops/loadout/economy; source retirement and respawn explicit; coincident uses public reflect directly', input: 'CDP mouse pointer triggers real Bullet/CountershotSystem overlap except coincident geometry unit scene', excluded: 'Natural campaign, performance, full GameScene kill attribution' });
  for (const caseName of ['range', 'bounds', 'thin-wall', 'close', 'pellets', 'reuse', 'coincident', 'red-circle']) {
    await browser.evaluate(`(async () => { const { mountBoundaryFixture } = await import('/scripts/cdp-boundary-fixture.mjs'); mountBoundaryFixture(window.__GAME__, ${JSON.stringify(caseName)}); })()`);
    await browser.wait(`window.__BOUNDARY__?.caseName === ${JSON.stringify(caseName)} && window.__BOUNDARY__.ready`, caseName);
    await sleep(150);
    await browser.screenshot(`${caseName}-before`);
    if (['range', 'reuse'].includes(caseName)) await browser.wait('window.__BOUNDARY__.shot.active && window.__BOUNDARY__.shot.x < 250', 'shell approach', 90000);
    if (caseName === 'bounds') await browser.wait('window.__BOUNDARY__.shot.active && window.__BOUNDARY__.shot.x > 550', 'outbound approach', 90000);
    if (caseName !== 'thin-wall') await browser.click('BoundaryAcceptanceScene', 640, 540);
    if (caseName === 'red-circle') await browser.wait('window.__BOUNDARY__.records.some(event => event.name === "player-damage")', 'red circle detonation', 10000);
    else await browser.wait('!window.__BOUNDARY__.shot.active', 'shell resolved', 30000);
    await sleep(150);
    const report = await browser.evaluate('window.__BOUNDARY__.report()');
    await save(`${caseName}-observed.json`, report);
    await browser.screenshot(`${caseName}-after`);
    const reflected = report.records.filter(event => event.name === 'reflected');
    const damage = report.records.filter(event => event.name === 'player-damage');
    const zombieDamage = report.records.filter(event => event.name === 'zombie-damage');
    if (caseName === 'range') {
      assert.equal(reflected.length, 1);
      assert.equal(report.expirations.length, 1);
      assert.equal(report.expirations[0].rangeExceeded, true);
      assert.equal(report.expirations[0].outside, false);
      assert.equal(report.expirations[0].range, 1000);
    } else if (caseName === 'bounds') {
      assert.equal(reflected.length, 1);
      assert.equal(report.expirations.length, 1);
      assert.equal(report.expirations[0].outside, true);
      assert.equal(report.expirations[0].rangeExceeded, false);
    } else if (caseName === 'thin-wall') {
      assert.equal(report.expirations.length, 0);
      assert.equal(reflected.length, 0);
      assert.ok(report.projectile.x < 625 && report.projectile.x > 590);
      assert.equal(report.records.filter(event => event.name === 'structure-blast').length, 1);
    } else if (caseName === 'coincident') {
      const before = report.records.find(event => event.name === 'coincident-before').value;
      const after = report.records.find(event => event.name === 'coincident-after').value;
      assert.ok(before.gap < 1);
      assert.equal(after.reflected, true);
      assert.ok(after.projectile.velocity.x < -500);
    } else if (caseName === 'red-circle') {
      assert.equal(reflected.length, 0);
      assert.equal(damage.length, 1);
      assert.equal(report.health, 75);
      assert.equal(report.effects.enemyBlasts, 0);
    } else {
      assert.equal(reflected.length, 1);
      assert.equal(damage.length, 0);
      assert.equal(report.health, 105);
      assert.equal(zombieDamage.length, 1);
      if (caseName === 'reuse') {
        const retirement = report.records.find(event => event.name === 'source-retired').value;
        assert.notEqual(retirement.token, retirement.replacementToken);
        assert.equal(retirement.currentSource, false);
        assert.equal(zombieDamage[0].value.multiplier, 1);
      } else {
        assert.ok(reflected[0].value.gap < report.ability.blastRadius);
        assert.equal(zombieDamage[0].value.multiplier, report.ability.exposureMultiplier);
      }
    }
    assert.equal(report.missingTextures, 0);
    results.push({ caseName, passed: true, reflected: reflected.length, playerDamage: damage.length, expiration: report.expirations });
    browser.log('boundary-passed', results.at(-1));
  }
  assert.equal(browser.errors.length, 0);
  assert.equal(browser.failures.length, 0);
  await save('result.json', { passed: true, results });
} catch (error) {
  process.exitCode = 1;
  await save('failure.json', { message: error.message, stack: error.stack, results, scene: await browser.evaluate('window.__BOUNDARY__?.report()').catch(() => null), browserErrors: browser.errors, failedRequests: browser.failures });
  await browser.screenshot('failure').catch(() => {});
  console.error(error);
} finally { await session.close(); }
