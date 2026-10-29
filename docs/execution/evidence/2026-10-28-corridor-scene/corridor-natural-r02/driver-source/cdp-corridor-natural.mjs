import { setTimeout as sleep } from 'node:timers/promises';
import { startAcceptanceSession } from './cdp-acceptance-session.mjs';

/**
 * 通道模式 V5 自然对局驱动。
 *
 * 与 `cdp-corridor-acceptance.mjs` 的区别：这里**不做任何受控前置**——
 * 不瞬移玩家、不瞬移僵尸、不削血量、不直接改状态；只有真实键鼠输入。
 * 玩法策略：优先打漂移卡（收益高于清杂兵），否则打最近的主通道僵尸，
 * 被贴脸时上下拉开距离。局终由 naturally 突破或阵亡触发。
 */
const runId = process.argv[2] ?? 'corridor-natural-r01';
const port = Number(process.argv[3] ?? 9371);
const maxSeconds = Number(process.argv[4] ?? 300);
const session = await startAcceptanceSession(runId, port, { evidenceRoot: 'docs/execution/evidence/2026-10-28-corridor-scene' });
const { browser, save } = session;

const snap = () => browser.evaluate('window.__CORRIDOR_FIXTURE__.snapshot()');
const running = state => state.corridor && state.corridor.phase === 'running';
const distance = (first, second) => Math.hypot(first.x - second.x, first.y - second.y);

const samples = [];
const phaseLog = [];
const cardLog = [];
let lastScore = 0;
let lastCardKills = 0;
const keys = { KeyW: false, KeyS: false };

async function setKey(code, down) {
  if (keys[code] === down) return;
  keys[code] = down;
  await browser.key(code, down);
}

