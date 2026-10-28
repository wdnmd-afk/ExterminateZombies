import assert from 'node:assert/strict';
import { setTimeout as sleep } from 'node:timers/promises';
import { startAcceptanceSession } from './cdp-acceptance-session.mjs';

/**
 * 通道模式 V3/V4 实景驱动。
 *
 * 入口走真实主菜单 → 通道挑战 → 预设 → Enter；
 * 卡片伤害全部来自真实鼠标射击；只有「玩家定位」和「把僵尸移到突破线」是受控前置，
 * 且都会写进证据 JSON 的 bypass 字段。
 */
const runId = process.argv[2] ?? 'corridor-scene-r01';
const port = Number(process.argv[3] ?? 9357);
const session = await startAcceptanceSession(runId, port, { evidenceRoot: 'docs/execution/evidence/2026-10-28-corridor-scene' });
const { browser, save } = session;

const results = [];
const pass = (name, detail = {}) => { results.push({ name, passed: true, ...detail }); browser.log(name, detail); };

const snap = () => browser.evaluate('window.__CORRIDOR_FIXTURE__.snapshot()');
const waitScene = async (name, timeout = 60000) => {
  await browser.wait(`window.__GAME__?.scene.isActive(${JSON.stringify(name)})`, name, timeout);
  await sleep(180);
};
const running = state => state.corridor && state.corridor.phase === 'running';
const nearestZombie = state => state.zombies
  .filter(zombie => zombie.x > 150)
  .sort((first, second) => first.x - second.x)[0] ?? null;

/** 朝最近僵尸短促开火，避免等待期间自然漏怪。 */
async function defendOnce() {
  const state = await snap();
  if (!running(state)) return state;
  const target = nearestZombie(state);
  if (!target) return state;
  await browser.move('GameScene', target.x, target.y);
  await browser.fire(true);
  await sleep(200);
  await browser.fire(false);
  return state;
}

/** 带防守的等待：条件满足即返回，局结束或超时抛错。 */
async function waitFor(predicate, label, timeout = 45000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const state = await snap();
    if (predicate(state)) return state;
    if (state.corridor && state.corridor.phase !== 'running') {
      throw new Error(`${label}: 本局已结束 phase=${state.corridor.phase}`);
    }
    await defendOnce();
    await sleep(140);
  }
  throw new Error(`等待超时：${label}`);
}

/** 清掉贴近突破线的僵尸，为「停火观察队友」腾出安全窗口。 */
async function clearDanger(threshold = 600) {
  const deadline = Date.now() + 12000;
  while (Date.now() < deadline) {
    const state = await snap();
    if (!running(state)) return state;
    const danger = state.zombies.filter(zombie => zombie.x < threshold).sort((first, second) => first.x - second.x)[0];
    if (!danger) return state;
    await browser.move('GameScene', danger.x, danger.y);
    await browser.fire(true);
    await sleep(320);
    await browser.fire(false);
    await sleep(120);
  }
  return snap();
}

/** 击破指定通道的漂移卡：真实瞄准 + 真实开火，必要时先处理近身僵尸。 */
async function killCard(kind) {
  const waiting = await waitFor(state => state.cards.some(card => card.kind === kind), `${kind} 卡进场`, 45000);
  const card = waiting.cards.find(entry => entry.kind === kind);
  await browser.evaluate(`window.__CORRIDOR_FIXTURE__.parkPlayer(120, ${card.y})`);
  await browser.screenshot(`${kind}-card-incoming`);
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    const state = await snap();
    if (!running(state)) throw new Error(`击破 ${kind} 卡时本局已结束`);
    if (!state.cards.some(entry => entry.kind === kind)) {
      await browser.fire(false);
      return { before: waiting, after: state };
    }
    const danger = state.zombies.filter(zombie => zombie.x < 420).sort((first, second) => first.x - second.x)[0];
    if (danger) {
      await browser.move('GameScene', danger.x, danger.y);
      await browser.fire(true);
      await sleep(420);
      await browser.fire(false);
    }
    const live = state.cards.find(entry => entry.kind === kind);
    await browser.move('GameScene', live.x, live.y);
    await browser.fire(true);
    await sleep(240);
    await browser.fire(false);
    await sleep(110);
  }
  throw new Error(`击破 ${kind} 卡超时`);
}

