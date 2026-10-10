import assert from 'node:assert/strict';
import { appendFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { analyzePauseProgress, startAcceptanceSession, snapshotExpression } from './cdp-acceptance-session.mjs';
import { COMBAT_POLICY_VERSION, canShootCombatTarget, chooseCombatMovement, chooseCombatSkillAim, selectCombatTarget, selectCombatWeapon, shouldUseCombatSkill } from './cdp-combat-policy.mjs';
import { BossAcceptanceTracker } from './cdp-boss-observer.mjs';
import { campaignPreparationAction } from './cdp-menu-navigation.mjs';

const suite = process.argv[2] ?? 'campaign';
const runId = process.argv[3] ?? `${suite}-r01`;
const port = Number(process.argv[4] ?? 9337);
const lastLevel = Number(process.argv[5] ?? 30);
const startLevel = Number(process.argv[6] ?? 1);
const tactical = process.env.EZ_ACCEPTANCE_TACTICAL === '1';
const session = await startAcceptanceSession(runId, port, { resumeRunId: process.argv[7], tactical });
const { browser, save, directory } = session;
const results = [];
const inspect = async () => {
  const data = await browser.evaluate(snapshotExpression);
  for (const event of data.events ?? []) appendFileSync(join(directory, event.type === 'pickup' ? 'pickup-events.jsonl' : 'combat-events.jsonl'), JSON.stringify(event) + '\n');
  return data;
};
const distance = (first, second) => Math.hypot(first.x - second.x, first.y - second.y);
const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));

function blocked(point, tiles, margin = 18) {
  return tiles.some(tile => Math.abs(point.x - tile.x) < tile.width / 2 + margin && Math.abs(point.y - tile.y) < tile.height / 2 + margin);
}

function clearLine(first, second, tiles, margin = 4) {
  const steps = Math.ceil(distance(first, second) / 16);
  for (let index = 1; index < steps; index++) {
    const fraction = index / steps;
    if (blocked({ x: first.x + (second.x - first.x) * fraction, y: first.y + (second.y - first.y) * fraction }, tiles, margin)) return false;
  }
  return true;
}

function chooseMovement(data, target, hazards) {
  const player = data.diagnostics.player;
  const tiles = data.tiles;
  const start = { x: player.x, y: player.y, cost: 0, first: null };
  const queue = [start];
  const pointKey = point => `${Math.round(point.x * 1000)},${Math.round(point.y * 1000)}`;
  const visited = new Set([pointKey(start)]);
  const steps = [{ x: 40, y: 0 }, { x: -40, y: 0 }, { x: 0, y: 40 }, { x: 0, y: -40 }];
  for (let cursor = 0; cursor < queue.length; cursor++) {
    const current = queue[cursor];
    for (const offset of steps) {
      const next = { x: current.x + offset.x, y: current.y + offset.y, cost: current.cost + 40 };
      const key = pointKey(next);
      if (visited.has(key) || next.x < 40 || next.x > 1240 || next.y < 60 || next.y > 660 || blocked(next, tiles) || !clearLine(current, next, tiles, 16)) continue;
      if (hazards.some(hazard => distance(next, hazard) < hazard.radius + 24 && distance(next, hazard) < distance(current, hazard))) continue;
      next.first = current.first ?? next;
      visited.add(key);
      queue.push(next);
    }
  }
  const core = data.cores?.slice().sort((first, second) => distance(player, first) - distance(player, second))[0];
  const desiredDistance = data.pursue ? Math.min(190, data.weapon.range * 0.55) : Math.min(440, data.weapon.range * (data.weapon.pellets > 1 ? 0.6 : 0.63));
  let best = start;
  let bestScore = Infinity;
  for (const node of queue) {
    let score = node.cost * 0.36;
    for (const enemy of data.enemies) {
      const separation = distance(node, enemy);
      if (separation < 210) score += (210 - separation) ** 2 * (enemy.id.endsWith('_boss') ? 0.48 : 0.2);
    }
    for (const hazard of hazards) score += Math.max(0, hazard.radius + 40 - distance(node, hazard)) ** 2 * 1.7;
    for (const projectile of data.projectiles) {
      const predicted = { x: projectile.x + projectile.vx * 0.25, y: projectile.y + projectile.vy * 0.25 };
      score += Math.max(0, 60 - distance(node, predicted)) ** 2 * 1.5;
    }
    if (core) score += distance(node, core) * 2.4;
    else if (target) {
      score += Math.abs(distance(node, target) - desiredDistance) * 0.9;
      if (!clearLine(node, target, tiles)) score += 1200;
    } else score += distance(node, { x: 640, y: 360 }) * 0.7;
    if (node.x < 100 || node.x > 1180 || node.y < 110 || node.y > 610) score += 190;
    if (score < bestScore) { best = node; bestScore = score; }
  }
  return best.first ?? player;
}

async function waitScene(name, timeout = 60000) {
  await browser.wait(`window.__GAME__?.scene.isActive(${JSON.stringify(name)})`, name, timeout);
  await sleep(450);
}

async function clickExact(name, text, filter = () => true) {
  const matches = (await browser.texts(name)).filter(entry => entry.text === text && filter(entry));
  if (matches.length === 0) throw new Error(`Visible action not found: ${name}/${text}`);
  await browser.click(name, matches[0].x, matches[0].y);
}

async function readSaves() {
  return browser.evaluate(`(() => { const { SaveManager, SAVE_KEYS } = window.__ACCEPTANCE__; return {
    levels: SaveManager.load(SAVE_KEYS.unlockedLevels, ['level_1']),
    weapons: SaveManager.getUnlockedWeapons(), loadout: SaveManager.getWeaponLoadout(),
    character: SaveManager.getPreferredCharacterId(), starter: SaveManager.getPreferredStarterWeapon(),
    frenzyRecords: SaveManager.load(SAVE_KEYS.frenzyRecords, {})
  }; })()`);
}

async function enterCampaignPreparation() {
  const action = campaignPreparationAction(await browser.texts('MainMenuScene'));
  await browser.click('MainMenuScene', action.x, action.y);
  await waitScene('PreparationScene');
}

