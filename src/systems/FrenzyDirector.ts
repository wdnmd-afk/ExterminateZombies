import Phaser from 'phaser';
import { DEPTH, GAME_HEIGHT, GAME_WIDTH } from '../constants';
import { FRENZY_ENEMY_CAP, FRENZY_REWARDS, FRENZY_TARGETS, type FrenzyRewardId, type FrenzyTarget } from '../config/frenzy';
import type { ZombieId } from '../config/zombies';
import type { ZombieScaling } from '../config/types';
import type { Zombie } from '../entities/Zombie';
import { UI_FONT_FAMILY } from '../ui/fonts';
import { collectFrenzyReward, defeatFrenzyTarget, finishFrenzy, isFrenzyRunning, type FrenzyRun } from './FrenzyRules';

interface FrenzyHooks {
  scene: Phaser.Scene;
  run: FrenzyRun;
  spawn: (id: ZombieId, position: { x: number; y: number }, scaling?: ZombieScaling) => Zombie;
  enemyCount: () => number;
  grantReward: (id: FrenzyRewardId) => void;
  announce: (title: string, detail: string) => void;
}

interface TargetRuntime {
  definition: FrenzyTarget;
  zombie: Zombie | null;
  ring: Phaser.GameObjects.Arc;
  label: Phaser.GameObjects.Text;
  x: number;
  y: number;
}

export class FrenzyDirector {
  private readonly targets: TargetRuntime[] = [];
  private readonly anchors = new Map<Zombie, { x: number; y: number }>();
  private boss: Zombie | null = null;
  private nextPressureAt = 900;
  private spawnIndex = 0;

  constructor(private readonly hooks: FrenzyHooks) {}

  start(): void {
    const { scene, spawn } = this.hooks;
    for (const definition of FRENZY_TARGETS) {
      const zombie = spawn(definition.zombieId, definition, {
        healthMultiplier: definition.healthMultiplier, damageMultiplier: 1,
      });
      this.anchors.set(zombie, definition);
      const ring = scene.add.circle(definition.x, definition.y, zombie.def.radius + 10)
        .setStrokeStyle(2, 0xfbc02d, 0.8).setDepth(DEPTH.prop);
      const label = scene.add.text(definition.x, definition.y - 52, '', {
        fontFamily: UI_FONT_FAMILY, fontSize: '13px', color: '#fbc02d',
        backgroundColor: '#111116', padding: { x: 5, y: 3 }, align: 'center',
      }).setOrigin(0.5, 1).setDepth(DEPTH.effect);
      this.targets.push({ definition, zombie, ring, label, x: definition.x, y: definition.y });
      definition.guards.forEach((id, index) => {
        const angle = index / definition.guards.length * Math.PI * 2;
        const guard = spawn(id, { x: definition.x + Math.cos(angle) * 72, y: definition.y + Math.sin(angle) * 72 });
        this.anchors.set(guard, definition);
      });
    }
    this.spawnPressure(20);
    this.refreshTargets();
    this.hooks.announce('狂潮猎杀 · 05:00', '自选顺序击杀三个标记目标，靠近拾取核心，再斩杀首领');
  }

  update(player: { x: number; y: number }): void {
    const { run } = this.hooks;
    if (!isFrenzyRunning(run)) return;
    if (run.elapsedMs >= this.nextPressureAt) {
      this.nextPressureAt = run.elapsedMs + (run.phase === 'boss' ? 1100 : 900);
      this.spawnPressure(4);
    }
    for (const target of this.targets) {
      if (run.targets[target.definition.id] !== 'dropped') continue;
      if (Math.hypot(player.x - target.x, player.y - target.y) > 46) continue;
      if (!collectFrenzyReward(run, target.definition.id)) continue;
      target.ring.setVisible(false);
      target.label.setVisible(false);
      this.hooks.grantReward(target.definition.id);
    }
    if (run.phase === 'boss' && !this.boss) {
      this.boss = this.hooks.spawn('tank_boss', { x: GAME_WIDTH / 2, y: 84 });
      this.hooks.announce('首领已现身', '击杀即通关 · 剩余每秒 +100 分');
    }
    this.refreshTargets();
  }

  lockBossDefeat(zombie: Zombie): boolean {
    return zombie === this.boss && finishFrenzy(this.hooks.run, 'won');
  }

  onDeath(zombie: Zombie): void {
    this.anchors.delete(zombie);
    const target = this.targets.find((entry) => entry.zombie === zombie);
    if (!target || !defeatFrenzyTarget(this.hooks.run, target.definition.id)) return;
    target.x = Phaser.Math.Clamp(zombie.x, 40, GAME_WIDTH - 40);
    target.y = Phaser.Math.Clamp(zombie.y, 72, GAME_HEIGHT - 60);
    target.zombie = null;
    target.ring.setRadius(21).setFillStyle(0xfbc02d, 0.22).setDepth(DEPTH.pickup);
    this.refreshTargets();
  }

  getSeekTarget(zombie: Zombie, player: { x: number; y: number }): { x: number; y: number } | null {
    const anchor = this.anchors.get(zombie);
    if (!anchor) return null;
    const targetNearby = Math.hypot(player.x - anchor.x, player.y - anchor.y) < 250;
    const withinLeash = Math.hypot(zombie.x - anchor.x, zombie.y - anchor.y) < 180;
    return targetNearby && withinLeash ? player : anchor;
  }

  destroy(): void {
    for (const target of this.targets) {
      target.ring.destroy();
      target.label.destroy();
    }
    this.targets.length = 0;
    this.anchors.clear();
    this.boss = null;
  }

  private spawnPressure(count: number): void {
    const sequence: readonly ZombieId[] = ['walker', 'walker', 'runner', 'walker', 'walker', 'bomber', 'walker', 'runner'];
    for (let index = 0; index < count && this.hooks.enemyCount() < FRENZY_ENEMY_CAP - 1; index += 1) {
      const serial = this.spawnIndex++;
      const progress = ((Math.floor(serial / 4) * 173 + 67) % 1000) / 1000;
      const side = serial % 4;
      const position = side === 0 ? { x: progress * (GAME_WIDTH - 80) + 40, y: -24 }
        : side === 1 ? { x: GAME_WIDTH + 24, y: progress * (GAME_HEIGHT - 100) + 50 }
          : side === 2 ? { x: progress * (GAME_WIDTH - 80) + 40, y: GAME_HEIGHT + 24 }
            : { x: -24, y: progress * (GAME_HEIGHT - 100) + 50 };
      this.hooks.spawn(sequence[serial % sequence.length], position);
    }
  }

  private refreshTargets(): void {
    for (const target of this.targets) {
      const status = this.hooks.run.targets[target.definition.id];
      if (status === 'collected') continue;
      if (target.zombie) {
        target.x = target.zombie.x;
        target.y = target.zombie.y;
      }
      target.ring.setPosition(target.x, target.y);
      target.label.setPosition(Phaser.Math.Clamp(target.x, 110, GAME_WIDTH - 110), Math.max(48, target.y - 38));
      const reward = FRENZY_REWARDS[target.definition.id];
      const text = status === 'alive'
        ? `${target.definition.name} · ${Math.ceil(target.zombie?.health ?? 0)}\n${reward.name}`
        : `靠近拾取 · ${reward.name}\n${reward.description}`;
      if (target.label.text !== text) target.label.setText(text);
    }
  }
}
