import assert from 'node:assert/strict';
import { setTimeout as sleep } from 'node:timers/promises';
import { startAcceptanceSession, snapshotExpression } from './cdp-acceptance-session.mjs';

const session = await startAcceptanceSession(process.argv[2] ?? 'walls-r01', Number(process.argv[3] ?? 9348));
const { browser, save } = session;
const results = [];
const report = () => browser.evaluate('window.__WALL_FIXTURE__.report()');
const drainCards = async () => {
  while (await browser.evaluate("window.__GAME__.scene.isActive('CardSelectionScene')")) { await browser.release(); await browser.tap('Digit1'); await sleep(100); }
};

try {
  await save('fixture-scope.json', { scope: '生产 GameScene 第三关，两墙三来源；公开 SaveManager 设置手枪/RPG/重装并直接进关，绕过自然解锁。自然 walker 压伤见证，非见证敌人隔离；Boss 案把一池实体公开 spawn 为爆破者并 hurt 到第二阶段，反打弹隔离，红圈来自真实 AI。不调用私有结算、不改墙耐久和伤害。' });
  for (const caseName of ['bullet', 'blast', 'boss']) {
    await browser.release();
    await browser.evaluate("(async () => { const { mountWallFixture } = await import('/scripts/cdp-wall-fixture.mjs'); mountWallFixture(window.__GAME__); })()");
    await browser.wait("window.__GAME__.scene.isActive('GameScene') && window.__GAME__.scene.getScene('GameScene').getState().levelId === 'level_3'", 'third-level scene');
    await browser.wait("(() => { const scene = window.__GAME__.scene.getScene('GameScene'); return scene.physics.world.bodies.entries.filter(body => body.gameObject instanceof window.__ACCEPTANCE__.Zombie && body.gameObject.isCombatActive() && body.gameObject.def.id === 'walker').length >= 4; })()", 'natural wall witnesses', 45000);
    await browser.evaluate(`(async () => { const { attachWallFixture } = await import('/scripts/cdp-wall-fixture.mjs'); attachWallFixture(window.__GAME__, ${JSON.stringify(caseName)}); })()`);
    for (let index = 0; index < 2; index++) {
      const prepared = await browser.evaluate(`window.__WALL_FIXTURE__.prepare(${index})`);
      assert.equal(prepared.wall.stage, 'intact');
      await browser.screenshot(`${caseName}-${index}-intact`);
      await browser.key('KeyD', true); await sleep(550); await browser.key('KeyD', false);
      const blocked = await report();
      assert.ok(blocked.current.player.x <= prepared.left - prepared.radius + 2);
      const target = await browser.evaluate('window.__WALL_FIXTURE__.arm()');
      await browser.tap('Digit1'); await browser.move('GameScene', target.x, target.y);
      let cracked = false;
      const deadline = Date.now() + 45000;
      let latest = await report();
      while (Date.now() < deadline && latest.current.walls[index].stage !== 'collapsed') {
        await drainCards();
        if (caseName !== 'boss') {
          if (caseName === 'blast' && cracked) await browser.tap('Digit2');
          await browser.fire(true); await sleep(90); await browser.fire(false); await sleep(450);
        } else await sleep(120);
        latest = await report();
        if (!cracked && latest.current.walls[index].stage === 'cracked') {
          cracked = true;
          await save(`${caseName}-${index}-cracked.json`, latest.current);
          await browser.screenshot(`${caseName}-${index}-cracked`);
        }
      }
      await browser.release(); await browser.evaluate('window.__WALL_FIXTURE__.disarm()'); await drainCards();
      assert.equal(latest.current.walls[index].stage, 'collapsed');
      assert.equal(latest.current.walls[index].collisionTileCount, 0);
      assert.equal(cracked, true);
      if (caseName !== 'blast') {
        assert.ok(latest.current.kills >= prepared.kills + 2);
        assert.ok(latest.current.witnesses.every(witness => !witness.active));
      }
      await save(`${caseName}-${index}-collapsed.json`, latest.current);
      await browser.screenshot(`${caseName}-${index}-collapsed`);
      await browser.evaluate('window.__WALL_FIXTURE__.crossing()');
      await browser.key('KeyD', true);
      await browser.wait(`window.__WALL_FIXTURE__.report().current.player.x > ${prepared.right + prepared.radius + 5}`, 'walk through the collapsed opening', 6000);
      await browser.key('KeyD', false);
      const crossed = await report();
      assert.ok(crossed.current.player.x > prepared.right + prepared.radius + 5);
      await sleep(1200); await drainCards();
      const stable = await report();
      for (const stage of ['cracked', 'collapsed']) assert.equal(stable.records.filter(entry => entry.name === 'alert' && entry.payload.key === `obstacle-${prepared.wall.id}-${stage}`).length, 1);
      assert.equal(stable.current.walls[index].collisionTileCount, 0);
      await save(`${caseName}-${index}-crossed.json`, { prepared, blocked: blocked.current, crossed: crossed.current, stable: stable.current });
      await browser.screenshot(`${caseName}-${index}-crossed`);
      results.push({ caseName, wall: prepared.wall.id, passed: true, kills: latest.current.kills - prepared.kills, crossing: crossed.current.player.x, collapseOnce: true });
      browser.log('wall-passed', results.at(-1));
    }
    const observed = await report();
    if (caseName === 'boss') {
      assert.ok(observed.frames.some(frame => frame.redCircles.length > 0));
      assert.ok(observed.frames.some(frame => frame.boss?.phase === 2));
    }
    await save(`${caseName}-observed.json`, observed);
  }
  assert.equal(browser.errors.length, 0); assert.equal(browser.failures.length, 0);
  await save('result.json', { passed: true, results, fullGameScene: true, controlledFixture: true });
} catch (error) {
  process.exitCode = 1;
  await save('failure.json', { message: error.message, stack: error.stack, results, fixture: await report().catch(() => null), snapshot: await browser.evaluate(snapshotExpression).catch(() => null), errors: browser.errors, failedRequests: browser.failures });
  await browser.screenshot('failure').catch(() => {});
  console.error(error);
} finally { await session.close(); }