async function initialPreparation(entry = '进入战前整备', weapons = ['M4A1', 'AA-12', 'GOLDEN M249', 'TESLA COIL', 'AK-47']) {
  await clickExact('MainMenuScene', entry);
  await waitScene('PreparationScene');
  await save('initial-preparation-texts.json', await browser.texts('PreparationScene'));
  await browser.screenshot('initial-loadout-before');
  // 通过首次整备的正式入口选武器，故意不选 MP5/SPAS-12 以覆盖满编队首次许可提示。
  for (const name of weapons) {
    await clickExact('PreparationScene', name, entry => entry.y < 475);
  }
  await browser.screenshot('initial-loadout-selected');
  await clickExact('PreparationScene', '应用编队  →');
  const state = await readSaves();
  assert.equal(state.loadout.length, 6);
  assert.equal(state.loadout[0], 'pistol');
  assert.equal(state.weapons.includes('smg'), false);
  assert.equal(state.weapons.includes('shotgun'), false);
  await save('initial-save-after-selection.json', state);
  await browser.tap('Digit1');
  await browser.tap('Enter');
  await waitScene('GameScene');
}

async function pauseCheck(label, duration = 1600, suspend = false) {
  await browser.release();
  const before = await inspect();
  await browser.tap('Escape');
  await browser.wait("window.__GAME__.scene.getScene('GameScene').getPauseReason() === 'menu'", 'pause menu');
  const paused = await inspect();
  let held;
  const frozenProgress = () => browser.evaluate("(() => { const state = window.__GAME__.scene.getScene('GameScene').getState(); return { elapsedMs: state.stats.elapsedMs, frenzyElapsedMs: state.frenzy?.elapsedMs }; })()");
  await browser.screenshot(`${label}-paused`);
  if (suspend) {
    await clickExact('HUDScene', '返回主页');
    await waitScene('MainMenuScene');
    await browser.screenshot(`${label}-suspended`);
    await sleep(duration);
    held = await frozenProgress();
    await clickExact('MainMenuScene', '继续游戏');
    await waitScene('GameScene');
  } else {
    await sleep(duration);
    held = await frozenProgress();
    await browser.tap('Escape');
  }
  const after = await inspect();
  const elapsed = after.state.stats.elapsedMs - paused.state.stats.elapsedMs;
  const frenzyElapsed = before.state.frenzy ? after.state.frenzy.elapsedMs - paused.state.frenzy.elapsedMs : null;
  const remaining = state => state.frenzy ? { ammo: Math.max(0, state.frenzy.ammoUntilMs - state.frenzy.elapsedMs), breach: Math.max(0, state.frenzy.breachUntilMs - state.frenzy.elapsedMs) } : null;
  const result = { before, paused, held, after, duration, suspend, elapsed, frenzyElapsed, rewardsBefore: remaining(before.state), rewardsAfter: remaining(after.state), ...analyzePauseProgress(before, paused, held, after) };
  await save(`${label}-pause.json`, result);
  assert.ok(result.passed, 'Combat time advanced during pause/suspend');
  return result;
}

