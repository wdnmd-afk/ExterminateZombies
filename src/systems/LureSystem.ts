import Phaser from 'phaser';
import type { LurePlacement } from '../config/types';
import { LURE_SETTINGS, TACTICAL_TEXTURE_KEYS } from '../config/tacticalDevices';
import { DEPTH, EVENTS } from '../constants';
import { UI_FONT_FAMILY } from '../ui/fonts';
import {
  activateLure,
  createLureState,
  findNearbyLure,
  getLurePhase,
  resolveLureTarget,
  shiftLureTimers,
  type LureState,
} from './LureRules';
import { SoundManager } from './SoundManager';

interface LureView {
  state: LureState;
  image: Phaser.GameObjects.Image;
  ring: Phaser.GameObjects.Arc;
  wave: Phaser.GameObjects.Arc;
  label: Phaser.GameObjects.Text;
}

export class LureSystem {
  private readonly states: LureState[];
  private readonly views: LureView[];

  constructor(private readonly scene: Phaser.Scene, placements: readonly LurePlacement[]) {
    this.states = placements.map(createLureState);
    this.views = this.states.map((state) => ({
      state,
      image: scene.add.image(state.x, state.y, TACTICAL_TEXTURE_KEYS.lure)
        .setScale(1.5).setDepth(DEPTH.prop),
      ring: scene.add.circle(state.x, state.y, 39)
        .setStrokeStyle(2, 0xfbc02d, 0.55).setDepth(DEPTH.prop - 1),
      wave: scene.add.circle(state.x, state.y, 20)
        .setStrokeStyle(2, 0x58c9dd, 0.3).setDepth(DEPTH.ground + 1).setVisible(false),
      label: scene.add.text(state.x, state.y + 38, '', {
        fontFamily: UI_FONT_FAMILY,
        fontSize: '13px',
        color: '#f4eedd',
        backgroundColor: '#171c20',
        padding: { x: 6, y: 3 },
      }).setOrigin(0.5, 0).setDepth(DEPTH.effect),
    }));
  }

  update(now: number, player: { x: number; y: number }, interact: boolean, keyLabel: string): void {
    const nearby = findNearbyLure(this.states, player);
    if (interact && nearby && activateLure(this.states, nearby.id, now)) {
      SoundManager.playAt('uiConfirm', nearby.x, nearby.y);
      this.scene.events.emit(EVENTS.combatAlert, {
        key: 'lure-activated',
        title: '广播开启 · 尸群转向',
        subtitle: '拉开距离再开火 · 重装与远程不受影响',
        tone: 'status',
        priority: 10,
        duration: 1800,
      });
    }

    for (const view of this.views) {
      const { state } = view;
      const phase = getLurePhase(state, now);
      const broadcasting = phase === 'broadcasting';
      const near = state === nearby;
      view.image.setAlpha(phase === 'exhausted' ? 0.4 : 1);
      view.ring.setStrokeStyle(near ? 3 : 2, broadcasting ? 0x58c9dd : 0xfbc02d, near ? 0.9 : 0.4);
      view.wave.setVisible(broadcasting);
      if (broadcasting) {
        const progress = ((LURE_SETTINGS.durationMs - (state.activeUntil - now)) % 1600) / 1600;
        view.wave.setRadius(30 + progress * (LURE_SETTINGS.attractionRadius - 30));
        view.wave.setAlpha((1 - progress) * 0.45);
      }
      const label = phase === 'broadcasting'
        ? `广播中 ${Math.ceil((state.activeUntil - now) / 1000)}s`
        : phase === 'cooldown'
          ? `冷却 ${Math.ceil((state.readyAt - now) / 1000)}s · 余 ${state.chargesLeft} 次`
          : phase === 'exhausted'
            ? '广播电量耗尽'
            : near
              ? `[${keyLabel}] 启动广播 · 余 ${state.chargesLeft} 次`
              : `广播站 · 余 ${state.chargesLeft} 次`;
      view.label.setText(label).setColor(broadcasting ? '#8fe8ff' : '#f4eedd');
    }
  }

  getTarget(now: number, zombie: { def: { id: string }; x: number; y: number }, player: { x: number; y: number }): LureState | null {
    if (this.states.length === 0) return null;
    return resolveLureTarget(this.states, now, { typeId: zombie.def.id, x: zombie.x, y: zombie.y }, player);
  }

  getSnapshots(now: number) {
    return this.states.map((state) => ({ ...state, phase: getLurePhase(state, now) }));
  }

  shiftTimers(offset: number): void {
    shiftLureTimers(this.states, offset);
  }

  destroy(): void {
    for (const view of this.views) {
      view.image.destroy();
      view.ring.destroy();
      view.wave.destroy();
      view.label.destroy();
    }
    this.views.length = 0;
    this.states.length = 0;
  }
}
