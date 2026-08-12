import Phaser from 'phaser';
import {
  AUDIO_EVENT_DEFS,
  LOOP_DEFS,
  MUSIC_DEFS,
  type AudioAssetKey,
  type AudioEventDef,
  type MusicMode,
  type SoundEffect,
  type SoundLoop,
} from '../config/audio';
import { GAME_HEIGHT, GAME_WIDTH } from '../constants';
import {
  DEFAULT_AUDIO_SETTINGS,
  SAVE_KEYS,
  SaveManager,
  type AudioSettings,
} from './SaveManager';

export type { MusicMode, SoundEffect } from '../config/audio';

type ManagedSound = Phaser.Sound.BaseSound & {
  setVolume: (value: number) => ManagedSound;
  setPan: (value: number) => ManagedSound;
};

interface ActiveEffect {
  sound: ManagedSound;
  localVolume: number;
  priority: number;
}

interface ActiveLoop {
  sound: ManagedSound;
  type: SoundLoop;
  x: number;
  y: number;
}

export interface SoundLoopHandle {
  readonly id: number;
}

interface SpatialMix {
  pan: number;
  volume: number;
}

class GameSoundManager {
  private manager: Phaser.Sound.BaseSoundManager | null = null;
  private settings: AudioSettings = { ...DEFAULT_AUDIO_SETTINGS };
  private lastPlayedAt = new Map<string, number>();
  private lastVariantIndex = new Map<SoundEffect, number>();
  private activeEffects = new Map<SoundEffect, ActiveEffect[]>();
  private activeLoops = new Map<number, ActiveLoop>();
  private requestedMusic: MusicMode = 'menu';
  private activeMusic: MusicMode | null = null;
  private musicSound: ManagedSound | null = null;
  private musicPaused = false;
  private listenerX = GAME_WIDTH / 2;
  private listenerY = GAME_HEIGHT / 2;
  private nextLoopId = 1;

  initialize(manager: Phaser.Sound.BaseSoundManager): void {
    if (this.manager === manager) {
      this.applyVolumes();
      return;
    }

    this.manager?.off(Phaser.Sound.Events.UNLOCKED, this.handleUnlocked, this);
    this.manager = manager;
    this.settings = SaveManager.load<AudioSettings>(SAVE_KEYS.audioSettings, { ...DEFAULT_AUDIO_SETTINGS });
    this.manager.pauseOnBlur = true;
    this.manager.on(Phaser.Sound.Events.UNLOCKED, this.handleUnlocked, this);
    this.applyVolumes();
  }

  getSettings(): AudioSettings {
    return { ...this.settings };
  }

  setSettings(settings: AudioSettings): void {
    this.settings = {
      masterVolume: clampVolume(settings.masterVolume),
      effectsVolume: clampVolume(settings.effectsVolume),
      musicVolume: clampVolume(settings.musicVolume),
    };
    SaveManager.save(SAVE_KEYS.audioSettings, this.settings);
    this.applyVolumes();
  }

  play(effect: SoundEffect): boolean {
    return this.playEffect(effect, null, effect);
  }

  playAt(effect: SoundEffect, x: number, y: number): boolean {
    const definition: AudioEventDef = AUDIO_EVENT_DEFS[effect];
    const cooldownKey = `${effect}:${Math.round(x / 96)}:${Math.round(y / 96)}`;
    return this.playEffect(effect, definition.spatial ? this.getSpatialMix(x, y) : null, cooldownKey);
  }

  stop(effect: SoundEffect): void {
    const active = this.activeEffects.get(effect);
    if (!active) return;
    this.activeEffects.delete(effect);
    for (const entry of [...active]) {
      entry.sound.stop();
      entry.sound.destroy();
    }
  }