async function runCombat(label, options = {}) {
  const started = Date.now();
  const samples = [];
  const captures = [];
  const events = [];
  const freezes = [];
  const itemActions = [];
  const usedItems = new Set();
  const overdrives = [];
  let lastSample = 0;
  let lastLog = 0;
  let lastWave = -1;
  let lastBossPhase = null;
  let lastFrenzy = '';
  let lastHeal = 0;
  let lastSkill = 0;
  let lastChange = 0;
  let previousProps = [];
  let fireHazards = [];
  let cards = 0;
  let waypoint = null;
  let waypointUntil = 0;
  let lastKillCount = 0;
  let lastKillAt = Date.now();
  const pendingNotices = [];
  let pauseDone = false;
  let rewardMedicinePrepared = false;
  let outcome = 'wall-timeout';
  let attributionCaptured = false;
  const bossTracker = options.bossMechanisms ? new BossAcceptanceTracker() : null;
  const navigation = {};
  let lastBossShot = 0;
  let final;
  await browser.screenshot(`${label}-entry`);
  while (Date.now() - started < (options.maximumSeconds ?? 480) * 1000) {
    const data = await inspect();
    final = data;
    const bossControl = bossTracker?.observe(data);
    for (const capture of bossTracker?.captures.splice(0) ?? []) {
      const name = `${label}-${capture.boss}-phase-${capture.phase}-${capture.kind}`;
      await save(`${name}.json`, capture);
      await browser.screenshot(name);
    }
    if (bossControl?.expired) { outcome = 'boss-observation-timeout'; break; }
    if (data.events?.length) {
      events.push(...data.events);
      for (const event of data.events) {
        const title = event.payload?.title ?? '';
        if (title.includes('阶段') || title.includes('许可') || title.includes('编队') || title.includes('绷带') || title.includes('火力') || title.includes('核心')) {
          const screenshot = `${label}-notice-${captures.length}`;
          captures.push({ event, texts: await browser.texts('HUDScene'), screenshot });
          await browser.screenshot(screenshot);
          if (title.includes('阶段补给')) pendingNotices.push(event);
        }
      }
    }
    const ended = data.active.find(name => ['LevelClearScene', 'GameOverScene', 'FrenzyResultScene'].includes(name));
    if (ended) { outcome = ended; break; }
    if (bossControl?.newPhase) {
      await browser.release(); await browser.tap('Escape');
      const before = await inspect();
      const viewport = await browser.evaluate('({ width: innerWidth, height: innerHeight, deviceScaleFactor: devicePixelRatio })');
      for (const width of [960, 1920]) {
        await browser.send('Emulation.setDeviceMetricsOverride', { width, height: 720, deviceScaleFactor: 1, mobile: false });
        await sleep(450);
        const snapshot = await inspect(); const texts = await browser.texts('HUDScene');
        const name = `${label}-phase-${bossControl.phase}-view-${width}`;
        const bossLabels = texts.filter(entry => entry.text.includes(before.boss.phaseLabel));
        assert.ok(bossLabels.length > 0 && bossLabels.every(entry => entry.x - entry.width / 2 >= 0 && entry.x + entry.width / 2 <= snapshot.canvas.width));
        await save(`${name}.json`, { snapshot, texts, inputOnly: true, pausedViewportCheck: true });
        await browser.screenshot(name);
      }
      await browser.send('Emulation.setDeviceMetricsOverride', { ...viewport, mobile: false });
      await sleep(250); await browser.tap('Escape');
      const after = await inspect();
      assert.ok(after.state.stats.elapsedMs - before.state.stats.elapsedMs < 500);
      continue;
    }
    if (data.active.includes('CardSelectionScene')) {
      await browser.release();
      await sleep(500);
      const before = await inspect();
      await browser.screenshot(`${label}-card-${++cards}`);
      await sleep(900);
      const after = await inspect();
      freezes.push({ before: before.state.stats.elapsedMs, after: after.state.stats.elapsedMs, passed: before.state.stats.elapsedMs === after.state.stats.elapsedMs });
      const texts = await browser.texts('CardSelectionScene');
      let selection = null;
      if (options.bossMechanisms) {
        selection = { skipped: true, reason: '保留普通手枪点射，避免强化暴击跳过Boss阶段' };
        await browser.tap('Escape');
      } else if (tactical) {
        const definitions = await browser.evaluate('Object.values(window.__ACCEPTANCE__.ENHANCEMENTS).map(({ id, cardTitle, weaponId }) => ({ id, cardTitle, weaponId }))');
        const visibleCards = texts.flatMap(text => {
          const matches = definitions.filter(definition => definition.cardTitle === text.text);
          return matches.length === 1 ? [{ ...text, ...matches[0] }] : [];
        });
        const order = ['rifle', 'tesla', 'golden_m249', 'ak47', 'aa12', 'pistol'];
        const rank = card => order.includes(card.weaponId) ? order.indexOf(card.weaponId) : order.length;
        selection = visibleCards.sort((first, second) => rank(first) - rank(second) || first.x - second.x)[0];
        assert.ok(selection, 'Choose only an enhancement title actually visible on a card');
        await browser.click('CardSelectionScene', selection.x, selection.y);
      } else await browser.tap('Digit1');
      captures.push({ card: cards, texts, selection });
      await sleep(250);
      continue;
    }
    if (!data.state || !data.weapon || data.diagnostics?.pauseReason) { await sleep(100); continue; }
    if (options.attributionSource && !attributionCaptured && data.state.stats.killsBySource[options.attributionSource] > 0) {
      attributionCaptured = true;
      await save(`${label}-first-${options.attributionSource}.json`, data);
      await browser.screenshot(`${label}-first-${options.attributionSource}`);
    }
    const overdrive = data.state.player.endlessOverdrive;
    if (overdrive && !overdrives.some(entry => entry.milestone === overdrive.milestone)) {
      const observation = { ...overdrive, at: data.sceneTime, wave: data.state.wave, stats: data.state.stats };
      overdrives.push(observation);
      await save(`${label}-overdrive-${overdrive.milestone}.json`, data);
      await browser.screenshot(`${label}-overdrive-${overdrive.milestone}`);
      if (options.pauseOverdrive && overdrive.milestone >= 20 && data.state.player.health > 30) await pauseCheck(`${label}-overdrive-${overdrive.milestone}`, 8000);
    }
    if (options.goalWave && data.state.wave >= options.goalWave && (options.goalMilestones ?? [20, 35]).every(milestone => overdrives.some(entry => entry.milestone === milestone))) {
      outcome = 'objective-reached';
      break;
    }
    if (pendingNotices.length) {
      await browser.release();
      await sleep(240);
      const texts = await browser.texts('HUDScene');
      for (const notice of pendingNotices.splice(0)) {
        const screenshot = `${label}-visible-notice-${captures.length}`;
        captures.push({ event: notice, visible: texts.some(entry => entry.text === notice.payload.title), texts, screenshot });
        await browser.screenshot(screenshot);
      }
    }
    const hasFrenzyReward = data.state.frenzy && (data.state.frenzy.ammoUntilMs > data.state.frenzy.elapsedMs || data.state.frenzy.breachUntilMs > data.state.frenzy.elapsedMs);
    if (options.pause && !pauseDone && data.state.stats.elapsedMs > 3000 && data.state.player.health > 50 && (!options.afterReward || hasFrenzyReward)) {
      pauseDone = true;
      await pauseCheck(`${label}-menu`, options.pauseDuration ?? 1800, options.suspend === true);
      continue;
    }
    const frenzyKey = JSON.stringify(data.state.frenzy?.targets ?? {});
    const sample = { at: data.at, frame: data.frame, fps: data.fps, state: data.state, diagnostics: data.diagnostics, boss: data.boss, walls: data.walls, performance: data.performance, reloading: data.reloading, reload: data.reload, skill: data.skill, cores: data.cores, props: data.props, itemEnemies: usedItems.size ? data.enemies : undefined, tactical: tactical ? { weapon: data.weapon, weaponStatuses: data.weaponStatuses, enemies: data.enemies, projectiles: data.projectiles, blastWarnings: data.blastWarnings, frenzyTargets: data.frenzyTargets } : undefined };
    if (Date.now() - lastSample >= 1000 || data.state.wave !== lastWave || frenzyKey !== lastFrenzy) {
      samples.push(sample);
      appendFileSync(join(directory, `${label}-samples.jsonl`), JSON.stringify(sample) + '\n');
      lastSample = Date.now();
    }
    if (data.state.frenzy && frenzyKey !== lastFrenzy) {
      await browser.screenshot(`${label}-objectives-${samples.length}`);
      captures.push({ frenzy: data.state.frenzy, cores: data.cores, player: data.diagnostics.player, frame: data.frame });
    }
    lastFrenzy = frenzyKey;
    if (data.state.wave !== lastWave || data.boss?.phase !== lastBossPhase) {
      lastWave = data.state.wave;
      lastBossPhase = data.boss?.phase;
      await browser.screenshot(`${label}-stage-${data.state.wave}-${data.boss?.phase ?? 0}-${samples.length}`);
    }
    if (Date.now() - lastLog > 15000) {
      browser.log('combat', { label, elapsed: Math.round(data.state.stats.elapsedMs / 1000), wave: data.state.wave, hp: data.state.player.health, kills: data.state.stats.kills, weapon: data.state.player.weapon, fps: Math.round(data.fps), frenzy: data.state.frenzy });
      lastLog = Date.now();
    }
    const player = data.diagnostics.player;
    const now = Date.now();
    if (options.prepareRewardMedicine && !rewardMedicinePrepared && data.state.wave === 2 && data.diagnostics.wave.state === 'waiting_clear' && data.enemies.length <= 4) {
      rewardMedicinePrepared = true;
      await browser.release();
      const before = await inspect();
      const deadline = Date.now() + 30000;
      let current = before;
      while (Date.now() < deadline && current.state.wave === 2 && current.state.player.health > 0 && current.state.player.medicines.bandage > 2) {
        if (!current.state.player.medicineUse && current.state.player.health < current.state.player.maxHealth) {
          await browser.tap('KeyZ');
          await sleep(1700);
        } else await sleep(150);
        current = await inspect();
      }
      await save(`${label}-natural-bandage-use.json`, { before, after: current, inputOnly: true });
      await browser.screenshot(`${label}-natural-bandage-use`);
      continue;
    }
    if (data.state.stats.kills !== lastKillCount) { lastKillCount = data.state.stats.kills; lastKillAt = now; }
    data.pursue = now - lastKillAt > 15000;
    if (options.deployItems && player.health > 30 && !data.state.player.medicineUse) {
      const itemId = ['dust_canister', 'cryo_canister', 'firebomb', 'demo_charge'].find(id => data.state.player.items[id] > 0 && !usedItems.has(id));
      if (itemId && !data.enemies.some(enemy => distance(player, enemy) < 120)) {
        await browser.release();
        const before = await inspect();
        let selected = before;
        for (let tries = 0; tries < 8 && selected.state.player.currentItemId !== itemId; tries++) {
          await browser.tap('KeyF');
          await sleep(80);
          selected = await inspect();
        }
        assert.equal(selected.state.player.currentItemId, itemId);
        await browser.tap('KeyQ');
        const after = await inspect();
        assert.equal(after.state.player.items[itemId], before.state.player.items[itemId] - 1);
        usedItems.add(itemId);
        itemActions.push({ itemId, before, after, naturalDrop: true });
        await save(`${label}-item-${itemId}.json`, itemActions.at(-1));
        await browser.screenshot(`${label}-item-${itemId}`);
        continue;
      }
    }
    for (const prop of previousProps) {
      if (!data.props.some(current => current.id === prop.id && current.x === prop.x && current.y === prop.y) && prop.lingering?.kind === 'fire') {
        fireHazards.push({ x: prop.x, y: prop.y, radius: prop.lingering.radius, until: now + prop.lingering.duration + 800 });
      }
    }
    previousProps = data.props;
    fireHazards = fireHazards.filter(hazard => hazard.until > now);
    const hazards = [...data.props.filter(prop => prop.radius > 0), ...fireHazards];
    const preferred = data.weaponStatuses.filter(status => status.usable && status.ammoInMag > 0 && status.weaponId !== 'pistol');
    if (tactical && now - lastChange > 1500 && (options.attributionSource || !(data.state.mode === 'level' && data.state.levelId === 'level_1' && data.state.wave === 1))) {
      const selected = bossControl ? 'pistol' : options.attributionSource && !attributionCaptured && data.weaponStatuses.some(status => status.weaponId === options.attributionWeapon && status.usable) ? options.attributionWeapon : selectCombatWeapon(data);
      if (selected !== player.currentWeaponId) {
        const slot = data.state.player.owned.indexOf(selected) + 1;
        assert.ok(slot >= 1 && slot <= 6, 'Select only a legitimately equipped weapon');
        await browser.release();
        await browser.tap(`Digit${slot}`);
        lastChange = now;
        continue;
      }
    }
    if (!tactical && !data.state.frenzy && !(data.state.levelId === 'level_1' && data.state.wave === 1) && now - lastChange > 2000) {
      const rank = ['rifle', 'tesla', 'golden_m249', 'ak47', 'aa12', 'smg', 'shotgun'];
      preferred.sort((first, second) => rank.indexOf(first.weaponId) - rank.indexOf(second.weaponId));
      if (player.currentWeaponId === 'pistol' && preferred.length) {
        await browser.release();
        await browser.tap(`Digit${data.state.player.owned.indexOf(preferred[0].weaponId) + 1}`);
        lastChange = now;
        continue;
      }
    }
    if (player.ammoInMag === 0 && !data.reloading) {
      if (data.weapon.infiniteAmmo || player.ammoReserve[data.weapon.ammoType] > 0) {
        await browser.tap('KeyR');
      } else if (tactical || !data.state.frenzy) {
        const next = tactical ? selectCombatWeapon(data) : preferred[0]?.weaponId ?? 'pistol';
        await browser.release();
        await browser.tap(`Digit${data.state.player.owned.indexOf(next) + 1}`);
        lastChange = now;
        continue;
      }
    }
    const priority = enemy => distance(player, enemy) + (clearLine(player, enemy, data.tiles) ? 0 : 1500) - (data.state.frenzy && ['bloodied', 'oddity', 'tank', 'tank_boss'].includes(enemy.id) ? 380 : 0);
    const candidates = [...data.enemies].sort((first, second) => priority(first) - priority(second));
    const charge = options.deployItems ? data.props.find(prop => prop.id === 'demo_charge' && distance(player, prop) > 120 && clearLine(player, prop, data.tiles)) : null;
    const target = bossControl?.boss ?? (charge ? { ...charge, vx: 0, vy: 0 } : tactical ? selectCombatTarget(data) : candidates[0]);
    if (bossControl) data.mechanismRange = bossControl.range;
    if (tactical || !waypoint || distance(player, waypoint) < 12 || now >= waypointUntil || data.enemies.some(enemy => distance(player, enemy) < 70)) {
      const candidate = tactical ? chooseCombatMovement(data, target, hazards, navigation) : chooseMovement(data, target, hazards);
      waypoint = { x: candidate.x, y: candidate.y };
      waypointUntil = now + 900;
    }
    const destination = waypoint;
    const movement = new Set();
    if (destination.x - player.x > 9) movement.add('KeyD');
    if (destination.x - player.x < -9) movement.add('KeyA');
    if (destination.y - player.y > 9) movement.add('KeyS');
    if (destination.y - player.y < -9) movement.add('KeyW');
    for (const code of ['KeyW', 'KeyA', 'KeyS', 'KeyD']) if (movement.has(code) !== browser.keys.has(code)) await browser.key(code, movement.has(code));
    const useSkill = !bossControl && (tactical ? now - lastSkill > 500 && shouldUseCombatSkill(data) : target && distance(player, target) < 200 && now - lastSkill > 20000);
    if (useSkill) {
      // 位移技能朝安全航点而非尸群；其他技能仍使用正常鼠标瞄准与E键。
      const aim = tactical ? chooseCombatSkillAim(data, destination, target, hazards) : target;
      if (aim) {
        await browser.move('GameScene', clamp(aim.x, 4, 1276), clamp(aim.y, 4, 716));
        await browser.tap('KeyE'); lastSkill = now;
      }
    }
    if (player.health < player.maxHealth * 0.7 && !data.state.player.medicineUse && now - lastHeal > 3800) {
      const medicines = data.state.player.medicines;
      const code = medicines.medkit > 0 ? 'KeyX' : medicines.bandage > 0 ? 'KeyZ' : medicines.energy_drink > 0 ? 'KeyC' : null;
      if (code) { await browser.tap(code); lastHeal = now; }
    }
    const nearExplosion = data.props.some(prop => prop.radius > 0 && distance(player, prop) < prop.radius + 40);
    if (target && !nearExplosion && (!bossControl || (!bossControl.holdFire && now - lastBossShot > 900)) && (!tactical || canShootCombatTarget(data, target)) && distance(player, target) < data.weapon.range && clearLine(player, target, data.tiles)) {
      const travel = Math.min(0.5, distance(player, target) / data.weapon.bulletSpeed);
      await browser.move('GameScene', clamp(target.x + target.vx * travel, 4, 1276), clamp(target.y + target.vy * travel, 4, 716));
      if (!browser.firing) await browser.fire(true);
      if (!data.weapon.auto || bossControl) { await sleep(45); await browser.fire(false); }
      if (bossControl) lastBossShot = now;
    } else if (browser.firing) await browser.fire(false);
    await sleep(85);
  }
  await browser.release();
  final = await inspect();
  bossTracker?.observe(final);
  const resultScene = final.active.find(name => ['LevelClearScene', 'GameOverScene', 'FrenzyResultScene'].includes(name));
  if (resultScene) outcome = resultScene;
  if (['wall-timeout', 'objective-reached', 'boss-observation-timeout'].includes(outcome) && final.active.includes('GameScene') && !final.diagnostics?.pauseReason) await browser.tap('Escape');
  await sleep(250);
  await browser.screenshot(`${label}-result`);
  const texts = resultScene ? await browser.texts(resultScene) : await browser.texts('HUDScene');
  const result = { label, outcome, wallSeconds: (Date.now() - started) / 1000, inputOnly: true, overrides: false, tactical, sampleCount: samples.length, final, texts, events, captures, freezes, itemActions, overdrives, bossMechanisms: bossTracker?.result(), save: await readSaves(), errors: [...browser.errors], failures: [...browser.failures] };
  await save(`${label}-result.json`, result);
  browser.log('result', { label, outcome, hp: final.state?.player.health, kills: final.state?.stats.kills, elapsed: final.state?.stats.elapsedMs, save: result.save.levels });
  return result;
}

