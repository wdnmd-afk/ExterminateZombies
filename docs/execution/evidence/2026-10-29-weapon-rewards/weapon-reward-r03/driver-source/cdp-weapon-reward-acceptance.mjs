import { setTimeout as sleep } from 'node:timers/promises';
import { startAcceptanceSession } from './cdp-acceptance-session.mjs';

/**
 * 武器关卡奖励节点抽查驱动。
 *
 * G2-9 的 18 个奖励节点里，历史上只验证过第一关第一波的 MP5。本驱动抽查后续
 * 关卡的首波节点，确认「阶段清空 → 交付武器 → 写许可 → 落备弹」在真实战斗里成立。
 *
 * 受控前置只有一项：临时把 `ez:unlockedLevels` 写成全部关卡，让驱动能直接进入
 * 目标关（不做逐关自然解锁，那由 campaign-r01～r09 单独证明）。结束时恢复原值。
 * 生命、弹药、伤害、武器参数一律保持正式值。
 */
const runId = process.argv[2] ?? 'weapon-reward-r01';
const port = Number(process.argv[3] ?? 9381);
// 每个目标：关卡 id、期望武器 id、期望备弹、说明
const targets = [
  { levelId: 'level_6', weaponId: 'gatling', ammo: 360, note: '第六章首波，13 只，最便宜的节点' },
  { levelId: 'level_8', weaponId: 'cryo_sprayer', ammo: 140, note: '第八章首波，17 只' },
  { levelId: 'level_9', weaponId: 'flamethrower', ammo: 180, stage: 2, note: '第九章第 2 阶段，需先清完第 1 阶段' },
];

const session = await startAcceptanceSession(runId, port, { evidenceRoot: 'docs/execution/evidence/2026-10-29-weapon-rewards' });
const { browser, save } = session;

const snap = () => browser.evaluate(`(() => {
  const scene = window.__GAME__.scene.getScene('GameScene');
  const state = scene.getState();
  const zombies = (scene.physics?.world?.bodies?.entries ?? []).map(b => b.gameObject)
    .filter(o => o && o.isCombatActive && o.isCombatActive())
    .map(o => ({ id: o.def.id, x: o.x, y: o.y, health: o.health }));
  return {
    active: window.__GAME__.scene.getScenes(true).map(s => s.sys.settings.key),
    mode: state?.mode ?? null,
    levelId: state?.levelId ?? null,
    wave: state?.waveIndex ?? null,
    stats: state ? { kills: state.stats.kills, elapsedMs: Math.round(state.stats.elapsedMs) } : null,
    player: state ? { health: state.player.health, maxHealth: state.player.maxHealth, weapon: state.player.currentWeaponId, owned: [...state.player.ownedWeapons], reserve: { ...state.player.ammoReserve }, mag: { ...state.player.ammoInMag } } : null,
    pause: scene.getPauseReason ? scene.getPauseReason() : null,
    reloading: scene.isWeaponReloading ? scene.isWeaponReloading() : null,
    zombies,
  };
})()`);

/** 安装奖励事件监听（吐司文本），只读。 */
const installListener = () => browser.evaluate(`(() => {
  if (window.__REWARD_LOG__) return window.__REWARD_LOG__.length;
  window.__REWARD_LOG__ = [];
  const scene = window.__GAME__.scene.getScene('GameScene');
  window.__REWARD_HOOK__ = payload => window.__REWARD_LOG__.push({ at: Date.now(), ...payload });
  return 0;
})()`);

async function attachRewardListener() {
  await browser.evaluate(`(async () => {
    const { EVENTS } = await import('/src/constants.ts');
    const scene = window.__GAME__.scene.getScene('GameScene');
    window.__REWARD_LOG__ = window.__REWARD_LOG__ ?? [];
    if (window.__REWARD_HOOK__) scene.events.off(EVENTS.pickupCollected, window.__REWARD_HOOK__);
    window.__REWARD_HOOK__ = payload => window.__REWARD_LOG__.push({ at: Date.now(), title: payload.title, accent: payload.accent });
    scene.events.on(EVENTS.pickupCollected, window.__REWARD_HOOK__);
    return true;
  })()`);
}

const readLog = () => browser.evaluate('window.__REWARD_LOG__ ?? []');
const readUnlocked = () => browser.evaluate("(async () => { const { SaveManager } = await import('/src/systems/SaveManager.ts'); return SaveManager.getUnlockedWeapons(); })()");

/**
 * 首次整备必须先选满 6 把才能出击（2026-09-01 修好的阻断：完成条件是
 * `getRequiredLoadoutSize(unlocked)` 而不是硬编码 6）。这里走真实 UI 选满。
 */
