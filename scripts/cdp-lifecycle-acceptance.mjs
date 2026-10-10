import assert from 'node:assert/strict';
import { setTimeout as sleep } from 'node:timers/promises';
import { startAcceptanceSession, snapshotExpression } from './cdp-acceptance-session.mjs';

const session = await startAcceptanceSession(process.argv[2] ?? 'lifecycle-r01', Number(process.argv[3] ?? 9342));
const { browser, save } = session;
const results = [];
const inspect = () => browser.evaluate(snapshotExpression);
const waitScene = async name => { await browser.wait(`window.__GAME__?.scene.isActive(${JSON.stringify(name)})`, name, 120000); await sleep(300); };
const pause = async () => {
  await browser.tap('Escape');
  await browser.wait("window.__GAME__.scene.getScene('GameScene').getPauseReason() === 'menu'", 'pause menu');
};

try {
  await browser.clickText('MainMenuScene', '狂潮挑战');
  await waitScene('FrenzyPreparationScene');
  await browser.tap('Digit3');
  await browser.tap('Enter');
  await waitScene('GameScene');
  for (let round = 1; round <= 3; round++) {
    const fresh = await inspect();
    assert.equal(fresh.state.frenzy.presetId, 'explosive');
    assert.equal(fresh.state.frenzy.ammoUntilMs, 0);
    assert.equal(fresh.state.frenzy.breachUntilMs, 0);
    assert.equal(fresh.state.stats.kills, 0);
    await browser.evaluate(`(async () => {
      const scene = window.__GAME__.scene.getScene('GameScene');
      const observation = { objects: [...scene.children.list], explosionFrames: [], soundFrames: [] };
      window.__LIFECYCLE__ = observation;
      const observer = () => {
        const visible = scene.children.list.filter(object => object.visible && object.active && object.alpha > 0 && object.texture?.key === 'game-effect-explosion');
        if (visible.length) observation.explosionFrames.push({ frame: scene.game.loop.frame, count: visible.length, time: scene.time.now });
        const sounds = scene.game.sound.sounds.filter(sound => sound.isPlaying).map(sound => sound.key);
        if (sounds.length) observation.soundFrames.push({ frame: scene.game.loop.frame, sounds });
      };
      scene.events.on('postupdate', observer);
      scene.events.once('shutdown', () => scene.events.off('postupdate', observer));
    })()`);
    await pause();
    const audioBefore = await browser.evaluate("(async () => { const { SoundManager } = await import('/src/systems/SoundManager.ts'); return SoundManager.isEnabled(); })()");
    if (!audioBefore) await browser.tap('KeyM');
    const audioEnabled = await browser.evaluate("(async () => { const { SoundManager } = await import('/src/systems/SoundManager.ts'); return SoundManager.isEnabled(); })()");
    assert.equal(audioEnabled, true);
    await browser.tap('Escape');
    await browser.move('GameScene', 640, 90);
    await browser.fire(true);
    await sleep(100);
    const shooting = await inspect();
    assert.ok(shooting.performance.bullets > 0 || shooting.state.player.magazines.rpg === 0);
    await pause();
    await browser.release();
    const paused = await inspect();
    const pauseDuration = [2000, 8000, 30000][round - 1];
    await browser.screenshot(`round-${round}-paused-shot`);
    await sleep(pauseDuration);
    const held = await inspect();
    assert.equal(held.state.stats.elapsedMs, paused.state.stats.elapsedMs);
    assert.equal(held.diagnostics.objects.bullets, paused.diagnostics.objects.bullets);
    await browser.tap('Escape');
    const resumed = await inspect();
    assert.ok(resumed.state.stats.elapsedMs - paused.state.stats.elapsedMs < 500);
    const ammoAtResume = resumed.state.player.magazines.rpg + resumed.state.player.reserve.explosive;
    await sleep(2700);
    const noBurst = await inspect();
    assert.ok(noBurst.state.player.magazines.rpg + noBurst.state.player.reserve.explosive >= ammoAtResume);
    await pause();
    const beforeSuspend = await inspect();
    await browser.clickText('HUDScene', '返回主页');
    await waitScene('MainMenuScene');
    await browser.screenshot(`round-${round}-suspended`);
    await sleep(1500);
    await browser.clickText('MainMenuScene', '继续游戏');
    await waitScene('GameScene');
    const afterSuspend = await inspect();
    assert.ok(afterSuspend.state.stats.elapsedMs - beforeSuspend.state.stats.elapsedMs < 900);
    await browser.wait("window.__GAME__.scene.isActive('FrenzyResultScene')", 'natural death', 120000);
    const ended = await inspect();
    const cleanup = await browser.evaluate(`(() => {
      const scene = window.__GAME__.scene.getScene('GameScene');
      return { oldObjectsStillActive: window.__LIFECYCLE__.objects.filter(object => object.scene && object.active).length,
        explosions: window.__LIFECYCLE__.explosionFrames, sounds: window.__LIFECYCLE__.soundFrames,
        frozen: scene.getCombatDiagnostics(), copiesDistinct: scene.getCombatDiagnostics() !== scene.getCombatDiagnostics(),
        playing: scene.game.sound.sounds.filter(sound => sound.isPlaying).map(sound => sound.key) };
    })()`);
    assert.equal(ended.state.frenzy.phase, 'dead');
    assert.equal(cleanup.oldObjectsStillActive, 0);
    assert.ok(cleanup.explosions.length > 0);
    assert.equal(cleanup.copiesDistinct, true);
    await browser.screenshot(`round-${round}-death`);
    await save(`round-${round}.json`, { fresh, shooting, paused, held, resumed, noBurst, beforeSuspend, afterSuspend, ended, cleanup, pauseDuration, naturalDeath: true, overrides: false });
    await browser.tap('Enter');
    await waitScene('GameScene');
    const retry = await inspect();
    assert.equal(retry.state.frenzy.presetId, 'explosive');
    assert.equal(retry.state.stats.kills, 0);
    assert.equal(retry.state.frenzy.ammoUntilMs, 0);
    assert.equal(retry.state.frenzy.breachUntilMs, 0);
    assert.equal(retry.state.player.magazines.rpg, 1);
    await save(`round-${round}-retry.json`, retry);
    await browser.screenshot(`round-${round}-retry`);
    results.push({ round, passed: true, pauseDuration, explosions: cleanup.explosions.length, oldObjectsStillActive: cleanup.oldObjectsStillActive });
    browser.log('lifecycle-passed', results.at(-1));
  }
  assert.equal(browser.errors.length, 0);
  assert.equal(browser.failures.length, 0);
  await save('result.json', { passed: true, results, limitations: 'Natural Frenzy RPG three rounds; objective audio activity only, no human mix judgement' });
} catch (error) {
  process.exitCode = 1;
  await save('failure.json', { message: error.message, stack: error.stack, results, snapshot: await inspect().catch(() => null), errors: browser.errors, failedRequests: browser.failures });
  await browser.screenshot('failure').catch(() => {});
  console.error(error);
} finally { await session.close(); }