async function campaign() {
  if (startLevel === 1) await initialPreparation();
  else {
    const prior = await readSaves();
    assert.ok(prior.levels.includes(`level_${startLevel}`), 'Resume requires a genuinely unlocked level');
    await clickExact('MainMenuScene', '进入战前整备');
    await waitScene('PreparationScene');
    await browser.tap('Enter');
    await waitScene('GameScene');
  }
  for (let level = startLevel; level <= lastLevel; level++) {
    let cleared = false;
    const attempts = tactical ? 1 : 2;
    for (let attempt = 1; attempt <= attempts; attempt++) {
      const entry = await inspect();
      assert.equal(entry.state.levelId, `level_${level}`);
      const result = await runCombat(`level-${level}-attempt-${attempt}`, { pause: level <= 3, suspend: level === 2, deployItems: true, maximumSeconds: level >= 18 ? 1200 : 480 });
      results.push({ label: result.label, outcome: result.outcome, seconds: result.wallSeconds, kills: result.final.state?.stats.kills });
      if (result.outcome === 'LevelClearScene') { cleared = true; break; }
      if (result.outcome !== 'GameOverScene' || attempt === attempts) break;
      await browser.tap('KeyR');
      await waitScene('GameScene');
    }
    if (!cleared) break;
    if (level === lastLevel) break;
    await clickExact('LevelClearScene', '下一关整备');
    await waitScene('PreparationScene');
    await browser.screenshot(`level-${level + 1}-preparation`);
    await browser.tap('ArrowRight');
    await browser.tap('Enter');
    await waitScene('GameScene');
  }
}

