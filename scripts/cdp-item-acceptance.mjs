import assert from 'node:assert/strict';
import { setTimeout as sleep } from 'node:timers/promises';
import { startAcceptanceSession, snapshotExpression } from './cdp-acceptance-session.mjs';

const session = await startAcceptanceSession(process.argv[2] ?? 'items-r01', Number(process.argv[3] ?? 9346));
const { browser, save } = session;
const results = [];
const report = () => browser.evaluate('window.__ITEM_FIXTURE__.report()');
const waitGame = async () => { await browser.wait("window.__GAME__.scene.isActive('GameScene') && window.__GAME__.scene.getScene('GameScene').getState().frenzy.elapsedMs < 1500", 'fresh real GameScene'); await sleep(160); };

try {
  await save('fixture-scope.json', { scope: '真实菜单进入狂潮，随后逐项重建生产 GameScene；只给当前道具1份，合法掉落已在自然战役另验。自然坦克不改血；其余敌人隔离；真实Q布置、邻近感应及鼠标引爆。火焰/高爆固定目标坐标以测数值，粉尘/低温保持目标真实移动。' });
  await browser.clickText('MainMenuScene', '狂潮挑战');
  await browser.wait("window.__GAME__.scene.isActive('FrenzyPreparationScene')", 'frenzy menu');
  await browser.tap('Digit1'); await browser.tap('Enter'); await waitGame();
  for (const [index, itemId] of ['firebomb', 'dust_canister', 'demo_charge', 'cryo_canister'].entries()) {
    if (index) {
      await browser.evaluate("(() => { window.__GAME__.scene.getScene('GameScene').scene.restart({ mode: 'frenzy', frenzyPresetId: 'shotgun' }); return true; })()");
      await waitGame();
    }
    await browser.evaluate(`(async () => { const { attachItemFixture } = await import('/scripts/cdp-item-fixture.mjs'); return attachItemFixture(window.__GAME__, ${JSON.stringify(itemId)}); })()`);
    await sleep(120);
    const before = await report();
    await browser.tap('KeyQ');
    await browser.wait('window.__ITEM_FIXTURE__.report().deployed !== null', 'real deployment');
    await browser.evaluate('window.__ITEM_FIXTURE__.reveal()');
    const deployed = await report();
    assert.equal(deployed.current.stock, 0);
    assert.equal(deployed.deployed.textures.length, 1);
    assert.notEqual(deployed.deployed.textures[0], '__MISSING');
    await browser.screenshot(`${itemId}-deployed`);
    const trigger = await browser.evaluate('window.__ITEM_FIXTURE__.trigger()');
    if (itemId === 'demo_charge') {
      await browser.tap('Digit1');
      await browser.move('GameScene', trigger.prop.x, trigger.prop.y);
      const deadline = Date.now() + 5000;
      while (Date.now() < deadline && (await report()).current.deployed) {
        await browser.fire(true); await sleep(90); await browser.fire(false); await sleep(160);
      }
    }
    await browser.wait('window.__ITEM_FIXTURE__.report().current.deployed === false', 'real prop trigger');
    await sleep(100);
    await browser.screenshot(`${itemId}-effect`);
    const active = await report();
    const healthChanges = records => records.frames.slice(1).flatMap((frame, frameIndex) => {
      const previous = records.frames[frameIndex];
      return previous.target.health > frame.target.health ? [{ time: frame.time, amount: previous.target.health - frame.target.health }] : [];
    });
    let outside = null;
    if (itemId === 'firebomb') {
      assert.equal(active.current.lingerZones, 1);
      await browser.wait('window.__ITEM_FIXTURE__.report().current.lingerZones === 0', 'fire expired normally', 12000);
      const ended = await report();
      const changes = healthChanges(ended);
      assert.ok(changes.length >= 3);
      assert.ok(Math.abs(changes[0].amount - (ended.definition.effect.damage + ended.definition.effect.lingering.tickDamage) * ended.deployed.multiplier) < 1);
      for (const change of changes.slice(1)) assert.ok(Math.abs(change.amount - ended.definition.effect.lingering.tickDamage * ended.deployed.multiplier) < 1);
      results.push({ itemId, passed: true, initialDamage: changes[0], fireTicks: changes.slice(1), multiplier: ended.deployed.multiplier });
    } else if (itemId === 'demo_charge') {
      const changes = healthChanges(active);
      assert.equal(changes.length, 1);
      assert.ok(Math.abs(changes[0].amount - active.definition.effect.damage * active.deployed.multiplier) < 1);
      await sleep(900);
      const repeated = await report();
      assert.equal(healthChanges(repeated).length, 1);
      assert.equal(repeated.current.lingerZones, 0);
      results.push({ itemId, passed: true, damage: changes[0].amount, multiplier: active.deployed.multiplier, repeated: false });
    } else {
      await sleep(700);
      const during = await report();
      const desiredSpeed = itemId === 'dust_canister' ? 0 : during.initialTarget.speed * during.definition.effect.lingering.slowFactor;
      assert.ok(Math.abs(during.current.target.speed - desiredSpeed) < 0.2, `Expected actual ${itemId} speed ${desiredSpeed}`);
      assert.equal(during.current.target.health, during.initialTarget.health);
      await browser.evaluate('window.__ITEM_FIXTURE__.moveTarget(1020, 360)'); await sleep(650);
      outside = await report();
      assert.ok(Math.abs(outside.current.target.speed - outside.initialTarget.speed) < 0.2);
      await browser.evaluate('window.__ITEM_FIXTURE__.moveTarget(670, 360)');
      await browser.wait('window.__ITEM_FIXTURE__.report().current.lingerZones === 0', 'control zone expired normally', 10000);
      await sleep(450);
      const ended = await report();
      assert.ok(Math.abs(ended.current.target.speed - ended.initialTarget.speed) < 0.2);
      results.push({ itemId, passed: true, expectedSpeed: desiredSpeed, actualSpeed: during.current.target.speed, recoveredSpeed: ended.current.target.speed, zeroDamage: true });
    }
    await save(`${itemId}-observed.json`, { before, deployed, trigger, active, outside, after: await report(), snapshot: await browser.evaluate(snapshotExpression) });
    await browser.screenshot(`${itemId}-expired`);
    browser.log('item-passed', results.at(-1));
  }
  assert.equal(browser.errors.length, 0); assert.equal(browser.failures.length, 0);
  await save('result.json', { passed: true, results, naturalDropEvidence: ['campaign-r04/level-17-attempt-1-item-firebomb.json', 'campaign-r04/level-17-attempt-1-item-dust_canister.json', 'campaign-r06/level-21-attempt-1-item-demo_charge.json', 'campaign-r06/level-21-attempt-1-item-cryo_canister.json'], fixtureEffects: true });
} catch (error) {
  process.exitCode = 1;
  await save('failure.json', { message: error.message, stack: error.stack, results, fixture: await report().catch(() => null), snapshot: await browser.evaluate(snapshotExpression).catch(() => null), errors: browser.errors, failedRequests: browser.failures });
  await browser.screenshot('failure').catch(() => {});
  console.error(error);
} finally { await session.close(); }
