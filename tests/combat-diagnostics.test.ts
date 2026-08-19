import { describe, expect, it } from 'vitest';
import {
  DamageEventBuffer,
  cloneCombatDiagnostics,
  createCombatDiagnostics,
  type CombatDiagnosticsInput,
  type PlayerDamageEvent,
} from '../src/systems/CombatDiagnostics';

function event(at: number): PlayerDamageEvent {
  return {
    at,
    wave: 1,
    source: 'melee',
    incomingAmount: 10,
    amount: 10,
    healthBefore: 100,
    healthAfter: 90,
    x: 640,
    y: 360,
  };
}

function diagnosticsInput(): CombatDiagnosticsInput {
  return {
    capturedAt: 1000,
    mode: 'endless',
    waveNumber: 8,
    gameEnded: false,
    pauseReason: null,
    player: {
      characterId: 'watcher',
      health: 80,
      maxHealth: 100,
      x: 640,
      y: 360,
      currentWeaponId: 'smg',
      ownedWeapons: ['smg', 'pistol'],
      ammoInMag: 20,
      ammoReserve: { light: 40, heavy: 0, shell: 0, explosive: 0, belt: 0, fuel: 0 },
    },
    wave: {
      waveIndex: 7,
      segmentIndex: 0,
      segmentCount: 1,
      concurrentCap: null,
      pendingInSegment: 3,
      state: 'spawning',
    },
    objects: {
      zombies: 6,
      bullets: 2,
      enemyProjectiles: 1,
      pickups: 0,
      props: 4,
      damageNumbers: 1,
      corpses: 8,
      lingerZones: 1,
      enemyBlasts: 0,
    },
    activeEnemies: { walker: 4, lurker: 2 },
  };
}

describe('战斗诊断伤害环形记录', () => {
  it('保留按时间顺序排列的最近事件并淘汰最旧事件', () => {
    const buffer = new DamageEventBuffer(2);
    buffer.push(event(100));
    buffer.push(event(200));
    buffer.push(event(300));

    expect(buffer.snapshot().map((entry) => entry.at)).toEqual([200, 300]);
  });

  it('清空后可以安全复用', () => {
    const buffer = new DamageEventBuffer(2);
    buffer.push(event(100));
    buffer.clear();

    expect(buffer.snapshot()).toEqual([]);
  });

  it('快照与输入对象和环形记录保持隔离', () => {
    const buffer = new DamageEventBuffer(2);
    const damageEvent = event(100);
    const input = diagnosticsInput();
    buffer.push(damageEvent);

    const snapshot = createCombatDiagnostics(buffer, input);
    damageEvent.healthAfter = 1;
    input.player.ammoReserve.light = 0;
    input.player.ownedWeapons.length = 0;
    input.activeEnemies.walker = 0;

    expect(snapshot.damageEvents[0]?.healthAfter).toBe(90);
    expect(snapshot.player.ammoReserve.light).toBe(40);
    expect(snapshot.player.ownedWeapons).toEqual(['smg', 'pistol']);
    expect(snapshot.activeEnemies.walker).toBe(4);
  });

  it('返回终局快照的深复制，外部修改不会污染保留证据', () => {
    const buffer = new DamageEventBuffer(2);
    buffer.push(event(100));
    const frozen = createCombatDiagnostics(buffer, diagnosticsInput());
    const copy = cloneCombatDiagnostics(frozen);

    copy.player.ammoReserve.light = 0;
    copy.player.ownedWeapons.length = 0;
    copy.activeEnemies.walker = 0;
    copy.damageEvents[0]!.healthAfter = 1;

    expect(frozen.player.ammoReserve.light).toBe(40);
    expect(frozen.player.ownedWeapons).toEqual(['smg', 'pistol']);
    expect(frozen.activeEnemies.walker).toBe(4);
    expect(frozen.damageEvents[0]?.healthAfter).toBe(90);
  });
});
