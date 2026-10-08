import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { CampaignBrowser, sleep, out } from './cdp-campaign-browser.mjs';

const browser = new CampaignBrowser();
const label = process.argv[2] ?? 'natural-level1';
const maximumSeconds = Number(process.argv[3] ?? 480);
const distance = (first, second) => Math.hypot(first.x - second.x, first.y - second.y);

function blocked(point, tiles, margin = 21) {
  return tiles.some((tile) => Math.abs(point.x - tile.x) < tile.width / 2 + margin && Math.abs(point.y - tile.y) < tile.height / 2 + margin);
}

function clearLine(first, second, tiles, margin = 4) {
  const steps = Math.ceil(distance(first, second) / 15);
  for (let index = 1; index < steps; index++) {
    const fraction = index / steps;
    if (blocked({ x: first.x + (second.x - first.x) * fraction, y: first.y + (second.y - first.y) * fraction }, tiles, margin)) return false;
  }
  return true;
}

function chooseMovement(player, enemies, tiles, target, hazards) {
  const nodes = new Map();
  const start = { x: Math.max(40, Math.min(1240, Math.round(player.x / 40) * 40)), y: Math.max(40, Math.min(680, Math.round(player.y / 40) * 40)), cost: 0, first: null };
  const queue = [start];
  nodes.set(`${start.x},${start.y}`, start);
  const directions = [{ x: 40, y: 0 }, { x: -40, y: 0 }, { x: 0, y: 40 }, { x: 0, y: -40 }];
  for (let cursor = 0; cursor < queue.length; cursor++) {
    const current = queue[cursor];
    for (const offset of directions) {
      const next = { x: current.x + offset.x, y: current.y + offset.y, cost: current.cost + 40 };
      const key = `${next.x},${next.y}`;
      if (nodes.has(key) || next.x < 40 || next.x > 1240 || next.y < 40 || next.y > 680 || blocked(next, tiles) || !clearLine(current, next, tiles, 21)) continue;
      if (hazards.some((hazard) => distance(next, hazard) < hazard.radius + 25 && distance(next, hazard) <= distance(current, hazard))) continue;
      next.first = current.first ?? next;
      nodes.set(key, next);
      queue.push(next);
    }
  }
  let best = start, bestScore = Infinity;
  for (const node of queue) {
    let score = node.cost * 0.6;
    for (const hazard of hazards) score += Math.max(0, hazard.radius + 45 - distance(node, hazard)) ** 2 * 2;
    for (const enemy of enemies) {
      const separation = distance(node, enemy);
      if (separation < 190) score += (190 - separation) * (190 - separation) * (enemy.type.endsWith('_boss') ? 0.3 : 0.1);
    }
    if (target) {
      score += Math.abs(distance(node, target) - 250) * 1.3;
      if (!clearLine(node, target, tiles)) score += 800;
    } else score += distance(node, { x: 640, y: 360 }) * 0.25;
    if (node.x < 100 || node.x > 1180 || node.y < 100 || node.y > 620) score += 50;
    if (score < bestScore) { bestScore = score; best = node; }
  }
  return best.first ?? player;
}

async function probe() {
  return browser.evaluate(`(() => {
    const game = window.__GAME__, scene = game.scene.getScene('GameScene');
    const state = scene.getState(), diagnostics = scene.getCombatDiagnostics();
    const weapon = scene.weaponManager.current;
    return {
      diagnostics,
      weapon: { id: weapon.id, auto: weapon.auto, range: weapon.range, bulletSpeed: weapon.bulletSpeed, infiniteAmmo: weapon.infiniteAmmo === true, ammoType: weapon.ammoType, fireRate: weapon.fireRate },
      reloading: scene.weaponManager.isReloading,
      player: { ...diagnostics.player, magazines: state.player.ammoInMag, medicines: state.player.medicines, medicineUse: state.player.medicineUse, skill: state.player.characterSkill },
      enemies: scene.physics.world.bodies.entries.map(body => body.gameObject).filter(object => object.typeId && object.active && object.health > 0 && !object.dying).map(object => ({ type: object.typeId, x: object.x, y: object.y, health: object.health, vx: object.body.velocity.x, vy: object.body.velocity.y })),
      tiles: scene.obstacleTiles,
      props: scene.propGroup.getChildren().filter(prop => prop.active && !prop.triggered).map(prop => ({ x: prop.x, y: prop.y, radius: prop.def.effect.radius })),
      hazards: [
        ...scene.areaEffects.lingerZones.filter(zone => zone.def.kind === 'fire').map(zone => ({ x: zone.x, y: zone.y, radius: zone.def.radius })),
        ...scene.areaEffects.enemyBlasts.map(blast => ({ x: blast.x, y: blast.y, radius: blast.radius }))
      ]
    };
  })()`);
}