async function frenzy() {
  const baseline = await readSaves();
  for (let index = 1; index <= 3; index++) {
    if (index === 1 || tactical) await clickExact('MainMenuScene', '狂潮挑战');
    else await clickExact('FrenzyResultScene', '更换预设');
    await waitScene('FrenzyPreparationScene');
    await browser.tap(`Digit${index}`);
    await browser.screenshot(`frenzy-${index}-preparation`);
    await browser.tap('Enter');
    await waitScene('GameScene');
    const result = await runCombat(`frenzy-${index}`, { pause: true, suspend: index === 2, pauseDuration: 30000, afterReward: true });
    results.push({ label: result.label, outcome: result.outcome, phase: result.final.state?.frenzy?.phase });
    if (result.outcome !== 'FrenzyResultScene') break;
    const saved = await readSaves();
    for (const key of ['levels', 'weapons', 'loadout', 'character', 'starter']) assert.deepEqual(saved[key], baseline[key], `Frenzy changed campaign save: ${key}`);
    if (result.final.state.frenzy.phase !== 'won') assert.deepEqual(saved.frenzyRecords, baseline.frenzyRecords);
    else if (tactical) {
      const expected = await browser.evaluate(`(() => { const meta = window.__ACCEPTANCE__, run = ${JSON.stringify(result.final.state.frenzy)}; return { version: meta.FRENZY_VERSION, score: meta.getFrenzyScore(run).total, elapsedMs: run.elapsedMs }; })()`);
      assert.equal(result.final.state.frenzy.recordEligible, true);
      assert.deepEqual(saved.frenzyRecords[expected.version][result.final.state.frenzy.presetId], { score: expected.score, elapsedMs: expected.elapsedMs });
      assert.ok(result.texts.some(entry => entry.text === '新的个人纪录'));
      await save(`frenzy-${index}-natural-record.json`, { passed: true, expected, saved: saved.frenzyRecords, inputOnly: true });
    }
    baseline.frenzyRecords = saved.frenzyRecords;
    if (tactical) {
      await browser.tap('Escape');
      await waitScene('MainMenuScene');
      continue;
    }
    await browser.tap('Enter');
    await waitScene('GameScene');
    const fresh = await inspect();
    assert.equal(fresh.state.frenzy.presetId, result.final.state.frenzy.presetId);
    assert.equal(fresh.state.frenzy.ammoUntilMs, 0);
    assert.equal(fresh.state.frenzy.breachUntilMs, 0);
    assert.deepEqual(fresh.state.frenzy.targets, { ammo: 'alive', breach: 'alive', supply: 'alive' });
    await save(`frenzy-${index}-retry-fresh.json`, fresh);
    await browser.screenshot(`frenzy-${index}-retry-fresh`);
    await browser.wait("window.__GAME__.scene.isActive('FrenzyResultScene')", 'unassisted retry death', 120000);
    const retry = await inspect();
    assert.equal(retry.state.frenzy.phase, 'dead');
    assert.deepEqual((await readSaves()).frenzyRecords, baseline.frenzyRecords);
    await save(`frenzy-${index}-retry-death.json`, { snapshot: retry, texts: await browser.texts('FrenzyResultScene') });
    await browser.screenshot(`frenzy-${index}-retry-death`);
  }
  if (tactical && await browser.evaluate("window.__GAME__.scene.isActive('MainMenuScene')")) {
    await browser.send('Page.reload', { ignoreCache: true });
    await waitScene('MainMenuScene');
    const persisted = await browser.evaluate("(async () => { const { SaveManager, SAVE_KEYS } = await import('/src/systems/SaveManager.ts'); return SaveManager.load(SAVE_KEYS.frenzyRecords, {}); })()");
    assert.deepEqual(persisted, baseline.frenzyRecords);
    await save('frenzy-reloaded-records.json', { passed: true, records: persisted, naturalWins: results.filter(result => result.phase === 'won').length });
    await browser.screenshot('frenzy-reloaded-menu');
  }
}

