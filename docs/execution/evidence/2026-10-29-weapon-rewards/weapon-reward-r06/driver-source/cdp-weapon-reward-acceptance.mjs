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
  const active = window.__GAME__.scene.getScenes(true).map(s => s.sys.settings.key);
  const state = active.includes('GameScene') && scene.getState ? scene.getState() : null;
  if (!state) return { active, mode: null, levelId: null, wave: null, stats: null, player: null, pause: null, reloading: null, zombies: [] };
  const d = scene.getCombatDiagnostics ? scene.getCombatDiagnostics() : null;
  const zombies = (scene.physics?.world?.bodies?.entries ?? []).map(b => b.gameObject)
    .filter(o => o && o.isCombatActive && o.isCombatActive())
    .map(o => ({ id: o.def.id, x: o.x, y: o.y, health: o.health }));
  return {
    active,
    mode: state.mode,
    levelId: state?.levelId ?? null,
    wave: state.waveIndex,
    stats: { kills: state.stats.kills, elapsedMs: Math.round(state.stats.elapsedMs) },
    player: { x: d?.player?.x ?? null, y: d?.player?.y ?? null, health: state.player.health, maxHealth: state.player.maxHealth, weapon: state.player.currentWeaponId, owned: [...state.player.ownedWeapons], reserve: { ...state.player.ammoReserve }, mag: { ...state.player.ammoInMag }, currentMag: d?.player?.ammoInMag ?? null },
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

const PREFERRED_WEAPONS = ['aa12', 'gatling', 'golden_m249', 'ak47', 'rifle', 'tesla', 'cryo_sprayer', 'flamethrower', 'm16a4', 'barrett'];

/**
 * 长按式点键。软渲染下实测 7—24 FPS（一帧 40—140ms），
 * 70ms 的瞬时点按可能整段落在两帧之间被 `JustDown` 漏掉——2026-10-29 的
 * `weapon-reward-r05` 就是这样切枪无效、仍用手枪打第 6 关。按住 ≥260ms 可覆盖多帧。
 */
async function tapSlow(code, hold = 300) {
  await browser.key(code, true);
  await sleep(hold);
  await browser.key(code, false);
  await sleep(140);
}

/** 切到拥有的最强自动武器（槽位即数字键序号），并轮询确认真的切过去了。 */
async function equipBestWeapon() {
  const state = await snap();
  const owned = state.player.owned;
  const pick = PREFERRED_WEAPONS.find(id => owned.includes(id));
  if (!pick) return { pick: null, weapon: state.player.weapon, switched: false };
  const slot = owned.indexOf(pick) + 1;
  if (slot < 1 || slot > 6) return { pick, weapon: state.player.weapon, switched: false };
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await tapSlow(`Digit${slot}`);
    const now = await snap();
    if (now.player.weapon === pick) return { pick, weapon: pick, switched: true, slot, attempt };
  }
  const final = await snap();
  return { pick, weapon: final.player.weapon, switched: false, slot };
}

/**
 * 简易战斗：自动武器脉冲开火 + 绕圈风筝 + 空匣换弹。
 *
 * 两个坑（都踩过）：
 * 1. 按住鼠标不等于持续开火——开局武器可能 `auto: false`，按住只出一发，
 *    驱动会以为在打却零击杀（`weapon-reward-r02` 37 秒 0 杀阵亡）。必须脉冲。
 * 2. 站桩对枪在后期关卡必死——手枪打不动第 6 关的重装感染体
 *    （`weapon-reward-r03` 33 秒 1 杀阵亡）。所以先切到拥的最强自动武器，
 *    并在被贴身时朝反方向拉开。
 */
async function fightUntil(predicate, label, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let lastMoveAt = 0;
  while (Date.now() < deadline) {
    const state = await snap();
    // 场景已切走（死亡/通关）时 cameras 已销毁，再发鼠标事件会抛 matrix undefined。
    // 必须先判 active：此时 player 为 null，谓词会抛。
    if (!state.active.includes('GameScene')) return state;
    if (predicate(state)) return state;
    if (state.pause) throw new Error(`${label}: 出现暂停 ${state.pause}`);
    // 空匣就换弹；换弹期间继续走位，不硬等。
    if (!state.reloading && state.player.currentMag === 0) await tapSlow('KeyR', 200);

    const nearest = state.zombies
      .filter(z => z.x > 30 && z.x < 1260)
      .sort((a, b) => Math.hypot(a.x - state.player.x, a.y - state.player.y) - Math.hypot(b.x - state.player.x, b.y - state.player.y))[0] ?? null;
    if (!nearest) { await sleep(120); continue; }

    const dx = state.player.x - nearest.x;
    const dy = state.player.y - nearest.y;
    const distance = Math.hypot(dx, dy);
    // 被贴近就先跑：优先纵向拉开（场地上下空间更大），贴边时改横向。
    if (distance < 260 && Date.now() - lastMoveAt > 300) {
      lastMoveAt = Date.now();
      const useVertical = state.player.y > 120 && state.player.y < 600;
      const key = useVertical ? (dy >= 0 ? 'KeyS' : 'KeyW') : (dx >= 0 ? 'KeyD' : 'KeyA');
      await browser.key(key, true);
      await sleep(400);
      await browser.key(key, false);
    }
    try {
      await browser.move('GameScene', nearest.x, nearest.y);
      await browser.fire(true);
      await sleep(70);
      await browser.fire(false);
    } catch {
      // 场景在两次求值之间被销毁：下一轮由 active 判定收尾。
    }
    await sleep(40);
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
    const equipped = await equipBestWeapon();
    const entry = await snap();
    if (entry.levelId !== target.levelId) throw new Error(`进入关卡不符：${entry.levelId} ≠ ${target.levelId}`);
    await save(`${target.levelId}-entry.json`, { ...entry, equipped });
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
    if (!after.stats || !after.player) {
      throw new Error(`${target.levelId}: 阶段未清空就离开战场（active=${JSON.stringify(after.active)}）`);
    }
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

    await tapSlow('Escape');
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