const samples = [];
let selectionFixture;
let outcome = 'timeout';
let lastSample = 0, lastHeal = 0, lastSkill = 0, lastWave = -1, cardCount = 0;
const started = Date.now();
try {
  await browser.connect();
  if (/^level_\d+$/.test(process.argv[4] ?? '')) {
    const levelId = process.argv[4];
    selectionFixture = await browser.evaluate("localStorage.getItem('ez:unlockedLevels')");
    const unlocked = selectionFixture === null ? [] : JSON.parse(selectionFixture);
    const fixture = JSON.stringify([...new Set([...unlocked, levelId])]);
    browser.log('standalone-level-fixture', { levelId, previousUnlocks: selectionFixture, changes: '仅开放选关；完整战斗仍使用正式参数与真实输入' });
    await browser.evaluate(`localStorage.setItem('ez:unlockedLevels', ${JSON.stringify(fixture)})`);
    await browser.send('Page.reload');
    await browser.wait("window.__GAME__?.scene.isActive('MainMenuScene')", '独立关卡主菜单', 60_000);
    await sleep(700);
    const desiredPage = Math.floor((Number(levelId.slice(6)) - 1) / 10);
    let page = await browser.evaluate("window.__GAME__.scene.getScene('MainMenuScene').levelPage");
    while (page !== desiredPage) {
      await browser.clickText('MainMenuScene', page < desiredPage ? '下一页 ›' : '‹ 上一页');
      page = await browser.evaluate("window.__GAME__.scene.getScene('MainMenuScene').levelPage");
    }
    const title = await browser.evaluate(`window.__GAME__.scene.getScene('MainMenuScene').levelRows.get(${JSON.stringify(levelId)}).title.text`);
    await browser.clickText('MainMenuScene', title);
    await browser.clickText('MainMenuScene', await browser.evaluate("window.__GAME__.scene.getScene('MainMenuScene').startButtonText.text"));
    await browser.wait("window.__GAME__.scene.isActive('PreparationScene')", '独立关卡整备');
    await sleep(400);
    for (let attempt = 0; attempt < 6; attempt++) {
      if (await browser.evaluate("window.__GAME__.scene.getScene('PreparationScene').selectedWeaponId === 'rifle'")) break;
      await browser.tap('ArrowRight');
    }
    await browser.tap('Enter');
    await browser.wait("window.__GAME__.scene.isActive('GameScene')", '独立关卡开始');
  }
  if (process.argv[4] === 'next') {
    await browser.clickText('LevelClearScene', '下一关整备');
    await browser.wait("window.__GAME__.scene.isActive('PreparationScene')", '下一关整备');
    await sleep(500);
    await browser.tap('Enter');
    await browser.wait("window.__GAME__.scene.isActive('GameScene')", '下一关开始');
  }
  if (process.argv[4] === 'retry') {
    await browser.clickText('GameOverScene', '重开本局');
    await browser.wait("window.__GAME__.scene.isActive('GameScene')", '真实重开');
  }
  const initial = await browser.snapshot();
  if (initial.diagnostics?.pauseReason === 'menu') await browser.tap('Escape');
  while ((Date.now() - started) / 1000 < maximumSeconds) {
    const snapshot = await browser.snapshot();
    if (snapshot.active.includes('LevelClearScene')) { outcome = 'level-clear'; break; }
    if (snapshot.active.includes('GameOverScene')) { outcome = 'game-over'; break; }
    if (snapshot.active.includes('CardSelectionScene')) {
      await browser.release();
      const before = await browser.snapshot();
      await sleep(450);
      await browser.screenshot(`${label}-card-${++cardCount}`);
      const after = await browser.snapshot();
      browser.log('card-freeze', { level: before.state.levelId, pause: before.diagnostics.pauseReason, beforeTime: before.state.stats.elapsedMs, afterTime: after.state.stats.elapsedMs, beforeKills: before.state.stats.kills, afterKills: after.state.stats.kills });
      await browser.tap('Digit1');
      await sleep(250);
      continue;
    }
    if (!snapshot.state || snapshot.diagnostics?.pauseReason) { await sleep(200); continue; }
    const data = await probe();
    const player = data.player;
    if (Date.now() - lastSample > 12_000 || snapshot.state.wave !== lastWave) {
      samples.push(snapshot);
      lastSample = Date.now();
      if (snapshot.state.wave !== lastWave) await browser.screenshot(`${label}-wave-${snapshot.state.wave}`);
      lastWave = snapshot.state.wave;
      browser.log('combat', { label, elapsed: Math.round(snapshot.state.stats.elapsedMs / 1000), wave: snapshot.state.wave, kills: snapshot.state.stats.kills, health: player.health, weapon: player.currentWeaponId, active: data.enemies.length, fps: snapshot.fps });
    }
    if (snapshot.state.wave >= 2 && player.currentWeaponId === 'pistol') {
      const preferred = player.ownedWeapons.findIndex((weapon) => ['rifle', 'tesla', 'golden_m249', 'smg'].includes(weapon) && (player.magazines[weapon] > 0));
      if (preferred > 0) { await browser.release(); await browser.tap(`Digit${preferred + 1}`); continue; }
    }
    if (!data.reloading && player.ammoInMag === 0) {
      if (data.weapon.infiniteAmmo || player.ammoReserve[data.weapon.ammoType] > 0) await browser.tap('KeyR');
      else { await browser.release(); await browser.tap('Digit1'); continue; }
    }
    const candidates = [...data.enemies].sort((first, second) => (distance(player, first) + (clearLine(player, first, data.tiles) ? 0 : 1000)) - (distance(player, second) + (clearLine(player, second, data.tiles) ? 0 : 1000)));
    const target = candidates[0];
    const destination = chooseMovement(player, data.enemies, data.tiles, target, [...data.props, ...data.hazards]);
    const movement = new Set();
    if (destination.x - player.x > 10) movement.add('KeyD');
    if (destination.x - player.x < -10) movement.add('KeyA');
    if (destination.y - player.y > 10) movement.add('KeyS');
    if (destination.y - player.y < -10) movement.add('KeyW');
    for (const code of ['KeyW', 'KeyA', 'KeyS', 'KeyD']) {
      if (movement.has(code) !== browser.keys.has(code)) await browser.key(code, movement.has(code));
    }
    if (target && distance(player, target) < 200 && Date.now() - lastSkill > 14_500) {
      await browser.tap('KeyE'); lastSkill = Date.now();
    }
    if (player.health < player.maxHealth * 0.65 && !player.medicineUse && Date.now() - lastHeal > 4000) {
      const key = player.medicines.medkit > 0 ? 'KeyX' : player.medicines.bandage > 0 ? 'KeyZ' : player.medicines.energy_drink > 0 ? 'KeyC' : null;
      if (key) { await browser.tap(key); lastHeal = Date.now(); }
    }
    const nearExplosive = data.props.some(prop => distance(player, prop) < prop.radius + 45);
    if (target && !nearExplosive && distance(player, target) < data.weapon.range && clearLine(player, target, data.tiles)) {
      const travel = Math.min(0.6, distance(player, target) / data.weapon.bulletSpeed);
      await browser.move('GameScene', Math.max(4, Math.min(1276, target.x + target.vx * travel)), Math.max(4, Math.min(716, target.y + target.vy * travel)));
      if (!browser.firing) await browser.fire(true);
      await sleep(100);
      if (!data.weapon.auto) await browser.fire(false);
    } else if (browser.firing) await browser.fire(false);
    await sleep(140);
  }
  await browser.release();
  const final = await browser.snapshot();
  if (outcome === 'timeout' && final.active.includes('GameScene') && !final.diagnostics?.pauseReason) await browser.tap('Escape');
  await browser.screenshot(`${label}-${outcome}`);
  const debrief = final.active.includes('LevelClearScene') ? await browser.texts('LevelClearScene') : final.active.includes('GameOverScene') ? await browser.texts('GameOverScene') : [];
  writeFileSync(join(out, `${label}-result.json`), JSON.stringify({ outcome, wallSeconds: (Date.now() - started) / 1000, samples, final, debrief, inputOnly: true, healthOrAmmoOverrides: false }, null, 2));
  browser.log('run-result', { label, outcome, wallSeconds: (Date.now() - started) / 1000, debrief });
} catch (error) {
  browser.log('driver-error', { label, message: error.message });
  throw error;
} finally {
  if (selectionFixture !== undefined) {
    await browser.evaluate(selectionFixture === null ? "localStorage.removeItem('ez:unlockedLevels')" : `localStorage.setItem('ez:unlockedLevels', ${JSON.stringify(selectionFixture)})`);
    browser.log('standalone-fixture-restored', selectionFixture);
  }
  if (browser.socket) await browser.close(label);
}