try {
  await save('scope.json', {
    scope: '真实主菜单 → 通道挑战 → 预设 3 → Enter，全程零受控前置：不瞬移、不削血、不改状态。策略为真实键鼠输入（优先打漂移卡，其次打最近主通道僵尸，被贴脸时上下拉开）。',
    natural: true,
    maxSeconds,
  });

  await browser.clickText('MainMenuScene', '通道挑战');
  await browser.wait("window.__GAME__.scene.isActive('CorridorPreparationScene')", '预设页', 30000);
  await browser.tap('Digit3');
  await browser.tap('Enter');
  await browser.wait("window.__GAME__.scene.isActive('GameScene')", '战场', 30000);
  await browser.evaluate("(async () => { const { attachCorridorFixture } = await import('/scripts/cdp-corridor-fixture.mjs'); return attachCorridorFixture(window.__GAME__); })()");
  await sleep(400);

  const startedAt = Date.now();
  let lastSampleAt = 0;
  let lastScreenshotSecond = 0;
  let firing = false;
  let unexpectedPause = null;

  while (Date.now() - startedAt < maxSeconds * 1000) {
    const state = await snap();
    if (!running(state)) break;
    // 通道模式承诺「不暂停」：一旦出现抽卡/暂停画面，这一局即判为缺陷复现并立即止损。
    if (state.active.includes('CardSelectionScene') || state.diagnostics?.pauseReason) {
      unexpectedPause = { at: Math.round(state.corridor.elapsedMs), active: state.active, pauseReason: state.diagnostics?.pauseReason ?? null };
      await browser.screenshot('natural-unexpected-pause');
      throw new Error(`通道模式意外暂停：${JSON.stringify(unexpectedPause)}`);
    }

    if (state.corridor.phase && !phaseLog.some(entry => entry.index === state.status.phaseIndex)) {
      phaseLog.push({ index: state.status.phaseIndex, name: state.status.phaseName, elapsedMs: Math.round(state.corridor.elapsedMs) });
    }
    if (state.corridor.cardKills > lastCardKills) {
      cardLog.push({ at: Math.round(state.corridor.elapsedMs), cardKills: state.corridor.cardKills, bonusProjectiles: state.corridor.bonusProjectiles, damageStacks: state.corridor.damageStacks, allies: state.corridor.alliesSummoned, score: state.score });
      lastCardKills = state.corridor.cardKills;
    }
    lastScore = state.score;

    // —— 目标选择：卡优先 ——
    const cards = state.cards.filter(card => card.x > 10 && card.x < 1300);
    const zombies = state.zombies.filter(zombie => zombie.x > 150);
    const nearestZombie = zombies.sort((first, second) => first.x - second.x)[0] ?? null;
    let aim = null;
    if (cards.length > 0) {
      // 卡片 x 越小越接近消失，优先打最左的（时间窗口最短）。
      aim = cards.sort((first, second) => first.x - second.x)[0];
    } else if (nearestZombie) aim = nearestZombie;

    // 提前量：主通道僵尸直线向左，按弹速粗略补偿。
    if (aim) {
      const lead = aim.vx ? aim.x + aim.vx * 0.08 : aim.x;
      await browser.move('GameScene', lead, aim.y);
    }

    // —— 走位：被贴脸就上下拉开，否则回中线上半段避险 ——
    const threat = state.zombies.filter(zombie => distance({ x: zombie.x, y: zombie.y }, state.player) < 200)
      .sort((first, second) => distance(first, state.player) - distance(second, state.player))[0] ?? null;
    if (threat) {
      const away = threat.y < state.player.y ? 'KeyS' : 'KeyW';
      await setKey(away === 'KeyW' ? 'KeyS' : 'KeyW', false);
      await setKey(away, true);
    } else {
      await setKey('KeyW', false);
      await setKey('KeyS', false);
    }

    if (aim && !firing) { await browser.fire(true); firing = true; }
    if (!aim && firing) { await browser.fire(false); firing = false; }

    const now = Date.now();
    if (now - lastSampleAt >= 1000) {
      lastSampleAt = now;
      samples.push({
        at: Math.round(state.corridor.elapsedMs),
        fps: Math.round(state.fps),
        phase: state.status.phaseIndex,
        score: state.score,
        kills: state.stats.kills,
        health: state.player.health,
        enemies: state.zombies.length,
        cards: state.cards.length,
        bonusProjectiles: state.corridor.bonusProjectiles,
        damageStacks: state.corridor.damageStacks,
        allies: state.corridor.alliesSummoned,
        playerY: Math.round(state.player.y),
        nearestZombieX: nearestZombie ? nearestZombie.x : null,
      });
    }
    const second = Math.floor((Date.now() - startedAt) / 1000);
    if (second > 0 && second % 30 === 0 && second !== lastScreenshotSecond) {
      lastScreenshotSecond = second;
      await browser.screenshot(`natural-t${String(second).padStart(3, '0')}`);
    }
    await sleep(90);
  }

  if (firing) await browser.fire(false);
  await setKey('KeyW', false);
  await setKey('KeyS', false);

  const last = await snap();
  const ended = !running(last);
  if (ended) {
    await browser.wait("window.__GAME__.scene.isActive('CorridorResultScene')", '结算页', 15000);
    await sleep(400);
  }
  const texts = ended ? await browser.texts('CorridorResultScene') : [];
  const records = await browser.evaluate("(async () => { const { SaveManager, SAVE_KEYS } = await import('/src/systems/SaveManager.ts'); return SaveManager.load(SAVE_KEYS.corridorRecords, {}); })()");
  if (ended) await browser.screenshot('natural-result');

  const summary = {
    natural: true,
    ended,
    endReason: ended ? last.corridor.phase : 'time-cap',
    elapsedMs: Math.round(last.corridor.elapsedMs),
    score: last.score,
    kills: last.stats.kills,
    health: last.player.health,
    cardKills: last.corridor.cardKills,
    cardScore: last.corridor.cardScore,
    bonusProjectiles: last.corridor.bonusProjectiles,
    damageStacks: last.corridor.damageStacks,
    allies: last.corridor.alliesSummoned,
    phases: phaseLog,
    cardMoments: cardLog,
    samples,
    records,
    resultTexts: texts.map(entry => entry.text),
  };
  await save('natural-summary.json', summary);
  console.log(JSON.stringify({ ...summary, samples: undefined, resultTexts: undefined }, null, 1));
} catch (error) {
  process.exitCode = 1;
  await save('natural-failure.json', { message: error.message, stack: error.stack, samples, phaseLog, cardLog, lastScore });
  await browser.screenshot('natural-failure').catch(() => {});
  console.error(error);
} finally {
  await session.close();
}