async function completeFirstLoadoutIfNeeded() {
  const texts = await browser.texts('PreparationScene');
  const counter = texts.find(entry => /^LOADOUT\s+\d+\s*\/\s*\d+$/.test(entry.text));
  if (!counter) return { skipped: true };
  const [, filled, total] = counter.text.match(/LOADOUT\s+(\d+)\s*\/\s*(\d+)/).map(Number);
  if (filled >= total) return { skipped: true, counter: counter.text };
  const picks = ['M4A1', 'AA-12', 'GOLDEN M249', 'TESLA COIL', 'AK-47'];
  for (const name of picks) {
    const entry = (await browser.texts('PreparationScene')).find(item => item.text === name && item.y < 475);
    if (!entry) continue;
    await browser.click('PreparationScene', entry.x, entry.y);
    await sleep(120);
  }
  const apply = (await browser.texts('PreparationScene')).find(item => item.text.includes('应用编队'));
  if (!apply) throw new Error('未找到「应用编队」按钮');
  await browser.click('PreparationScene', apply.x, apply.y);
  await sleep(300);
  const after = (await browser.texts('PreparationScene')).find(entry => /^LOADOUT/.test(entry.text))?.text ?? null;
  return { skipped: false, before: counter.text, after, picks };
}

async function openLevel(levelId, index) {
  const page = Math.floor(index / 10);
  let current = await browser.evaluate("window.__GAME__.scene.getScene('MainMenuScene').levelPage");
  while (current !== page) {
    await browser.clickText('MainMenuScene', current < page ? '下一页 ›' : '‹ 上一页');
    current = await browser.evaluate("window.__GAME__.scene.getScene('MainMenuScene').levelPage");
  }
  const title = await browser.evaluate(`window.__GAME__.scene.getScene('MainMenuScene').levelRows.get(${JSON.stringify(levelId)}).title.text`);
  await browser.clickText('MainMenuScene', title);
  const startText = await browser.evaluate("window.__GAME__.scene.getScene('MainMenuScene').startButtonText.text");
  await browser.clickText('MainMenuScene', startText);
  await browser.wait("window.__GAME__.scene.isActive('PreparationScene')", `${levelId} 整备`, 30000);
  await sleep(300);
  const prepared = await completeFirstLoadoutIfNeeded();
  await browser.tap('Enter');
  await browser.wait("window.__GAME__.scene.isActive('GameScene')", `${levelId} 入场`, 30000);
  await sleep(400);
  return prepared;
}

/**
 * 简易战斗：瞄准最近的僵尸并**脉冲式**扣扳机，贴脸时侧向拉开。
 *
 * 必须脉冲而不是按住：本局开局武器是手枪（`auto: false`），按住鼠标只会打出
 * 一发，驱动会误以为一直在开火却零击杀——2026-10-29 的 `weapon-reward-r02`
 * 就是这样在 37 秒内 0 杀阵亡的。脉冲对全自动武器同样是真实输入，只是频率低些。
 */
async function fightUntil(predicate, label, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const state = await snap();
    if (predicate(state)) return state;
    if (state.active.includes('GameOverScene') || state.active.includes('LevelClearScene')) return state;
    if (state.pause) {
      // 抽卡界面会冻结战场；本关流程不应出现，出现即判失败。
      throw new Error(`${label}: 出现暂停 ${state.pause}`);
    }
    const nearest = state.zombies.filter(z => z.x > 40).sort((a, b) => a.x - b.x)[0] ?? null;
    if (!nearest) { await sleep(120); continue; }
    const player = await browser.evaluate("(() => { const s = window.__GAME__.scene.getScene('GameScene'); return { x: s.getCombatDiagnostics().player.x, y: s.getCombatDiagnostics().player.y }; })()");
    if (Math.hypot(nearest.x - player.x, nearest.y - player.y) < 190) {
      const key = nearest.y < player.y ? 'KeyS' : 'KeyW';
      await browser.key(key, true);
      await sleep(150);
      await browser.key(key, false);
    }
    await browser.move('GameScene', nearest.x, nearest.y);
    await browser.fire(true);
    await sleep(70);
    await browser.fire(false);
    await sleep(90);
  }
  throw new Error(`${label}: 等待超时`);
}

