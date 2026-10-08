import { readFileSync } from 'node:fs';
import { createSourceFile, ScriptTarget } from 'typescript';
import { describe, expect, it, vi } from 'vitest';
import { FRENZY_DURATION_MS, FRENZY_PRESETS, FRENZY_REWARDS, FRENZY_VERSION, isFrenzyPresetId } from '../src/config/frenzy';
import { EVENTS, SCENES } from '../src/constants';
import { advanceFrenzy, collectFrenzyReward, createFrenzyRun, defeatFrenzyTarget, finishFrenzy, formatFrenzyTime, getFrenzyScore, isFrenzyRunning, updateFrenzyRecord } from '../src/systems/FrenzyRules';
import { SAVE_KEYS } from '../src/systems/SaveManager';
import { sceneMethod } from './helpers/scene-method';

function readyRun() {
  const run = createFrenzyRun('shotgun');
  for (const id of ['ammo', 'breach', 'supply'] as const) {
    defeatFrenzyTarget(run, id);
    collectFrenzyReward(run, id);
  }
  return run;
}

describe('狂潮 GameScene 真实方法接线', () => {
  it.each(['shotgun', 'tesla', 'explosive'])('%s 初始化不读取或修改长期编队', (presetId) => {
    const storage = new Proxy({}, { get: () => { throw new Error('狂潮预设不应访问长期整备'); } });
    const init = sceneMethod('init', { FRENZY_PRESETS, isFrenzyPresetId, SaveManager: storage });
    const subject: Record<string, unknown> = {};
    init.call(subject, { mode: 'frenzy', frenzyPresetId: presetId });
    expect(subject.levelId).toBeNull();
    expect(subject.loadoutWeaponIds).toEqual(['pistol', FRENZY_PRESETS[presetId as keyof typeof FRENZY_PRESETS].weaponId]);
    expect(subject.frenzyPresetId).toBe(presetId);
  });

  it('开局与首领播报使用 HUD 的准确 title/subtitle/accent 字段', () => {
    let announce: ((title: string, detail: string) => void) | undefined;
    const sound = { setMusic: vi.fn() };
    const start = sceneMethod('startFrenzy', {
      FrenzyDirector: class {
        constructor(hooks: { announce: typeof announce }) { announce = hooks.announce; }
        start() {}
      }, EVENTS, SoundManager: sound,
    });
    const run = createFrenzyRun('shotgun');
    const emit = vi.fn();
    start.call({
      state: { frenzy: run }, weaponManager: { resupplyOwnedWeapons: vi.fn() },
      spawnProp: vi.fn(), time: { delayedCall: (_delay: number, callback: () => void) => callback() }, events: { emit },
    });
    announce!('狂潮猎杀', '猎杀并拾取');
    expect(emit).toHaveBeenLastCalledWith(EVENTS.waveAnnounced, { title: '狂潮猎杀', subtitle: '猎杀并拾取', accent: 0xfbc02d });
    run.phase = 'boss';
    announce!('首领已现身', '击杀即通关');
    expect(sound.setMusic).toHaveBeenCalledWith('boss');
  });

  it('暂停/挂起与终态不走倒计时，超时只进入狂潮结算', () => {
    const update = sceneMethod('update', { advanceFrenzy, isFrenzyRunning, isDeveloperCheatEnabled: () => false });
    const run = readyRun();
    const subject = {
      gameEnded: false, pauseReason: 'menu' as string | null, state: { frenzy: run, stats: { elapsedMs: 0 } },
      watchdogCardSelection: vi.fn(), handleFrenzyEnd: vi.fn(),
    };
    update.call(subject, 0, 60000);
    expect(run.elapsedMs).toBe(0);
    subject.pauseReason = null;
    update.call(subject, 0, 300000);
    expect(run.phase).toBe('timeout');
    expect(subject.handleFrenzyEnd).toHaveBeenCalledOnce();
    update.call(subject, 0, 10000);
    expect(subject.handleFrenzyEnd).toHaveBeenCalledOnce();
  });

  it.each(['won', 'dead', 'timeout'] as const)('%s 结算幂等，成功才存纪录，传递独立快照', (result) => {
    const run = readyRun();
    advanceFrenzy(run, 60000);
    finishFrenzy(run, result);
    const save = vi.fn();
    const start = vi.fn();
    const end = sceneMethod('handleFrenzyEnd', {
      isFrenzyRunning, getFrenzyScore, updateFrenzyRecord, FRENZY_VERSION, SAVE_KEYS, SCENES,
      isDeveloperCheatEnabled: () => false,
      SaveManager: { load: () => ({}), save }, SoundManager: { play: vi.fn() },
    });
    const subject = {
      state: { frenzy: run, score: 0 }, gameEnded: false,
      medicineManager: { clearOnDeath: vi.fn() }, destroyMedicineUseProgress: vi.fn(),
      physics: { world: { resume: vi.fn() } }, buildCombatDiagnostics: () => ({}), scene: { start },
    };
    end.call(subject);
    end.call(subject);
    expect(start).toHaveBeenCalledOnce();
    expect(start.mock.calls[0][0]).toBe(SCENES.frenzyResult);
    expect(start.mock.calls[0][1].run).not.toBe(run);
    expect(start.mock.calls[0][1].run.targets).not.toBe(run.targets);
    expect(save).toHaveBeenCalledTimes(result === 'won' ? 1 : 0);
    if (result === 'won') expect(save.mock.calls[0][0]).toBe(SAVE_KEYS.frenzyRecords);
  });

  it('首领动画前锁定通关，动画后回调最终结算', () => {
    const run = readyRun();
    let complete: (() => void) | undefined;
    const death = sceneMethod('handleZombieDeath', { isFrenzyRunning, isBossZombie: () => true, SoundManager: { playAt: vi.fn() } });
    const subject = {
      state: { frenzy: run }, frenzyDirector: { lockBossDefeat: () => finishFrenzy(run, 'won') },
      physics: { world: { pause: vi.fn() } }, time: { now: 1000 }, finalizeZombieDeath: vi.fn(),
      applyFeedbackShake: vi.fn(), requestCombatSlowMotion: vi.fn(), spawnBossDeathLeadIn: vi.fn(),
    };
    const zombie = { active: true, def: { id: 'tank_boss', color: 0 }, x: 0, y: 0,
      beginDeathAnimation: (callback: () => void) => { complete = callback; return true; } };
    death.call(subject, zombie);
    expect(run.phase).toBe('won');
    expect(subject.physics.world.pause).toHaveBeenCalledOnce();
    expect(subject.finalizeZombieDeath).not.toHaveBeenCalled();
    death.call(subject, zombie);
    complete!();
    expect(subject.finalizeZombieDeath).toHaveBeenCalledOnce();
  });

  it('狂潮期间拒绝额外抽卡与作弊编队替换，终态拒绝伤害', () => {
    expect(sceneMethod('handleEnhancementPickup').call({ mode: 'frenzy' })).toBe(false);
    expect(() => sceneMethod('applyDeveloperCheatLoadout').call({ mode: 'frenzy' })).not.toThrow();
    const run = readyRun();
    finishFrenzy(run, 'won');
    expect(() => sceneMethod('damagePlayer', { isFrenzyRunning }).call({ gameEnded: false, state: { frenzy: run } }, 100, 'contact')).not.toThrow();
    expect(() => sceneMethod('toggleMenu', { isFrenzyRunning }).call({ state: { frenzy: run } })).not.toThrow();
    expect(() => sceneMethod('suspendToMainMenu', { isFrenzyRunning }).call({ gameEnded: false, state: { frenzy: run } })).not.toThrow();
  });

  it('补给复用道具管理器处理上限与空槽选择，生命不超过上限', () => {
    const grant = sceneMethod('grantFrenzyReward', { FRENZY_REWARDS, getFrenzyScore, EVENTS, SoundManager: { play: vi.fn() } });
    const subject = {
      state: { player: { health: 95, maxHealth: 100 }, frenzy: readyRun(), score: 0 },
      weaponManager: { resupplyOwnedWeapons: vi.fn() }, itemManager: { addItem: vi.fn() },
      events: { emit: vi.fn() }, applyFeedbackShake: vi.fn(),
    };
    grant.call(subject, 'supply');
    expect(subject.itemManager.addItem).toHaveBeenCalledWith('mine', 2);
    expect(subject.weaponManager.resupplyOwnedWeapons).toHaveBeenCalledWith(2);
    expect(subject.state.player.health).toBe(100);
  });

  it('驻守目标追击玩家不停在诱饵半径之外，原有诱饵停靠距离不变', () => {
    const update = sceneMethod('updateZombies', { LURE_SETTINGS: { arrivalRadius: 24 } });
    const zombie = { def: { radius: 14 }, blocked: false, updateAbility: () => null, seek: vi.fn() };
    const player = { x: 200, y: 200 };
    const target = vi.fn<() => { x: number; y: number } | null>(() => player);
    const lure = vi.fn<() => { x: number; y: number } | null>(() => null);
    const subject = {
      getActiveZombies: () => [zombie],
      enemySpatialHash: { rebuild: vi.fn(), queryRadius: () => [] },
      areaEffects: { isEnemyBlocked: () => false }, time: { now: 1000 }, player,
      frenzyDirector: { getSeekTarget: target }, lureSystem: { getTarget: lure },
    };
    update.call(subject, 16);
    expect(zombie.seek).toHaveBeenLastCalledWith(1000, 200, 200, 0, 0, 0);
    target.mockReturnValue({ x: 180, y: 190 });
    update.call(subject, 16);
    expect(zombie.seek).toHaveBeenLastCalledWith(1000, 180, 190, 0, 0, 16);
    target.mockReturnValue(null);
    lure.mockReturnValue({ x: 300, y: 300 });
    update.call(subject, 16);
    expect(zombie.seek).toHaveBeenLastCalledWith(1000, 300, 300, 0, 0, 38);
  });

  it.each([[true, true], [true, false], [false, false]])('侧栏 %s / 完整 %s 均展示计时和奖励，不挤到药品区', (side, full) => {
    const hudSource = createSourceFile('HUDScene.ts', readFileSync(new URL('../src/scenes/HUDScene.ts', import.meta.url), 'utf8'), ScriptTarget.Latest, true);
    const refresh = sceneMethod('refreshFrenzyPresentation', {
      FRENZY_DURATION_MS, formatFrenzyTime, USE_SIDE_HUD: side, USE_FULL_SIDE_HUD: full,
      RIGHT_PANEL_TEXT_MAX_WIDTH: 120, RIGHT_PANEL_TEXT_LEFT: 1000, RIGHT_SUMMARY_TOP: 270,
      RIGHT_PANEL_TOP: 18, RIGHT_PANEL_HEIGHT: 64, fitTextWidth: vi.fn(),
    }, hudSource);
    const text = () => {
      const value = { setText: vi.fn(() => value), setColor: vi.fn(() => value), setVisible: vi.fn(() => value), setPosition: vi.fn(() => value) };
      return value;
    };
    const subject = { gameScene: { getState: () => ({ frenzy: readyRun() }) }, modeText: text(), waveText: text(), enhancementText: text() };
    refresh.call(subject);
    expect(subject.modeText.setText).toHaveBeenCalledWith('狂潮 05:00');
    expect(subject.enhancementText.setVisible).toHaveBeenCalledWith(true);
    expect(subject.enhancementText.setText).toHaveBeenCalledWith(side && !full ? '弹12s  伤15s' : '弹匣免耗 12s\n火力 ×1.5 · 15s');
    expect(subject.enhancementText.setPosition).toHaveBeenCalledWith(1000, side ? 302 : 90);
  });

  it('狂潮战斗拒绝慢动作，终结及旧模式保留原行为', () => {
    const request = sceneMethod('requestCombatSlowMotion');
    const play = vi.fn();
    const run = readyRun();
    const subject = { mode: 'frenzy', state: { frenzy: run }, slowMotion: { requestByTier: play } };
    request.call(subject, 'A', 1000);
    expect(play).not.toHaveBeenCalled();
    finishFrenzy(run, 'won');
    request.call(subject, 'S', 1000);
    expect(play).toHaveBeenCalledWith('S', 1000);
    subject.mode = 'endless';
    request.call(subject, 'A', 2000);
    expect(play).toHaveBeenLastCalledWith('A', 2000);
  });
});
