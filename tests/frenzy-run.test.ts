import type Phaser from 'phaser';
import { readFileSync } from 'node:fs';
import { createSourceFile, ScriptTarget } from 'typescript';
import { describe, expect, it, vi } from 'vitest';
import { FRENZY_DURATION_MS, FRENZY_PRESETS, FRENZY_PRESET_IDS, FRENZY_REWARDS, FRENZY_TARGETS, FRENZY_VERSION, type FrenzyPresetId, type FrenzyRewardId } from '../src/config/frenzy';
import { ZOMBIES, type ZombieId } from '../src/config/zombies';
import type { ZombieScaling } from '../src/config/types';
import type { Bullet } from '../src/entities/Bullet';
import type { Player } from '../src/entities/Player';
import type { Prop } from '../src/entities/Prop';
import type { Zombie } from '../src/entities/Zombie';
import { EVENTS, SCENES } from '../src/constants';
import { FrenzyDirector } from '../src/systems/FrenzyDirector';
import { advanceFrenzy, createFrenzyRun, finishFrenzy, getFrenzyScore, isFrenzyRunning, updateFrenzyRecord, type FrenzyRecords } from '../src/systems/FrenzyRules';
import { createInitialState } from '../src/systems/GameState';
import { WeaponManager } from '../src/systems/WeaponManager';
import { ItemManager } from '../src/systems/ItemManager';
import { EnhancementManager } from '../src/systems/EnhancementManager';
import { SAVE_KEYS, SaveManager } from '../src/systems/SaveManager';
import type { InputManager } from '../src/systems/InputManager';
import type { ObjectPool } from '../src/utils/ObjectPool';
import type { FrenzyResultData } from '../src/scenes/FrenzyResultScene';
import { sceneMethod } from './helpers/scene-method';

vi.mock('phaser', () => ({ default: {
  Math: { Clamp: (value: number, min: number, max: number) => Math.max(min, Math.min(max, value)) },
  Sound: { Events: { UNLOCKED: 'unlocked' } },
} }));

function createVisual() {
  const visual = {
    text: '', destroy: vi.fn(),
    setStrokeStyle: () => visual, setDepth: () => visual, setOrigin: () => visual,
    setPosition: () => visual, setVisible: () => visual, setRadius: () => visual,
    setFillStyle: () => visual, setText: (text: string) => { visual.text = text; return visual; },
  };
  return visual;
}

const sound = { setMusic: vi.fn(), play: vi.fn() };
const startRun = sceneMethod('startFrenzy', { FrenzyDirector, EVENTS, SoundManager: sound });
const grantReward = sceneMethod('grantFrenzyReward', { FRENZY_REWARDS, getFrenzyScore, EVENTS, SoundManager: sound });
const endRun = sceneMethod('handleFrenzyEnd', {
  isFrenzyRunning, getFrenzyScore, updateFrenzyRecord, FRENZY_VERSION, SAVE_KEYS, SCENES,
  isDeveloperCheatEnabled: () => false, SaveManager, SoundManager: sound,
});
const resultSource = createSourceFile('FrenzyResultScene.ts', readFileSync(new URL('../src/scenes/FrenzyResultScene.ts', import.meta.url), 'utf8'), ScriptTarget.Latest, true);
const leaveResult = sceneMethod('leave', { SCENES, SoundManager: sound }, resultSource);