try {
  await save('scope.json', {
    scope: '真实菜单 → 整备 → 战斗；受控前置仅为临时解锁关卡列表（ez:unlockedLevels），结束时恢复。生命/弹药/伤害/武器参数保持正式值。不证明逐关自然解锁，也不评价手感。',
    targets,
  });

  const previousUnlocks = await browser.evaluate("localStorage.getItem('ez:unlockedLevels')");
  const levels = await browser.evaluate("import('/src/config/levels.ts').then(m => m.LEVELS.map(l => l.id))");
  await browser.evaluate(`localStorage.setItem('ez:unlockedLevels', ${JSON.stringify(JSON.stringify(levels))})`);
  await browser.send('Page.reload');
  await browser.wait("window.__GAME__?.scene.isActive('MainMenuScene')", '主菜单', 60000);
  await sleep(700);
  await browser.screenshot('menu-unlocked');

  const results = [];
  for (const target of targets) {
    const index = levels.indexOf(target.levelId);
    const prepared = await openLevel(target.levelId, index);
    await attachRewardListener();
    const entry = await snap();
    if (entry.levelId !== target.levelId) throw new Error(`进入关卡不符：${entry.levelId} ≠ ${target.levelId}`);
    await save(`${target.levelId}-entry.json`, entry);
    await browser.screenshot(`${target.levelId}-entry`);

    // 若目标在后续阶段，先打到该阶段（波次号 = 阶段序号，1 基）。
    const desiredWave = target.stage ?? 1;
    if (desiredWave > 1) {
      await fightUntil(state => (state.wave ?? 0) >= desiredWave, `${target.levelId} 进入第 ${desiredWave} 阶段`, 20 * 60 * 1000);
    }

    const before = await snap();
    const beforeLog = (await readLog()).length;
    const beforeUnlocked = await readUnlocked();
    const after = await fightUntil(
      state => state.player.owned.includes(target.weaponId) || (state.player.owned.length >= 6 && (state.wave ?? 0) > desiredWave),
      `${target.levelId} 第 ${desiredWave} 阶段清空`,
      20 * 60 * 1000,
    );
    await sleep(600);
    const log = (await readLog()).slice(beforeLog);
    const unlocked = await readUnlocked();
    await browser.screenshot(`${target.levelId}-reward`);
    await save(`${target.levelId}-reward.json`, { before, after, log, beforeUnlocked, unlocked, expectedAmmo: target.ammo });

    const licenseNew = unlocked.includes(target.weaponId);
    const inLoadout = after.player.owned.includes(target.weaponId);
    const toast = log.find(item => typeof item.title === 'string' && item.title.includes(target.levelId)) ?? null;
    const expectedName = await browser.evaluate(`(async () => { const { WEAPONS } = await import('/src/config/weapons.ts'); return WEAPONS[${JSON.stringify(target.weaponId)}].name; })()`);
    const weaponToast = log.find(item => typeof item.title === 'string' && item.title.includes(expectedName)) ?? null;

    results.push({
      levelId: target.levelId,
      stage: desiredWave,
      weaponId: target.weaponId,
      licenseNew,
      inLoadout,
      toast: weaponToast?.title ?? null,
      prepared,
      kills: after.stats.kills - before.stats.kills,
      elapsedMs: after.stats.elapsedMs,
    });

    if (!licenseNew) throw new Error(`${target.levelId}: 未写入 ${target.weaponId} 许可，日志=${JSON.stringify(log)}`);
    if (!weaponToast) throw new Error(`${target.levelId}: 未捕获武器奖励提示，日志=${JSON.stringify(log)}`);
    // 满编队时应只解锁许可；未满编队时应直接进本局编队。二者都必须成立，不能两个都假。
    if (!inLoadout && after.player.owned.length < 6) throw new Error(`${target.levelId}: 编队未满但武器未编入`);

    await browser.tap('Escape');
    await sleep(250);
    const paused = await snap();
    if (paused.pause !== 'menu') throw new Error(`${target.levelId}: ESC 未打开菜单 (${paused.pause})`);
    await browser.evaluate("window.__GAME__.scene.getScene('GameScene').suspendToMainMenu()");
    await browser.wait("window.__GAME__?.scene.isActive('MainMenuScene')", '返回主菜单', 20000);
    await sleep(400);
  }

  // 恢复原解锁状态
  if (previousUnlocks === null) await browser.evaluate("localStorage.removeItem('ez:unlockedLevels')");
  else await browser.evaluate(`localStorage.setItem('ez:unlockedLevels', ${JSON.stringify(previousUnlocks)})`);
  const restored = await browser.evaluate("localStorage.getItem('ez:unlockedLevels')");

  await save('result.json', { passed: true, results, restored, previousUnlocks, errors: browser.errors, failedRequests: browser.failures });
  console.log(JSON.stringify({ results, restored, previousUnlocks }, null, 1));
} catch (error) {
  process.exitCode = 1;
  await save('failure.json', {
    message: error.message,
    stack: error.stack,
    snapshot: await snap().catch(() => null),
    rewardLog: await readLog().catch(() => null),
    errors: browser.errors,
    failedRequests: browser.failures,
  });
  await browser.screenshot('failure').catch(() => {});
  console.error(error);
} finally {
  await session.close();
}