async function tutorial() {
  await initialPreparation();
  const first = await runCombat('tutorial-level-1', { pause: true, deployItems: true });
  results.push({ label: first.label, outcome: first.outcome });
  if (first.outcome !== 'LevelClearScene') return;
  assert.ok(first.save.weapons.includes('smg') && first.save.weapons.includes('shotgun'));
  await clickExact('LevelClearScene', '返回主菜单');
  await waitScene('MainMenuScene');
  await clickExact('MainMenuScene', '武器库');
  await waitScene('WeaponLibraryScene');
  await clickExact('WeaponLibraryScene', 'M4A1', entry => entry.x < 740 && entry.y > 190);
  await clickExact('WeaponLibraryScene', 'MP5', entry => entry.x < 740 && entry.y > 190);
  const equipped = await readSaves();
  assert.equal(equipped.loadout.includes('rifle'), false);
  assert.ok(equipped.loadout.includes('smg'));
  await save('natural-mp5-loadout.json', equipped);
  await browser.screenshot('natural-mp5-loadout');
  await browser.tap('Escape');
  await waitScene('MainMenuScene');
  await clickExact('MainMenuScene', '进入战前整备');
  await waitScene('PreparationScene');
  await clickExact('PreparationScene', 'MP5');
  await browser.tap('Enter');
  await waitScene('GameScene');
  const before = await inspect();
  assert.equal(before.state.levelId, 'level_2');
  assert.equal(before.state.player.weapon, 'smg');
  await browser.move('GameScene', 640, 100);
  await browser.fire(true); await sleep(1000); await browser.fire(false);
  const after = await inspect();
  assert.ok(after.state.player.magazines.smg < before.state.player.magazines.smg);
  await save('level-2-mp5-fired.json', { before, after, saved: await readSaves() });
  await browser.screenshot('level-2-mp5-fired');
  const second = await runCombat('tutorial-level-2', { pause: true, suspend: true, deployItems: true });
  results.push({ label: second.label, outcome: second.outcome });
}

async function attribution() {
  assert.equal(tactical, true, 'Attribution continuation requires the tested input strategy');
  await initialPreparation('进入战前整备', ['M4A1', 'FLAMETHROWER', 'GOLDEN M249', 'TESLA COIL', 'AK-47']);
  const result = await runCombat('natural-unknown-clear', { attributionSource: 'unknown', attributionWeapon: 'flamethrower', maximumSeconds: 360 });
  const passed = result.outcome === 'LevelClearScene' && result.final.state.stats.killsBySource.unknown > 0;
  results.push({ label: result.label, outcome: result.outcome, passed, unknown: result.final.state.stats.killsBySource.unknown });
  await save('attribution-check.json', { passed, inputOnly: true, overrides: false, stats: result.final.state.stats, texts: result.texts });
}

