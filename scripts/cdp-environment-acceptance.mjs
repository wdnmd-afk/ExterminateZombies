import assert from 'node:assert/strict';
import { setTimeout as sleep } from 'node:timers/promises';
import { startAcceptanceSession } from './cdp-acceptance-session.mjs';

const session = await startAcceptanceSession(process.argv[2] ?? 'environment-r01', Number(process.argv[3] ?? 9344));
const { browser, save } = session;
const results = [];
const mount = async (theme, fallback = false) => {
  await browser.release();
  await browser.evaluate(`(async () => { const { mountEnvironmentFixture } = await import('/scripts/cdp-environment-fixture.mjs'); mountEnvironmentFixture(window.__GAME__, ${JSON.stringify(theme)}, ${fallback}); })()`);
  await browser.wait(`window.__ENVIRONMENT__?.ready && window.__ENVIRONMENT__.theme === ${JSON.stringify(theme)} && window.__ENVIRONMENT__.fallback === ${fallback}`, 'environment ready');
  await sleep(200);
};
const inspect = () => browser.evaluate('window.__ENVIRONMENT__.report()');

try {
  await save('fixture-scope.json', { scope: '独立生产地图/实体场景，使用真实键盘物理移动；不覆盖自然刷怪、解锁和难度。缺图只临时重命名本浏览器纹理键，finally 立即恢复；无生产资源修改。' });
  const themes = await browser.evaluate("(async () => (await import('/src/config/environmentTextures.ts')).BATTLEFIELD_BITMAP_THEME_IDS)()");
  for (const theme of themes) {
    await mount(theme);
    const before = await inspect();
    for (const entry of Object.values(before.textureBefore)) {
      assert.equal(entry.exists, true);
      assert.equal(entry.actualWidth, entry.width);
      assert.equal(entry.actualHeight, entry.height);
    }
    assert.equal(before.missing, 0);
    assert.ok(before.background.some(object => object.texture === before.textureBefore.ground.textureKey));
    assert.equal(before.background.filter(object => object.texture === before.textureBefore.boundary.textureKey).length, 4);
    assert.equal(before.background.filter(object => object.texture === before.textureBefore.rail.textureKey).length, theme === 'level_2' ? 2 : 0);
    assert.ok(before.background.some(object => object.type === 'Graphics'));
    const overlay = before.background.find(object => object.type === 'Graphics');
    assert.ok(overlay.depth > Math.max(...before.background.filter(object => object.texture).map(object => object.depth)));
    assert.ok(overlay.depth < 5);
    await browser.screenshot(`${theme}-bitmap`);
    const collision = await browser.evaluate('window.__ENVIRONMENT__.prepareCollision()');
    let afterCollision = null;
    if (collision) {
      await browser.key('KeyA', true); await sleep(850); await browser.key('KeyA', false); await sleep(80);
      afterCollision = await inspect();
      assert.ok(afterCollision.player.x < collision.start.x - 20);
      assert.ok(afterCollision.player.x >= collision.right + collision.radius - 8, `Collision drift: ${theme}`);
      await browser.screenshot(`${theme}-collision`);
    }
    await save(`${theme}-bitmap.json`, { before, collision, afterCollision });
    await mount(theme, true);
    const fallback = await inspect();
    assert.equal(fallback.restored, true);
    assert.equal(fallback.missing, 0);
    assert.equal(fallback.background.filter(object => Object.values(fallback.textureBefore).some(entry => entry.textureKey === object.texture)).length, 0);
    assert.ok(fallback.background.some(object => object.type === 'Graphics'));
    await browser.screenshot(`${theme}-fallback`);
    await save(`${theme}-fallback.json`, fallback);
    results.push({ theme, bitmap: true, fallback: true, collision: collision ? true : 'no configured obstacles' });
    browser.log('environment-passed', results.at(-1));
  }
  await mount('endless');
  const boundaries = [];
  for (const [side, x, y, key] of [['left', 60, 360, 'KeyA'], ['right', 1220, 360, 'KeyD'], ['top', 640, 60, 'KeyW'], ['bottom', 640, 660, 'KeyS']]) {
    await browser.evaluate(`window.__ENVIRONMENT__.player.teleportTo(${x}, ${y})`);
    await browser.key(key, true); await sleep(600); await browser.key(key, false); await sleep(100);
    const report = await inspect();
    const expected = side === 'left' || side === 'top' ? report.player.radius : (side === 'right' ? 1280 : 720) - report.player.radius;
    const actual = side === 'left' || side === 'right' ? report.player.x : report.player.y;
    assert.ok(Math.abs(actual - expected) < 1, `${side}: ${actual} != ${expected}`);
    boundaries.push({ side, expected, actual, world: report.world });
    await browser.screenshot(`boundary-${side}`);
  }
  assert.equal(browser.errors.length, 0); assert.equal(browser.failures.length, 0);
  await save('result.json', { passed: true, results, boundaries, fixtureOnly: true });
} catch (error) {
  process.exitCode = 1;
  await save('failure.json', { message: error.message, stack: error.stack, results, snapshot: await inspect().catch(() => null), errors: browser.errors, failedRequests: browser.failures });
  await browser.screenshot('failure').catch(() => {});
  console.error(error);
} finally { await session.close(); }