  setListenerPosition(x: number, y: number): void {
    this.listenerX = x;
    this.listenerY = y;
    this.manager?.setListenerPosition(x, y);

    // 火焰等固定世界循环需要跟随玩家移动实时更新声像和距离音量。
    for (const loop of this.activeLoops.values()) {
      const mix = this.getSpatialMix(loop.x, loop.y, LOOP_DEFS[loop.type].maxDistance);
      loop.sound.setPan(mix.pan);
      loop.sound.setVolume(this.settings.effectsVolume * LOOP_DEFS[loop.type].volume * mix.volume);
    }
  }

  startLoopAt(type: SoundLoop, x: number, y: number): SoundLoopHandle | null {
    const manager = this.manager;
    const definition = LOOP_DEFS[type];
    if (!manager || manager.locked || !this.isAssetReady(definition.asset)) return null;

    const mix = this.getSpatialMix(x, y, definition.maxDistance);
    const sound = manager.add(definition.asset) as ManagedSound;
    const played = sound.play({
      loop: true,
      volume: this.settings.effectsVolume * definition.volume * mix.volume,
      pan: mix.pan,
    });
    if (!played) {
      sound.destroy();
      return null;
    }

    const handle = { id: this.nextLoopId++ } satisfies SoundLoopHandle;
    this.activeLoops.set(handle.id, { sound, type, x, y });
    sound.once(Phaser.Sound.Events.DESTROY, () => this.activeLoops.delete(handle.id));
    if (this.musicPaused) sound.pause();
    return handle;
  }

  stopLoop(handle: SoundLoopHandle | null): void {
    if (!handle) return;
    const active = this.activeLoops.get(handle.id);
    if (!active) return;
    this.activeLoops.delete(handle.id);
    active.sound.stop();
    active.sound.destroy();
  }

  setMusic(mode: MusicMode): void {
    this.requestedMusic = mode;
    this.ensureMusic();
  }

  pauseMusic(paused: boolean): void {
    this.musicPaused = paused;
    if (paused) {
      if (this.musicSound?.isPlaying) this.musicSound.pause();
      for (const loop of this.activeLoops.values()) {
        if (loop.sound.isPlaying) loop.sound.pause();
      }
      return;
    }

    if (this.musicSound?.isPaused) this.musicSound.resume();
    for (const loop of this.activeLoops.values()) {
      if (loop.sound.isPaused) loop.sound.resume();
    }
    this.ensureMusic();
  }

  private handleUnlocked(): void {
    this.ensureMusic();
  }

  private playEffect(effect: SoundEffect, spatial: SpatialMix | null, cooldownKey: string): boolean {
    const manager = this.manager;
    const definition: AudioEventDef = AUDIO_EVENT_DEFS[effect];
    if (!manager || manager.locked) return false;

    const now = typeof performance === 'undefined' ? Date.now() : performance.now();
    if (now - (this.lastPlayedAt.get(cooldownKey) ?? -Infinity) < definition.minInterval) return false;

    const variantIndex = this.chooseVariantIndex(effect, definition.variants.length);
    const asset = definition.variants[variantIndex];
    if (!this.isAssetReady(asset)) return false;

    this.lastPlayedAt.set(cooldownKey, now);
    this.lastVariantIndex.set(effect, variantIndex);
    const active = this.activeEffects.get(effect) ?? [];
    while (active.length >= definition.maxVoices) {
      const oldest = active.shift();
      oldest?.sound.stop();
      oldest?.sound.destroy();
    }

    const localVolume = definition.volume * (spatial?.volume ?? 1);
    const rate = Math.max(0.25, definition.rate + randomSigned(definition.rateJitter ?? 0));
    const sound = manager.add(asset) as ManagedSound;
    const entry = { sound, localVolume, priority: definition.priority ?? 3 } satisfies ActiveEffect;
    active.push(entry);
    this.activeEffects.set(effect, active);

    const removeFromTracking = (): void => {
      const current = this.activeEffects.get(effect);
      if (!current) return;
      const index = current.findIndex((candidate) => candidate.sound === sound);
      if (index >= 0) current.splice(index, 1);
      if (current.length === 0) this.activeEffects.delete(effect);
    };
    sound.once(Phaser.Sound.Events.DESTROY, removeFromTracking);
    sound.once(Phaser.Sound.Events.COMPLETE, () => {
      removeFromTracking();
      if (!sound.pendingRemove) sound.destroy();
    });

    const played = sound.play({
      volume: this.settings.effectsVolume * localVolume * this.getPriorityVolume(entry.priority),
      rate,
      pan: spatial?.pan ?? 0,
    });
    if (!played) {
      removeFromTracking();
      sound.destroy();
      return false;
    }
    this.applyVolumes();
    return true;
  }