async function bossTour() {
  assert.equal(tactical, true);
  const source = 'docs/execution/evidence/2026-10-08-scene-acceptance/campaign-r07/level-24-attempt-1-result.json';
  const earned = JSON.parse(readFileSync(source, 'utf8'));
  assert.equal(earned.outcome, 'LevelClearScene'); assert.equal(earned.inputOnly, true); assert.equal(earned.overrides, false);
  await save('boss-tour-scope.json', { importedSaveSource: source, importedLevels: earned.save.levels, overrides: ['仅复制已经自然获得的关卡许可至独立测试profile'], healthAmmoTimeOverrides: false, levelRoute: [2, 3, 5, 10], includesAllRegularWaves: true, intentionalHoldFire: true, phaseWaitLimitMs: 45000 });
  await initialPreparation();
  assert.deepEqual((await readSaves()).loadout, earned.save.loadout);
  await browser.tap('Escape');
  await browser.evaluate(`window.__ACCEPTANCE__.SaveManager.save(window.__ACCEPTANCE__.SAVE_KEYS.unlockedLevels, ${JSON.stringify(earned.save.levels)})`);
  await clickExact('HUDScene', '返回主页'); await waitScene('MainMenuScene');
  for (const level of [2, 3, 5, 10]) {
    const label = String(level).padStart(2, '0');
    for (let page = 0; page < 3 && !(await browser.texts('MainMenuScene')).some(entry => entry.text === label); page++) await clickExact('MainMenuScene', '‹ 上一页');
    await clickExact('MainMenuScene', label); await enterCampaignPreparation();
    await browser.tap('Enter'); await waitScene('GameScene');
    assert.equal((await inspect()).state.levelId, `level_${level}`);
    const run = await runCombat(`boss-level-${level}`, { bossMechanisms: true, maximumSeconds: 480 });
    const passed = run.outcome === 'LevelClearScene' && run.bossMechanisms.length === 1 && run.bossMechanisms[0].allPhaseAbilitiesObserved;
    results.push({ label: run.label, outcome: run.outcome, passed, bossMechanisms: run.bossMechanisms });
    const scene = run.final.active.find(name => ['LevelClearScene', 'GameOverScene'].includes(name));
    if (scene) await clickExact(scene, '返回主菜单');
    else await clickExact('HUDScene', '返回主页');
    await waitScene('MainMenuScene');
  }
  await save('boss-tour-result.json', { passed: results.every(result => result.passed), results, importedEarnedUnlocks: true, healthAmmoTimeOverrides: false });
}

async function frenzyRecords() {
  const before = await readSaves();
  const version = await browser.evaluate('window.__ACCEPTANCE__.FRENZY_VERSION');
  assert.ok(before.frenzyRecords[version]?.shotgun?.score > 0, 'Requires an actual earlier natural win');
  await clickExact('MainMenuScene', '狂潮挑战'); await waitScene('FrenzyPreparationScene');
  await browser.tap('Digit1'); await browser.screenshot('record-before-retry');
  await browser.tap('Enter'); await waitScene('GameScene');
  const fresh = await inspect();
  assert.equal(fresh.state.frenzy.recordEligible, true);
  assert.deepEqual(fresh.state.frenzy.targets, { ammo: 'alive', breach: 'alive', supply: 'alive' });
  assert.equal(fresh.state.frenzy.ammoUntilMs, 0); assert.equal(fresh.state.frenzy.breachUntilMs, 0);
  await save('record-natural-retry-fresh.json', fresh); await browser.screenshot('record-natural-retry-fresh');
  await browser.wait("window.__GAME__?.scene.isActive('FrenzyResultScene')", 'natural death without combat inputs', 120000);
  const death = await inspect();
  assert.equal(death.state.frenzy.phase, 'dead');
  assert.deepEqual((await readSaves()).frenzyRecords, before.frenzyRecords);
  await save('record-after-natural-death.json', { snapshot: death, saved: await readSaves(), texts: await browser.texts('FrenzyResultScene') });
  await browser.screenshot('record-after-natural-death');
  await browser.tap('Enter'); await waitScene('GameScene');
  const retry = await inspect();
  assert.equal(retry.state.frenzy.presetId, 'shotgun');
  assert.equal(retry.state.frenzy.kills, 0); assert.equal(retry.state.frenzy.ammoUntilMs, 0);
  await save('record-enter-retry.json', retry);
  await browser.tap('Escape'); await clickExact('HUDScene', '返回主页'); await waitScene('MainMenuScene');
  await browser.send('Page.reload', { ignoreCache: true }); await waitScene('MainMenuScene');
  const persisted = await browser.evaluate("(async () => { const { SaveManager, SAVE_KEYS } = await import('/src/systems/SaveManager.ts'); return SaveManager.load(SAVE_KEYS.frenzyRecords, {}); })()");
  assert.deepEqual(persisted, before.frenzyRecords);
  await save('record-persistence.json', { passed: true, inputOnly: true, intentionalNoInputDeath: true, before: before.frenzyRecords, afterReload: persisted });
  results.push({ label: 'natural-record-failure-retry-reload', passed: true });
}

async function endless() {
  await initialPreparation('无尽模式');
  const baseline = await readSaves();
  const result = await runCombat('endless-natural', { maximumSeconds: 1200, goalWave: 41, pause: true, pauseOverdrive: true, deployItems: true });
  results.push({ label: result.label, outcome: result.outcome, wave: result.final.state.wave, overdrives: result.overdrives.map(entry => entry.milestone) });
  assert.equal(result.final.state.mode, 'endless');
  assert.equal(result.final.state.frenzy, undefined);
  assert.deepEqual((await readSaves()).frenzyRecords, baseline.frenzyRecords);
  if (result.final.active.includes('GameOverScene')) await browser.clickText('GameOverScene', '返回主菜单');
  else await browser.clickText('HUDScene', '返回主页');
  await waitScene('MainMenuScene');
  await enterCampaignPreparation();
  await browser.tap('Enter'); await waitScene('GameScene');
  const level = await inspect();
  assert.equal(level.state.mode, 'level'); assert.equal(level.state.levelId, 'level_1');
  assert.equal(level.state.frenzy, undefined); assert.equal(level.state.player.endlessOverdrive, null);
  await save('returned-campaign-fresh.json', level);
  const campaignResult = await runCombat('returned-campaign-level-1', { maximumSeconds: 180, pause: true });
  results.push({ label: campaignResult.label, outcome: campaignResult.outcome, kills: campaignResult.final.state.stats.kills });
}