function createRun(presetId: FrenzyPresetId, resetSave = true) {
  if (resetSave) SaveManager.resetAll('level_1');
  const preset = FRENZY_PRESETS[presetId];
  const state = createInitialState('frenzy', null, preset.weaponId, ['pistol', preset.weaponId], preset.characterId);
  const run = createFrenzyRun(presetId);
  state.frenzy = run;
  state.player.activeEnhancements = new Set(preset.enhancements);
  state.player.health = 1;
  state.player.items.mine = 0;
  state.player.currentItemId = null;
  const weapon = EnhancementManager.resolveWeaponDef(preset.weaponId, state.player.activeEnhancements);
  state.player.ammoInMag[preset.weaponId] = weapon.magazineSize;
  const enemies: Zombie[] = [];
  const context = {
    state, gameEnded: false, frenzyDirector: null as FrenzyDirector | null,
    weaponManager: null as unknown as WeaponManager, itemManager: null as unknown as ItemManager,
    add: { circle: createVisual, text: createVisual },
    events: { emit: vi.fn() }, time: { now: 0, delayedCall: (_delay: number, callback: () => void) => { callback(); return { remove: vi.fn() }; } },
    physics: { world: { resume: vi.fn() } }, scene: { start: vi.fn() },
    medicineManager: { clearOnDeath: vi.fn() }, destroyMedicineUseProgress: vi.fn(), buildCombatDiagnostics: () => null,
    applyFeedbackShake: vi.fn(), spawnProp: vi.fn(), getActiveZombies: () => enemies.filter((enemy) => enemy.active),
    spawnZombie: (id: ZombieId, position: { x: number; y: number }, scaling?: ZombieScaling): Zombie => {
      const zombie = { ...position, active: true, def: ZOMBIES[id], health: ZOMBIES[id].health * (scaling?.healthMultiplier ?? 1) } as Zombie;
      enemies.push(zombie);
      return zombie;
    },
    grantFrenzyReward: vi.fn((id: FrenzyRewardId): void => { grantReward.call(context, id); }),
  };
  const scene = context as unknown as Phaser.Scene;
  context.weaponManager = new WeaponManager(scene, state, {} as ObjectPool<Bullet>);
  context.itemManager = new ItemManager({
    scene, state, input: {} as InputManager, player: {} as Player,
    spawnDeployable: () => ({} as Prop), detonateProp: () => {}, getProps: () => [], getZombies: context.getActiveZombies,
  });
  startRun.call(context);
  const director = context.frenzyDirector!;
  const tick = (delta: number, paused = false) => { advanceFrenzy(run, delta, paused); context.time.now += delta; };
  const killTarget = (id: FrenzyRewardId) => {
    const target = FRENZY_TARGETS.find((entry) => entry.id === id)!;
    const enemy = enemies.find((entry) => entry.x === target.x && entry.y === target.y && entry.def.id === target.zombieId)!;
    director.onDeath(enemy);
    enemy.active = false;
    return enemy;
  };
  const dispose = () => { director.destroy(); context.weaponManager.destroy(); };
  return { context, state, run, director, enemies, weapon, tick, killTarget, dispose };
}

const orders: readonly (readonly FrenzyRewardId[])[] = [
  ['ammo', 'breach', 'supply'], ['ammo', 'supply', 'breach'],
  ['breach', 'ammo', 'supply'], ['breach', 'supply', 'ammo'],
  ['supply', 'ammo', 'breach'], ['supply', 'breach', 'ammo'],
];