try {
  await save('fixture-scope.json', {
    scope: '真实主菜单/预设页/Enter 进入生产 GameScene；卡片伤害全部来自真实鼠标射击。受控前置仅两类：玩家瞬移定位、把一只自然僵尸移到突破线内。不证明自然漏怪、完整自然对局、难度或真人手感。',
    preset: 'rifle（预设 3）：自动武器便于连续真实射击与防守；结尾另验预设 1 可正常进入。',
  });

  // —— 入口：真实主菜单按钮 → 预设页 → 预设 3 → Enter ——
  await browser.clickText('MainMenuScene', '通道挑战');
  await waitScene('CorridorPreparationScene');
  const preparation = await browser.texts('CorridorPreparationScene');
  await save('preparation-texts.json', preparation);
  assert.ok(preparation.some(entry => entry.text.includes('通道模式')), '预设页缺少标题');
  assert.ok(preparation.some(entry => entry.text.includes('精准守门')), '预设页缺少预设 1');
  assert.ok(preparation.some(entry => entry.text.includes('霰弹封廊')), '预设页缺少预设 2');
  assert.ok(preparation.some(entry => entry.text.includes('穿透封锁')), '预设页缺少预设 3');
  await browser.screenshot('preparation');
  await browser.tap('Digit3');
  await browser.tap('Enter');
  await waitScene('GameScene');

  await browser.evaluate("(async () => { const { attachCorridorFixture } = await import('/scripts/cdp-corridor-fixture.mjs'); return attachCorridorFixture(window.__GAME__); })()");
  const initial = await snap();
  await save('initial.json', initial);
  await browser.screenshot('initial');
  assert.equal(initial.mode, 'corridor', '进入后必须是 corridor 模式');
  assert.equal(initial.corridor.presetId, 'rifle', '预设 3 应传入 GameScene');
  assert.equal(initial.corridor.phase, 'running');
  assert.ok(initial.status, '缺少 HUD 通道读数 getCorridorStatus');
  assert.ok(initial.player.x >= 96 && initial.player.x <= 240, `玩家柱位越界：${initial.player.x}`);
  assert.equal(initial.lanes.breach, 72);
  pass('entry-and-preset', { preset: initial.corridor.presetId, player: initial.player, lanes: initial.lanes });

  // —— 柱位钳制：按住 A 采样，每帧会被拉回柱位，且绝不进入突破判距带 ——
  // 已知现象：低帧率下物理补步发生在场景 update 之后，渲染位置会在 96 与 ~84 之间抖动；
  // 这里断言的是设计不变量（不越过突破线 72、能回到柱位），不是「恒等于 96」。
  const columnSamples = [];
  await browser.key('KeyA', true);
  for (let index = 0; index < 12; index += 1) {
    const state = await snap();
    columnSamples.push({ frame: state.frame, x: state.player.x, bodyX: state.player.bodyX, velocityX: state.player.velocityX, fps: state.fps });
    await sleep(120);
  }
  await browser.key('KeyA', false);
  await sleep(120);
  const clamped = await snap();
  columnSamples.push({ frame: clamped.frame, x: clamped.player.x, bodyX: clamped.player.bodyX, released: true });
  const measured = columnSamples.map(sample => sample.x);
  await save('column-clamp.json', { samples: columnSamples, min: Math.min(...measured), max: Math.max(...measured) });
  assert.ok(Math.max(...measured) >= 96, `柱位从未回到钳制线：max x=${Math.max(...measured)}`);
  assert.ok(Math.min(...measured) > 72, `玩家进入了突破判距带：min x=${Math.min(...measured)}`);
  pass('column-clamp', { min: Math.min(...measured), max: Math.max(...measured), transientOvershoot: Math.min(...measured) < 96 });

  // —— 主通道行军带：自然刷出的僵尸 y 必须落在主通道 ——
  const spawned = await waitFor(state => state.zombies.length > 0, '等待自然僵尸', 15000);
  await save('spawn-band.json', spawned);
  await browser.screenshot('spawn-band');
  for (const zombie of spawned.zombies) {
    assert.ok(zombie.y >= 290 && zombie.y <= 430, `僵尸越出主通道：${zombie.id} y=${zombie.y}`);
  }
  assert.ok(spawned.zombies.every(zombie => zombie.x > 240), '僵尸不应出生在玩家柱位');
  pass('spawn-band', { zombies: spawned.zombies });

  // —— 道具卡：首张 projectile 卡，真实射穿 ——
  const projectile = await killCard('projectile');
  const afterProjectile = projectile.after;
  await browser.screenshot('projectile-broken');
  await save('projectile-broken.json', { before: projectile.before, after: afterProjectile });
  assert.equal(afterProjectile.corridor.bonusProjectiles, 1, '击破弹道卡应 +1 弹');
  assert.equal(afterProjectile.corridor.cardKills, 1, '卡片击破计数应为 1');
  assert.equal(afterProjectile.corridor.phase, 'running', '击破卡片不得暂停/结束本局');
  assert.equal(afterProjectile.diagnostics.pauseReason, null, '卡片结算必须当帧生效且不暂停');
  assert.ok(afterProjectile.score >= 150, `击破卡片得分未入账：${afterProjectile.score}`);
  assert.ok(afterProjectile.records > 0, '没有收到击破 Toast 事件');
  pass('projectile-card', {
    bonusProjectiles: afterProjectile.corridor.bonusProjectiles,
    cardKills: afterProjectile.corridor.cardKills,
    score: afterProjectile.score,
    pauseReason: afterProjectile.diagnostics.pauseReason,
  });

  // —— 队友卡：召唤后停火，观察队友自动开火并命中 ——
  const ally = await killCard('ally');
  const afterAlly = ally.after;
  await browser.screenshot('ally-summoned');
  await save('ally-summoned.json', { before: ally.before, after: afterAlly });
  assert.equal(afterAlly.corridor.alliesSummoned, 1, '击破队友卡应召唤 1 名队友');
  assert.equal(afterAlly.status.allies, 1, 'HUD 读数应显示 1 名队友');
  assert.equal(afterAlly.corridor.phase, 'running');

  await clearDanger(700);
  await browser.evaluate('window.__CORRIDOR_FIXTURE__.resetAllySamples()');
  await browser.evaluate('window.__CORRIDOR_FIXTURE__.parkPlayer(120, 120)');
  const silentBefore = await snap();
  const killsBefore = silentBefore.stats?.kills ?? null;
  const healthBefore = new Map(silentBefore.zombies.map(zombie => [zombie.token, zombie.health]));
  // 停火观察：玩家不输入，任何血量下降或击杀增量都只能来自队友。
  const allyDeadline = Date.now() + 18000;
  let allyObserved = null;
  while (Date.now() < allyDeadline) {
    const state = await snap();
    if (!running(state)) throw new Error(`观察队友时本局已结束 phase=${state.corridor.phase}`);
    const report = await browser.evaluate('window.__CORRIDOR_FIXTURE__.report()');
    // 用生命周期 token 对齐同一只僵尸，避免把「进场前就被玩家打残的怪」误判成队友命中。
    const damaged = state.zombies.some(zombie => healthBefore.has(zombie.token) && zombie.health < healthBefore.get(zombie.token));
    const killsUp = killsBefore !== null && state.stats?.kills > killsBefore;
    const inRange = state.zombies.some(zombie => Math.hypot(zombie.x - 108, zombie.y - 600) <= 1050);
    if (report.allyBullets.length > 0 && (damaged || killsUp)) {
      allyObserved = { state, allyBullets: report.allyBullets.length, damaged, killsUp, inRange };
      break;
    }
    await sleep(400);
  }
  await browser.fire(false);
  assert.ok(allyObserved, '停火 18 秒内没有观察到队友弹道命中');
  const silentAfter = allyObserved.state;
  const allyReport = await browser.evaluate('window.__CORRIDOR_FIXTURE__.report()');
  await save('ally-autofire.json', { before: silentBefore, after: silentAfter, observed: allyObserved, allyBullets: allyReport.allyBullets.slice(0, 40) });
  await browser.screenshot('ally-autofire');
  assert.ok(allyReport.allyBullets.length > 0, '停火期间没有观察到队友弹道');
  assert.ok(allyObserved.damaged || allyObserved.killsUp, '队友弹道没有造成伤害');
  pass('ally-autofire', {
    playerBulletsSuppressed: true,
    allyBullets: allyReport.allyBullets.length,
    targetInAllyRange: allyObserved.inRange,
    damaged: allyObserved.damaged,
    killsBefore,
    killsAfter: silentAfter.stats?.kills,
  });

  // —— 突破终局：把一只自然僵尸移到突破线内 ——
  const pauseBeforeBreach = await snap();
  const breach = await browser.evaluate('window.__CORRIDOR_FIXTURE__.breach()');
  await waitScene('CorridorResultScene', 15000);
  await sleep(400);
  const result = await snap();
  const texts = await browser.texts('CorridorResultScene');
  await browser.screenshot('result-breach');
  const saved = await browser.evaluate("(async () => { const { SaveManager, SAVE_KEYS } = await import('/src/systems/SaveManager.ts'); return SaveManager.load(SAVE_KEYS.corridorRecords, {}); })()");
  await save('result-breach.json', { pauseBeforeBreach, breach, result, texts, records: saved });
  assert.equal(result.corridor.phase, 'breached', '突破应把 run 置为 breached');
  assert.equal(result.mode, 'corridor');
  assert.ok(texts.some(entry => entry.text.includes('通道失守')), '结算页标题应为通道失守');
  const laneRecords = saved['lane-v1'] ?? {};
  assert.ok(laneRecords.rifle, '通道纪录未写盘');
  assert.equal(laneRecords.rifle.score, result.score, '纪录分数应等于本局总分');
  assert.ok(laneRecords.rifle.elapsedMs > 0, '纪录缺少存活时长');
  pass('breach-result-record', {
    phase: result.corridor.phase,
    score: result.score,
    elapsedMs: result.corridor.elapsedMs,
    record: laneRecords.rifle,
    cardKills: result.corridor.cardKills,
    allies: result.corridor.alliesSummoned,
  });

  // —— 预设 1 入口回归：换预设 → 预设 1 → Enter ——
  await browser.clickText('CorridorResultScene', '更换预设');
  await waitScene('CorridorPreparationScene');
  await browser.tap('Digit1');
  await browser.tap('Enter');
  await waitScene('GameScene');
  const pistol = await browser.evaluate("(() => { const scene = window.__GAME__.scene.getScene('GameScene'); const state = scene.getState(); return { mode: state.mode, presetId: state.corridor?.presetId ?? null, status: scene.getCorridorStatus() }; })()");
  await save('preset-1-entry.json', pistol);
  await browser.screenshot('preset-1-entry');
  assert.equal(pistol.mode, 'corridor');
  assert.equal(pistol.presetId, 'pistol', '预设 1 应传入 pistol');
  assert.ok(pistol.status, '预设 1 缺少 HUD 读数');
  pass('preset-1-entry', pistol);

  assert.equal(browser.errors.length, 0, `浏览器异常：${JSON.stringify(browser.errors.slice(0, 3))}`);
  assert.equal(browser.failures.length, 0, `失败请求：${JSON.stringify(browser.failures.slice(0, 3))}`);
  await save('result.json', {
    passed: true,
    results,
    excluded: ['自然漏怪终局（本次为受控瞬移）', '完整自然对局与难度手感', '真人 V6', '目标设备性能'],
  });
} catch (error) {
  process.exitCode = 1;
  await save('failure.json', {
    message: error.message,
    stack: error.stack,
    results,
    snapshot: await snap().catch(() => null),
    fixture: await browser.evaluate('window.__CORRIDOR_FIXTURE__?.report()').catch(() => null),
    errors: browser.errors,
    failedRequests: browser.failures,
  });
  await browser.screenshot('failure').catch(() => {});
  console.error(error);
} finally {
  await session.close();
}
