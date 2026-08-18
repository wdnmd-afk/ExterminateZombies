import type { AmmoType } from '../config/types';
import type { WeaponId } from '../config/weapons';
import type { GameMode } from './GameState';
import type { CharacterId } from '../config/characters';

export type PlayerDamageSource = 'melee' | 'projectile' | 'enemyBlast' | 'fire' | 'environment';

export interface PlayerDamageEvent {
  at: number;
  wave: number;
  source: PlayerDamageSource;
  incomingAmount: number;
  amount: number;
  healthBefore: number;
  healthAfter: number;
  x: number;
  y: number;
}

export interface CombatDiagnosticsSnapshot {
  capturedAt: number;
  mode: GameMode;
  waveNumber: number;
  gameEnded: boolean;
  pauseReason: string | null;
  player: {
    characterId: CharacterId;
    health: number;
    maxHealth: number;
    x: number;
    y: number;
    currentWeaponId: WeaponId;
    ownedWeapons: WeaponId[];
    ammoInMag: number;
    ammoReserve: Record<AmmoType, number>;
  };
  wave: {
    waveIndex: number;
    segmentIndex: number;
    segmentCount: number;
    concurrentCap: number | null;
    pendingInSegment: number;
    state: string;
  };
  objects: {
    zombies: number;
    bullets: number;
    enemyProjectiles: number;
    pickups: number;
    props: number;
    damageNumbers: number;
    corpses: number;
    lingerZones: number;
    enemyBlasts: number;
  };
  activeEnemies: Record<string, number>;
  damageEvents: PlayerDamageEvent[];
}

export type CombatDiagnosticsInput = Omit<CombatDiagnosticsSnapshot, 'damageEvents'>;

/** 固定容量环形记录，避免长流程诊断自身造成持续内存增长。 */
export class DamageEventBuffer {
  private readonly entries: Array<PlayerDamageEvent | undefined>;
  private nextIndex = 0;
  private size = 0;

  constructor(private readonly capacity = 64) {
    if (!Number.isInteger(capacity) || capacity <= 0) {
      throw new Error('DamageEventBuffer capacity must be a positive integer');
    }
    this.entries = new Array<PlayerDamageEvent | undefined>(capacity);
  }

  push(event: PlayerDamageEvent): void {
    this.entries[this.nextIndex] = { ...event };
    this.nextIndex = (this.nextIndex + 1) % this.capacity;
    this.size = Math.min(this.size + 1, this.capacity);
  }

  snapshot(): PlayerDamageEvent[] {
    const firstIndex = this.size === this.capacity ? this.nextIndex : 0;
    return Array.from({ length: this.size }, (_, offset) => {
      const event = this.entries[(firstIndex + offset) % this.capacity];
      if (!event) throw new Error('DamageEventBuffer contains an empty slot');
      return { ...event };
    });
  }

  clear(): void {
    this.entries.fill(undefined);
    this.nextIndex = 0;
    this.size = 0;
  }
}

/** 生成与运行时对象脱钩的诊断快照，供 CDP 安全地跨帧保存。 */
export function createCombatDiagnostics(
  buffer: DamageEventBuffer,
  input: CombatDiagnosticsInput,
): CombatDiagnosticsSnapshot {
  return cloneCombatDiagnostics({
    ...input,
    damageEvents: buffer.snapshot(),
  });
}

/** 返回深复制，避免外部探针修改场景保留的终局证据。 */
export function cloneCombatDiagnostics(snapshot: CombatDiagnosticsSnapshot): CombatDiagnosticsSnapshot {
  return {
    ...snapshot,
    player: {
      ...snapshot.player,
      ownedWeapons: [...snapshot.player.ownedWeapons],
      ammoReserve: { ...snapshot.player.ammoReserve },
    },
    wave: { ...snapshot.wave },
    objects: { ...snapshot.objects },
    activeEnemies: { ...snapshot.activeEnemies },
    damageEvents: snapshot.damageEvents.map((event) => ({ ...event })),
  };
}