describe('狂潮跨系统业务串联（实体与图形为替身，不是自然试玩）', () => {
  it.each(FRENZY_PRESET_IDS.flatMap((presetId) => orders.map((order) => ({ presetId, order, route: order.join('→') }))))(
    '$presetId / $route：拾取、奖励、首领、纪录、重开保持一致', ({ presetId, order }) => {
      const { context, state, run, director, enemies, weapon, tick, killTarget, dispose } = createRun(presetId);
      const longTerm = [SaveManager.getWeaponLoadout(), SaveManager.getUnlockedWeapons(), SaveManager.getPreferredCharacterId()];
      for (const [index, id] of order.entries()) {
        tick(9000);
        const enemy = killTarget(id);
        director.update({ x: 640, y: 360 });
        expect(context.grantFrenzyReward).toHaveBeenCalledTimes(index);
        const reserve = state.player.ammoReserve[weapon.ammoType];
        if (id === 'ammo') state.player.ammoInMag[weapon.id as typeof state.player.currentWeaponId] = 1;
        director.update(enemy);
        director.update(enemy);
        expect(context.grantFrenzyReward).toHaveBeenCalledTimes(index + 1);
        expect(run.targets[id]).toBe('collected');
        expect(run.phase).toBe(index === 2 ? 'boss' : 'hunting');
        if (id === 'ammo') {
          expect(state.player.ammoInMag[state.player.currentWeaponId]).toBe(weapon.magazineSize);
          expect(state.player.ammoReserve[weapon.ammoType]).toBe(reserve);
        }
        if (id === 'supply') {
          expect(state.player.ammoReserve[weapon.ammoType]).toBe(reserve + Math.ceil(weapon.magazineSize * 2));
          expect(state.player.items.mine).toBe(2);
          expect(state.player.currentItemId).toBe('mine');
          expect(state.player.health).toBe(1 + Math.ceil(state.player.maxHealth * 0.35));
        }
        const elapsed = run.elapsedMs;
        tick(30000, true);
        expect(run.elapsedMs).toBe(elapsed);
      }
      const bosses = enemies.filter((enemy) => enemy.def.id === 'tank_boss');
      expect(bosses).toHaveLength(1);
      expect(director.lockBossDefeat(bosses[0])).toBe(true);
      tick(10000);
      endRun.call(context);
      endRun.call(context);
      expect(context.scene.start).toHaveBeenCalledOnce();
      const result = context.scene.start.mock.calls[0][1] as FrenzyResultData;
      expect(result.run.phase).toBe('won');
      expect(result.run.elapsedMs).toBe(27000);
      expect(result.run.ammoUntilMs).toBe(0);
      expect(result.run.breachUntilMs).toBe(0);
      expect(SaveManager.load<FrenzyRecords>(SAVE_KEYS.frenzyRecords, {})[FRENZY_VERSION]?.[presetId]?.score).toBe(getFrenzyScore(run).total);
      expect([SaveManager.getWeaponLoadout(), SaveManager.getUnlockedWeapons(), SaveManager.getPreferredCharacterId()]).toEqual(longTerm);
      const retry = { result, leaving: false, scene: { start: vi.fn() } };
      leaveResult.call(retry, 'retry');
      leaveResult.call(retry, 'retry');
      expect(retry.scene.start).toHaveBeenCalledExactlyOnceWith(SCENES.game, { mode: 'frenzy', frenzyPresetId: presetId });
      dispose();
      const next = createRun(presetId, false);
      expect(next.run.phase).toBe('hunting');
      expect(next.run.elapsedMs).toBe(0);
      expect(next.run.targets).toEqual({ ammo: 'alive', breach: 'alive', supply: 'alive' });
      expect(next.context.grantFrenzyReward).not.toHaveBeenCalled();
      next.dispose();
    },
  );

  it.each(FRENZY_PRESET_IDS)('%s 死亡/超时只结算一次，不覆盖历史通关纪录', (presetId) => {
    for (const reason of ['dead', 'timeout'] as const) {
      const { context, run, director, killTarget, tick, dispose } = createRun(presetId);
      const records = { [FRENZY_VERSION]: { [presetId]: { score: 28000, elapsedMs: 180000 } } };
      SaveManager.save(SAVE_KEYS.frenzyRecords, records);
      if (reason === 'timeout') {
        for (const target of FRENZY_TARGETS) director.update(killTarget(target.id));
        tick(FRENZY_DURATION_MS);
      } else {
        finishFrenzy(run, 'dead');
      }
      endRun.call(context);
      endRun.call(context);
      expect(context.scene.start).toHaveBeenCalledOnce();
      expect((context.scene.start.mock.calls[0][1] as FrenzyResultData).run.phase).toBe(reason);
      expect(SaveManager.load(SAVE_KEYS.frenzyRecords, {})).toEqual(records);
      expect(run.ammoUntilMs).toBe(0);
      expect(run.breachUntilMs).toBe(0);
      dispose();
    }
  });
});
