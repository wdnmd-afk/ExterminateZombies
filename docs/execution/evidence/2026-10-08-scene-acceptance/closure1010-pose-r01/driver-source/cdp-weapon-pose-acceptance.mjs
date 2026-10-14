import assert from 'node:assert/strict';
import { setTimeout as sleep } from 'node:timers/promises';
import { startAcceptanceSession, snapshotExpression } from './cdp-acceptance-session.mjs';

const session = await startAcceptanceSession(process.argv[2] ?? 'weapon-pose-r01', Number(process.argv[3] ?? 9354));
const { browser, save } = session;
const results = [];
const inspect = () => browser.evaluate(snapshotExpression);
const waitScene = async name => { await browser.wait(`window.__GAME__.scene.isActive(${JSON.stringify(name)})`, name); await sleep(250); };

try {
  await save('scope.json', { naturalInputPath: '主页→无尽整备→五把合法首选军械→真实开火/换弹/切枪/暂停；不证明无尽完整通关', gallery: '独立美术夹具，真实 Player 与纹理，通过公开姿态方法构造静止检阅，不修改正式角色原图、武器定义或保存通关', matrix: '五角色×17武器×三状态×四朝向；检查真实 Image 变换后的枪口，另保存16张图供目视' });
  await browser.clickText('MainMenuScene', '无尽模式'); await waitScene('PreparationScene');
  for (const name of ['M4A1', 'AA-12', 'GOLDEN M249', 'TESLA COIL', 'AK-47']) {
    const entry = (await browser.texts('PreparationScene')).find(text => text.text === name && text.y < 475);
    assert.ok(entry); await browser.click('PreparationScene', entry.x, entry.y);
  }
  await browser.clickText('PreparationScene', '应用编队  →');
  await browser.tap('Digit1'); await browser.tap('Enter'); await waitScene('GameScene');
  await browser.tap('Digit2');
  await browser.wait("window.__GAME__.scene.getScene('GameScene').getState().player.currentWeaponId === 'rifle'", 'legitimate rifle switch');
  const beforeShot = await inspect();
  await browser.move('GameScene', 1080, 260); await browser.fire(true); await sleep(80);
  await browser.tap('Escape'); await browser.fire(false);
  await browser.wait("window.__GAME__.scene.getScene('GameScene').getPauseReason() === 'menu'", 'pause during recoil');
  const paused = await inspect();
  assert.ok(paused.state.player.magazines.rifle < beforeShot.state.player.magazines.rifle);
  assert.equal(paused.weaponPose.phase, 'recoil');
  await sleep(1100);
  const held = await inspect();
  assert.deepEqual(held.weaponPose, paused.weaponPose);
  assert.equal(held.state.stats.elapsedMs, paused.state.stats.elapsedMs);
  await save('live-shot-pause.json', { beforeShot, paused, held });
  await browser.screenshot('live-shot-paused');
  await browser.tap('Escape'); await sleep(400);
  assert.equal((await inspect()).weaponPose.phase, 'idle');
  results.push({ name: 'natural-shot-muzzle-recoil-pause', passed: true });

  await browser.tap('KeyR');
  await browser.wait("window.__GAME__.scene.getScene('GameScene').getWeaponPoseDiagnostics().phase === 'reload'", 'natural reload pose');
  await sleep(300);
  const reload = await inspect();
  assert.equal(reload.reload.weaponId, 'rifle');
  assert.ok(Math.abs(reload.weaponPose.weapon.angle - reload.weaponPose.aimAngle) > 0.01);
  await browser.screenshot('live-reload');
  await browser.tap('Digit1'); await sleep(220);
  const cancelled = await inspect();
  assert.equal(cancelled.state.player.weapon, 'pistol');
  assert.equal(cancelled.reload, null);
  assert.equal(cancelled.weaponPose.reloadProgress, null);
  assert.ok(Math.abs(cancelled.weaponPose.weapon.angle - cancelled.weaponPose.aimAngle) < 0.0001);
  await save('live-reload-switch.json', { reload, cancelled });
  results.push({ name: 'natural-reload-switch-cancellation', passed: true });

  await browser.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await sleep(120);
  await browser.fire(true); await sleep(60); await browser.fire(false);
  const reduced = await inspect();
  assert.equal(reduced.weaponPose.reducedMotion, true);
  assert.equal(reduced.weaponPose.forward, 0);
  assert.equal(reduced.weaponPose.rotation, 0);
  await save('live-reduced-motion.json', reduced);
  await browser.send('Emulation.setEmulatedMedia', { features: [] });
  results.push({ name: 'os-reduced-motion', passed: true });
  await browser.release();

  await browser.evaluate(`(async () => {
    const [{ default: Phaser }, { Player }, { CHARACTERS, CHARACTER_IDS }, { WEAPONS }, { getWeaponGameplayVisual }, { configureHighResolutionScene }, { UI_FONT_FAMILY }] = await Promise.all([
      import('/node_modules/.vite/deps/phaser.js'), import('/src/entities/Player.ts'), import('/src/config/characters.ts'), import('/src/config/weapons.ts'), import('/src/systems/WeaponAssetManager.ts'), import('/src/systems/DisplayManager.ts'), import('/src/ui/fonts.ts')
    ]);
    window.__POSE_GALLERY__ = { Player, CHARACTERS, CHARACTER_IDS, WEAPONS, getWeaponGameplayVisual, UI_FONT_FAMILY };
    const game = window.__GAME__;
    game.scene.scenes.forEach(scene => game.scene.stop(scene.sys.settings.key));
    const scene = new Phaser.Scene({ key: 'WeaponPoseGallery' });
    scene.create = function () { configureHighResolutionScene(this); };
    game.scene.add('WeaponPoseGallery', scene, true);
  })()`);
  await waitScene('WeaponPoseGallery');
  const characters = await browser.evaluate('window.__POSE_GALLERY__.CHARACTER_IDS');
  const frames = [];
  for (const characterId of characters) {
    for (const page of [0, 1]) {
      for (const degrees of [0, 90, 180, -90]) {
        const entries = await browser.evaluate(`(() => {
          const fixture = window.__POSE_GALLERY__, scene = window.__GAME__.scene.getScene('WeaponPoseGallery');
          scene.children.removeAll(true);
          scene.add.rectangle(640, 360, 1280, 720, 0x18212a);
          const character = fixture.CHARACTERS[${JSON.stringify(characterId)}];
          const weaponIds = Object.keys(fixture.WEAPONS).slice(${page * 9}, ${page * 9 + 9});
          const angle = ${degrees} * Math.PI / 180;
          const textStyle = { fontFamily: fixture.UI_FONT_FAMILY, fontSize: '12px', color: '#f4eedd' };
          scene.add.text(640, 28, character.codename + ' / 真实纹理姿态夹具 / ' + ${degrees} + '°', { ...textStyle, fontSize: '24px' }).setOrigin(0.5);
          const records = [];
          for (const [row, phase] of ['idle', 'recoil', 'reload'].entries()) {
            const rowY = 160 + row * 185;
            scene.add.text(20, rowY - 65, phase, { ...textStyle, color: '#fbc02d' });
            for (const [column, weaponId] of weaponIds.entries()) {
              const player = new fixture.Player(scene, 83 + column * 138, rowY, character);
              player.setWeaponVisual(weaponId);
              player.setEncumbrance(0.25);
              player.update({ isDown: () => false, getPointerWorld: () => ({ x: player.x + Math.cos(angle) * 500, y: player.y + Math.sin(angle) * 500 }) });
              player.updateWeaponPose(1000, phase === 'reload' ? { weaponId, progress: 0.5 } : null);
              if (phase === 'recoil') player.playFireFeedback(fixture.WEAPONS[weaponId].color);
              const diagnostics = player.getWeaponPoseDiagnostics();
              const visual = fixture.getWeaponGameplayVisual(weaponId);
              const image = player.list.find(object => object.texture?.key === visual.textureKey);
              const actualMuzzle = image.getWorldTransformMatrix().transformPoint(visual.muzzleX - image.displayOriginX, visual.boreY - image.displayOriginY);
              const muzzleError = Math.hypot(actualMuzzle.x - diagnostics.muzzle.x, actualMuzzle.y - diagnostics.muzzle.y);
              scene.add.circle(actualMuzzle.x, actualMuzzle.y, 1.3, 0x7ce08a);
              scene.add.text(player.x, rowY + 65, fixture.WEAPONS[weaponId].name, textStyle).setOrigin(0.5);
              records.push({ characterId: character.id, weaponId, phase, degrees: ${degrees}, muzzleError, diagnostics });
            }
          }
          return records;
        })()`);
        for (const entry of entries) {
          assert.equal(entry.diagnostics.phase, entry.phase);
          assert.ok(entry.muzzleError < 0.001, JSON.stringify(entry));
          assert.ok(Math.abs(entry.diagnostics.body.angle - entry.diagnostics.weapon.angle) < 0.0001);
          assert.equal(entry.diagnostics.hand, null, 'Original five characters already contain both hands');
        }
        frames.push(...entries);
        await sleep(100);
        if (degrees === 0 || characterId === characters[0]) await browser.screenshot(`gallery-${characterId}-${page}-${degrees}`);
      }
    }
  }
  assert.equal(frames.length, 5 * 17 * 3 * 4);
  await save('gallery-geometry.json', { samples: frames.length, frames });
  results.push({ name: 'five-characters-seventeen-weapons-three-poses-four-angles', passed: true, fixture: true, samples: frames.length });
  assert.deepEqual(browser.errors, []); assert.deepEqual(browser.failures, []);
  await save('result.json', { passed: true, results, errors: browser.errors, failures: browser.failures, visualReview: '请另对16张图库图和实机图做目视确认，不把枪口坐标代替美术验收' });
} catch (error) {
  process.exitCode = 1;
  await save('failure.json', { message: error.message, stack: error.stack, results });
  await browser.screenshot('failure').catch(() => {});
  console.error(error);
} finally { await session.close(); }