  /** 高优先级事件出现时压低低优先级事件，避免受伤与 Boss 预警被枪声淹没。 */
  private getPriorityVolume(priority: number): number {
    let highestActive = 4;
    for (const [effect, entries] of this.activeEffects) {
      if (entries.length === 0) continue;
      highestActive = Math.min(highestActive, (AUDIO_EVENT_DEFS[effect] as AudioEventDef).priority ?? 3);
    }
    if (priority <= highestActive) return 1;
    return highestActive === 1 ? 0.28 : highestActive === 2 ? 0.5 : 0.78;
  }

  private chooseVariantIndex(effect: SoundEffect, variantCount: number): number {
    if (variantCount <= 1) return 0;
    const previous = this.lastVariantIndex.get(effect) ?? -1;
    if (previous < 0) return Math.floor(Math.random() * variantCount);
    const offset = 1 + Math.floor(Math.random() * (variantCount - 1));
    return (previous + offset) % variantCount;
  }

  private ensureMusic(): void {
    const manager = this.manager;
    const definition = MUSIC_DEFS[this.requestedMusic];
    if (!manager || manager.locked || !this.isAssetReady(definition.asset)) return;

    if (this.activeMusic === this.requestedMusic && this.musicSound && !this.musicSound.pendingRemove) {
      this.musicSound.setVolume(this.settings.musicVolume * definition.volume);
      if (!this.musicPaused && this.musicSound.isPaused) this.musicSound.resume();
      return;
    }

    if (this.musicSound) {
      this.musicSound.stop();
      this.musicSound.destroy();
    }

    const sound = manager.add(definition.asset) as ManagedSound;
    const played = sound.play({
      loop: true,
      volume: this.settings.musicVolume * definition.volume,
    });
    if (!played) {
      sound.destroy();
      this.musicSound = null;
      this.activeMusic = null;
      return;
    }

    this.musicSound = sound;
    this.activeMusic = this.requestedMusic;
    if (this.musicPaused) sound.pause();
  }

  private applyVolumes(): void {
    if (this.manager) this.manager.volume = this.settings.masterVolume;
    if (this.musicSound && this.activeMusic) {
      this.musicSound.setVolume(this.settings.musicVolume * MUSIC_DEFS[this.activeMusic].volume);
    }
    for (const entries of this.activeEffects.values()) {
      for (const entry of entries) {
        entry.sound.setVolume(this.settings.effectsVolume * entry.localVolume * this.getPriorityVolume(entry.priority));
      }
    }
    this.setListenerPosition(this.listenerX, this.listenerY);
  }

  private isAssetReady(asset: AudioAssetKey): boolean {
    return this.manager?.game.cache.audio.exists(asset) ?? false;
  }

  private getSpatialMix(x: number, y: number, maxDistance = 980): SpatialMix {
    const dx = x - this.listenerX;
    const dy = y - this.listenerY;
    const distance = Math.sqrt(dx * dx + dy * dy);
    return {
      pan: Phaser.Math.Clamp(dx / (GAME_WIDTH * 0.55), -1, 1) * 0.76,
      volume: Phaser.Math.Clamp(1 - distance / maxDistance * 0.65, 0.28, 1),
    };
  }
}

function clampVolume(value: number): number {
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
}

function randomSigned(range: number): number {
  return range <= 0 ? 0 : (Math.random() * 2 - 1) * range;
}

export const SoundManager = new GameSoundManager();
