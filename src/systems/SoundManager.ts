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

// Phaser creates a PannerNode for Web Audio sounds. The game already applies its
// own distance mix, so keep Phaser's spatial node from applying a second falloff.
const FLAT_SPATIAL_SOURCE: Phaser.Types.Sound.SpatialSoundConfig = {
  distanceModel: 'linear',
  refDistance: 100000,
  maxDistance: 100000,
  rolloffFactor: 0,
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

interface PendingEffect {
  effect: SoundEffect;
  cooldownKey: string;
  x?: number;
  y?: number;
  requestedAt: number;
}

interface PendingLoop {
  handle: SoundLoopHandle;
  type: SoundLoop;
  x: number;
  y: number;
}

interface SpatialMix {
  pan: number;
  volume: number;
}

class GameSoundManager {
  private static readonly PENDING_EFFECT_TTL_MS = 1400;
  private static readonly MAX_PENDING_EFFECTS = 12;

  private manager: Phaser.Sound.BaseSoundManager | null = null;
  private settings: AudioSettings = { ...DEFAULT_AUDIO_SETTINGS };
  private enabled = DEFAULT_AUDIO_SETTINGS.enabled;
  private lastPlayedAt = new Map<string, number>();
  private lastVariantIndex = new Map<SoundEffect, number>();
  private activeEffects = new Map<SoundEffect, ActiveEffect[]>();
  private activeLoops = new Map<number, ActiveLoop>();
  private pendingEffects = new Map<string, PendingEffect>();
  private pendingLoops = new Map<number, PendingLoop>();
  private requestedMusic: MusicMode = 'menu';
  private activeMusic: MusicMode | null = null;
  private musicSound: ManagedSound | null = null;
  private musicPaused = false;
  private listenerX = GAME_WIDTH / 2;
  private listenerY = GAME_HEIGHT / 2;
  private nextLoopId = 1;
  private unlockFallbackArmed = false;

  initialize(manager: Phaser.Sound.BaseSoundManager): void {
    if (this.manager === manager) {
      this.applyVolumes();
      return;
    }

    this.manager?.off(Phaser.Sound.Events.UNLOCKED, this.handleUnlocked, this);
    this.disarmUnlockFallback();
    this.manager = manager;
    this.settings = SaveManager.load<AudioSettings>(SAVE_KEYS.audioSettings, { ...DEFAULT_AUDIO_SETTINGS });
    this.enabled = this.settings.enabled;
    this.pendingEffects.clear();
    this.pendingLoops.clear();
    this.manager.pauseOnBlur = true;
    this.manager.on(Phaser.Sound.Events.UNLOCKED, this.handleUnlocked, this);
    this.armUnlockFallback();
    this.applyVolumes();
  }

  /** Preload 完成后重试一次，覆盖“先解锁、后解码”的启动时序。 */
  assetsReady(): void {
    this.recoverPendingAudio();
  }

  getSettings(): AudioSettings {
    return { ...this.settings, enabled: this.enabled };
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    this.settings = { ...this.settings, enabled };
    SaveManager.save(SAVE_KEYS.audioSettings, this.settings);
    this.applyVolumes();
    if (enabled) this.ensureMusic();
  }

  toggleEnabled(): boolean {
    this.setEnabled(!this.enabled);
    return this.enabled;
  }

  setSettings(settings: AudioSettings): void {
    this.settings = {
      enabled: this.enabled,
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
    return this.playEffect(effect, definition.spatial ? this.getSpatialMix(x, y) : null, cooldownKey, x, y);
  }

  stop(effect: SoundEffect): void {
    for (const [key, pending] of this.pendingEffects) {
      if (pending.effect === effect) this.pendingEffects.delete(key);
    }
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
    if (!manager || this.isPlaybackLocked() || !this.isAssetReady(definition.asset)) {
      const handle = { id: this.nextLoopId++ } satisfies SoundLoopHandle;
      this.pendingLoops.set(handle.id, { handle, type, x, y });
      return handle;
    }

    const handle = { id: this.nextLoopId++ } satisfies SoundLoopHandle;
    return this.startLoopNow(handle, type, x, y) ? handle : null;
  }

  stopLoop(handle: SoundLoopHandle | null): void {
    if (!handle) return;
    this.pendingLoops.delete(handle.id);
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
    this.disarmUnlockFallback();
    this.recoverPendingAudio();
  }

  private recoverPendingAudio(): void {
    if (this.isPlaybackLocked()) return;
    this.ensureMusic();
    this.flushPendingLoops();
    this.flushPendingEffects();
  }

  /**
   * Phaser 默认等待 body 的 click/keydown 解锁音频；Canvas 输入链可能只产生 pointer
   * 事件。捕获首个真实手势并直接恢复 AudioContext，避免 locked 永久卡住。
   */
  private readonly handleUnlockGesture = (): void => {
    const context = this.getAudioContext();
    if (!context) {
      if (!this.manager?.locked) this.handleUnlocked();
      return;
    }

    if (context.state === 'running') {
      this.handleUnlocked();
      return;
    }

    void context.resume().then(() => {
      if (context.state === 'running') this.handleUnlocked();
    }).catch(() => {
      // 浏览器拒绝本次恢复时保留监听，等待下一次真实用户手势。
    });
  };

  private armUnlockFallback(): void {
    if (this.unlockFallbackArmed || typeof document === 'undefined' || !this.isPlaybackLocked()) return;
    this.unlockFallbackArmed = true;
    document.addEventListener('pointerdown', this.handleUnlockGesture, true);
    document.addEventListener('keydown', this.handleUnlockGesture, true);
    document.addEventListener('touchend', this.handleUnlockGesture, true);
  }

  private disarmUnlockFallback(): void {
    if (!this.unlockFallbackArmed || typeof document === 'undefined') return;
    this.unlockFallbackArmed = false;
    document.removeEventListener('pointerdown', this.handleUnlockGesture, true);
    document.removeEventListener('keydown', this.handleUnlockGesture, true);
    document.removeEventListener('touchend', this.handleUnlockGesture, true);
  }

  private playEffect(effect: SoundEffect, spatial: SpatialMix | null, cooldownKey: string, x?: number, y?: number): boolean {
    const manager = this.manager;
    const definition: AudioEventDef = AUDIO_EVENT_DEFS[effect];
    if (!this.enabled) return false;
    if (!manager || this.isPlaybackLocked()) {
      this.queuePendingEffect(effect, spatial, cooldownKey, x, y);
      return false;
    }

    const now = this.getNow();
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
      source: FLAT_SPATIAL_SOURCE,
    });
    if (!played) {
      removeFromTracking();
      sound.destroy();
      return false;
    }
    this.applyVolumes();
    return true;
  }

  private queuePendingEffect(effect: SoundEffect, spatial: SpatialMix | null, cooldownKey: string, x?: number, y?: number): void {
    const definition: AudioEventDef = AUDIO_EVENT_DEFS[effect];
    const shouldReplayAfterUnlock = (definition.priority ?? 3) <= 2
      || effect === 'wave'
      || effect === 'levelClear'
      || effect === 'gameOver';
    if (!shouldReplayAfterUnlock) return;

    this.pendingEffects.set(cooldownKey, {
      effect,
      cooldownKey,
      x: spatial ? x : undefined,
      y: spatial ? y : undefined,
      requestedAt: this.getNow(),
    });

    while (this.pendingEffects.size > GameSoundManager.MAX_PENDING_EFFECTS) {
      const oldestKey = this.pendingEffects.keys().next().value as string | undefined;
      if (!oldestKey) break;
      this.pendingEffects.delete(oldestKey);
    }
  }

  private flushPendingEffects(): void {
    if (this.pendingEffects.size === 0) return;

    const now = this.getNow();
    const pending = [...this.pendingEffects.values()];
    this.pendingEffects.clear();

    for (const entry of pending) {
      if (now - entry.requestedAt > GameSoundManager.PENDING_EFFECT_TTL_MS) continue;
      if (entry.x === undefined || entry.y === undefined) {
        this.playEffect(entry.effect, null, entry.cooldownKey);
      } else {
        this.playAt(entry.effect, entry.x, entry.y);
      }
    }
  }

  private flushPendingLoops(): void {
    if (this.pendingLoops.size === 0) return;

    for (const pending of [...this.pendingLoops.values()]) {
      if (!this.pendingLoops.has(pending.handle.id)) continue;
      if (this.startLoopNow(pending.handle, pending.type, pending.x, pending.y)) {
        this.pendingLoops.delete(pending.handle.id);
      }
    }
  }

  private startLoopNow(handle: SoundLoopHandle, type: SoundLoop, x: number, y: number): boolean {
    const manager = this.manager;
    const definition = LOOP_DEFS[type];
    if (!this.enabled || !manager || this.isPlaybackLocked() || !this.isAssetReady(definition.asset)) return false;

    const mix = this.getSpatialMix(x, y, definition.maxDistance);
    const sound = manager.add(definition.asset) as ManagedSound;
    const played = sound.play({
      loop: true,
      volume: this.settings.effectsVolume * definition.volume * mix.volume,
      pan: mix.pan,
      source: FLAT_SPATIAL_SOURCE,
    });
    if (!played) {
      sound.destroy();
      return false;
    }

    this.activeLoops.set(handle.id, { sound, type, x, y });
    sound.once(Phaser.Sound.Events.DESTROY, () => this.activeLoops.delete(handle.id));
    if (this.musicPaused) sound.pause();
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
    if (!this.enabled || !manager || this.isPlaybackLocked() || !this.isAssetReady(definition.asset)) return;

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
      source: FLAT_SPATIAL_SOURCE,
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
    if (this.manager) this.manager.volume = this.enabled ? this.settings.masterVolume : 0;
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

  private isPlaybackLocked(): boolean {
    const manager = this.manager;
    if (!manager) return true;
    if (!manager.locked) return false;
    return this.getAudioContext()?.state !== 'running';
  }

  private getAudioContext(): AudioContext | null {
    const manager = this.manager;
    if (!manager || !('context' in manager)) return null;
    const context = (manager as Phaser.Sound.WebAudioSoundManager).context;
    return context && typeof context.resume === 'function' ? context : null;
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

  private getNow(): number {
    return typeof performance === 'undefined' ? Date.now() : performance.now();
  }
}

function clampVolume(value: number): number {
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
}

function randomSigned(range: number): number {
  return range <= 0 ? 0 : (Math.random() * 2 - 1) * range;
}

export const SoundManager = new GameSoundManager();