async function isolation() {
  await save('scope.json', { inputOnly: true, overrides: false, scope: '真实狂潮→无尽完整结算→首关完整结算→菜单重玩首关；合法六武器、自然伤害与用药，不改血量/掉率/库存/计时。' });
  const baseline = await readSaves();
  await clickExact('MainMenuScene', '狂潮挑战'); await waitScene('FrenzyPreparationScene');
  await browser.tap('Digit3'); await browser.tap('Enter'); await waitScene('GameScene');
  await browser.move('GameScene', 900, 350); await browser.fire(true); await sleep(120); await browser.fire(false);
  await browser.tap('KeyQ'); await browser.tap('KeyE');
  const frenzyState = await inspect();
  assert.ok(frenzyState.state.player.enhancements.length > 0);
  await save('frenzy-active.json', frenzyState);
  await browser.tap('Escape'); await clickExact('HUDScene', '返回主页'); await waitScene('MainMenuScene');
  assert.deepEqual(await readSaves(), baseline);
  await initialPreparation('无尽模式');
  const freshEndless = await inspect();
  assert.equal(freshEndless.state.frenzy, undefined);
  assert.deepEqual(freshEndless.state.player.enhancements, []);
  assert.equal(freshEndless.state.stats.kills, 0);
  await save('frenzy-to-endless-fresh.json', freshEndless);
  const endlessRun = await runCombat('isolation-endless', { maximumSeconds: 300, goalWave: 3, goalMilestones: [10], pause: true });
  results.push({ label: endlessRun.label, outcome: endlessRun.outcome });
  assert.equal(endlessRun.outcome, 'objective-reached');
  assert.ok(endlessRun.freezes.length > 0 && endlessRun.freezes.every(freeze => freeze.passed));
  await browser.tap('Escape');
  const deathDeadline = Date.now() + 120000;
  while (Date.now() < deathDeadline && !await browser.evaluate("window.__GAME__.scene.isActive('GameOverScene')")) {
    if (await browser.evaluate("window.__GAME__.scene.isActive('CardSelectionScene')")) await browser.tap('Digit1');
    await sleep(180);
  }
  await waitScene('GameOverScene', 1000);
  await save('isolation-endless-death.json', { snapshot: await inspect(), texts: await browser.texts('GameOverScene') });
  await browser.screenshot('isolation-endless-death');
  assert.deepEqual((await readSaves()).frenzyRecords, baseline.frenzyRecords);
  await clickExact('GameOverScene', '返回主菜单'); await waitScene('MainMenuScene');
  for (const view of [{ label: 'first-license-wide', width: 1920 }, { label: 'existing-license-narrow', width: 960 }]) {
    await browser.send('Emulation.setDeviceMetricsOverride', { width: view.width, height: 720, deviceScaleFactor: 1, mobile: false });
    await sleep(500);
    await clickExact('MainMenuScene', '01');
    await clickExact('MainMenuScene', '进入战前整备'); await waitScene('PreparationScene');
    await browser.tap('Enter'); await waitScene('GameScene');
    const freshLevel = await inspect();
    assert.equal(freshLevel.state.mode, 'level'); assert.equal(freshLevel.state.levelId, 'level_1');
    assert.equal(freshLevel.state.frenzy, undefined); assert.equal(freshLevel.state.player.endlessOverdrive, null);
    assert.deepEqual(freshLevel.state.player.enhancements, []); assert.equal(freshLevel.state.stats.kills, 0);
    assert.equal(freshLevel.state.player.owned.length, 6);
    await save(`${view.label}-fresh.json`, freshLevel);
    const run = await runCombat(view.label, { maximumSeconds: 300, pause: true, prepareRewardMedicine: true });
    const visible = run.captures.filter(capture => capture.visible === true).map(capture => capture.event.payload.title);
    const medicineNotice = visible.find(title => title.includes('SPAS-12') && title.includes('绷带'));
    const expectedLicense = view.label === 'first-license-wide';
    const weaponNotices = ['MP5', 'SPAS-12'].map(name => visible.find(title => title.includes(name)));
    const passed = run.outcome === 'LevelClearScene' && run.freezes.length > 0 && run.freezes.every(freeze => freeze.passed)
      && run.final.state.player.owned.length === 6 && weaponNotices.every(title => title?.includes('编队已满') && title.includes('许可解锁') === expectedLicense);
    await save(`${view.label}-checks.json`, { passed, outcome: run.outcome, weaponNotices, medicineNotice: medicineNotice ?? null, medicinePassed: Boolean(medicineNotice), freezes: run.freezes, stats: run.final.state.stats });
    results.push({ label: view.label, outcome: run.outcome, passed, medicinePassed: Boolean(medicineNotice) });
    assert.ok(passed, `${view.label}: full-loadout notices, pause and complete result`);
    await clickExact('LevelClearScene', '返回主菜单'); await waitScene('MainMenuScene');
  }
  await save('result.json', { passed: results.every(result => result.passed !== false), modeIsolation: true, inputOnly: true, fixtureOnly: false, results });
}

try {
  if (tactical) await save('combat-policy.json', { version: COMBAT_POLICY_VERSION, inputOnly: true, stateOverrides: false, effectiveWeapon: 'EnhancementManager.resolveWeaponDef', threats: '公开刚体、可见红圈、死亡爆炸/武器爆炸、240px技能落点和配置唯一标记目标', weapon: '正常数字键切枪、R换弹、真实就绪E技能', stop: '战役每关一局/20分钟；狂潮每预设一局；死亡或超时保留并停止该项，不重刷' });
  await save('baseline-save.json', await readSaves());
  if (suite === 'campaign') await campaign();
  else if (suite === 'frenzy') await frenzy();
  else if (suite === 'tutorial') await tutorial();
  else if (suite === 'attribution') await attribution();
  else if (suite === 'boss-tour') await bossTour();
  else if (suite === 'frenzy-records') await frenzyRecords();
  else if (suite === 'endless') await endless();
  else if (suite === 'isolation') await isolation();
  else throw new Error(`Unsupported suite: ${suite}`);
} catch (error) {
  process.exitCode = 1;
  await save('driver-failure.json', { message: error.message, stack: error.stack, snapshot: await inspect().catch(() => null) });
  try { await browser.screenshot('driver-failure'); } catch {}
  console.error(error);
} finally {
  await save('summary.json', { suite, results, errors: browser.errors, failedRequests: browser.failures });
  await session.close();
}
