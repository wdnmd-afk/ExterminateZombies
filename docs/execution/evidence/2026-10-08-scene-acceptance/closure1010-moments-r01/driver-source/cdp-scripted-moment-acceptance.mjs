import assert from 'node:assert/strict';
import { setTimeout as sleep } from 'node:timers/promises';
import { startAcceptanceSession } from './cdp-acceptance-session.mjs';

const session = await startAcceptanceSession(process.argv[2] ?? 'campaign-moments-r01', Number(process.argv[3] ?? 9355));
const { browser, save } = session;
const results = [];

try {
  await save('scope.json', { fixtureOnly: true, scope: '每次重启正式 GameScene 后暂停真实时钟，受控触发指定段落并摆放玩家，验证已接入的 ScriptedMomentSystem→GameScene.spawnProp→Prop 与广播；不证明自然阶段、解锁或通关', criteria: '五关各两个时刻、每局一次、重开清空、近身点跳过、其余点真实落地、无新敌人' });
  await browser.evaluate(`(async () => {
    const [{ Player }, { Prop }, { getScriptedMoments }] = await Promise.all([import('/src/entities/Player.ts'), import('/src/entities/Prop.ts'), import('/src/config/scriptedMoments.ts')]);
    window.__MOMENT_FIXTURE__ = { Player, Prop, getScriptedMoments };
  })()`);
  for (const level of [3, 4, 5, 6, 7]) {
    for (const nearPlayer of [false, true]) {
      await browser.evaluate(`(() => {
        const game = window.__GAME__;
        game.scene.scenes.forEach(scene => game.scene.stop(scene.sys.settings.key));
        game.scene.start('GameScene', { mode: 'level', levelId: 'level_${level}', characterId: 'watcher', starterWeaponId: 'pistol' });
      })()`);
      await browser.wait(`window.__GAME__.scene.isActive('GameScene') && window.__GAME__.scene.getScene('GameScene').getState()?.levelId === 'level_${level}'`, 'new moment fixture');
      const report = await browser.evaluate(`(() => {
        const scene = window.__GAME__.scene.getScene('GameScene'), fixture = window.__MOMENT_FIXTURE__;
        scene.scene.pause();
        const entities = () => scene.physics.world.bodies.entries.map(body => body.gameObject);
        const enemyCount = () => entities().filter(object => object instanceof window.__ACCEPTANCE__.Zombie && object.isCombatActive()).length;
        const props = () => entities().filter(object => object instanceof fixture.Prop && object.active && !object.triggered).map(prop => ({ itemId: prop.itemId, x: prop.x, y: prop.y, health: prop.health, textures: prop.list.filter(object => object.type === 'Image').map(image => image.texture.key) }));
        const player = entities().find(object => object instanceof fixture.Player);
        const moments = fixture.getScriptedMoments('level_${level}');
        const first = moments[0].actions.find(action => action.kind === 'props').points[0];
        player.teleportTo(${nearPlayer} ? first.x : 640, ${nearPlayer} ? first.y : 80);
        const before = { diagnostics: scene.getScriptedMomentDiagnostics(), props: props(), enemyCount: enemyCount() };
        const announcements = [];
        const observer = payload => announcements.push(payload);
        scene.events.on(window.__ACCEPTANCE__.EVENTS.waveAnnounced, observer);
        for (const moment of moments) scene.scriptedMoments.notifySegmentStarted(moment.trigger.wave, moment.trigger.segment);
        const after = { diagnostics: scene.getScriptedMomentDiagnostics(), props: props(), enemyCount: enemyCount() };
        for (const moment of moments) scene.scriptedMoments.notifySegmentStarted(moment.trigger.wave, moment.trigger.segment);
        const repeated = { diagnostics: scene.getScriptedMomentDiagnostics(), props: props(), enemyCount: enemyCount() };
        scene.events.off(window.__ACCEPTANCE__.EVENTS.waveAnnounced, observer);
        return { levelId: 'level_${level}', fixtureOnly: true, nearPlayer: ${nearPlayer}, before, after, repeated, announcements, player: { x: player.x, y: player.y } };
      })()`);
      assert.deepEqual(report.before.diagnostics.fired, []);
      assert.equal(report.after.diagnostics.configured.length, 2);
      assert.deepEqual(report.after.diagnostics.fired, report.after.diagnostics.configured);
      assert.equal(report.after.diagnostics.props.length, 4);
      assert.equal(report.after.diagnostics.props.filter(prop => prop.skippedNearPlayer).length, nearPlayer ? 1 : 0);
      assert.equal(report.after.props.length - report.before.props.length, nearPlayer ? 3 : 4);
      assert.equal(report.after.enemyCount, report.before.enemyCount);
      assert.deepEqual(report.repeated, report.after);
      assert.equal(report.announcements.length, 2);
      for (const prop of report.after.diagnostics.props.filter(entry => !entry.skippedNearPlayer)) {
        assert.ok(report.after.props.some(entry => entry.itemId === prop.itemId && entry.x === prop.x && entry.y === prop.y && entry.health > 0 && entry.textures.length > 0));
      }
      const label = `level-${level}-${nearPlayer ? 'near-player' : 'normal'}`;
      await save(`${label}.json`, report);
      await sleep(150); await browser.screenshot(label);
      results.push({ name: label, passed: true, fixtureOnly: true });
    }
  }
  assert.deepEqual(browser.errors, []); assert.deepEqual(browser.failures, []);
  await save('result.json', { passed: true, results, errors: browser.errors, failures: browser.failures });
} catch (error) {
  process.exitCode = 1;
  await save('failure.json', { message: error.message, stack: error.stack, results });
  await browser.screenshot('failure').catch(() => {});
  console.error(error);
} finally { await session.close(); }
