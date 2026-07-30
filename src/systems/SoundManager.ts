import {
  DEFAULT_AUDIO_SETTINGS,
  SAVE_KEYS,
  SaveManager,
  type AudioSettings,
} from './SaveManager';

export type SoundEffect =
  | 'uiMove'
  | 'uiConfirm'
  | 'pistol'
  | 'smg'
  | 'rifle'
  | 'shotgun'
  | 'ak47'
  | 'barrett'
  | 'rpg'
  | 'm79'
  | 'impact'
  | 'explosion'
  | 'enemyAttack'
  | 'pickup'
  | 'hurt'
  | 'wave';

export type MusicMode = 'menu' | 'battle';

interface SynthPreset {
  type: OscillatorType;
  startFrequency: number;
  endFrequency: number;
  duration: number;
  gain: number;
  minInterval: number;
}

const SYNTH_PRESETS: Record<SoundEffect, SynthPreset> = {
  uiMove: { type: 'sine', startFrequency: 330, endFrequency: 390, duration: 0.05, gain: 0.035, minInterval: 35 },
  uiConfirm: { type: 'triangle', startFrequency: 260, endFrequency: 520, duration: 0.1, gain: 0.06, minInterval: 70 },
  pistol: { type: 'square', startFrequency: 185, endFrequency: 72, duration: 0.09, gain: 0.075, minInterval: 90 },
  smg: { type: 'square', startFrequency: 220, endFrequency: 92, duration: 0.055, gain: 0.045, minInterval: 50 },
  rifle: { type: 'sawtooth', startFrequency: 150, endFrequency: 54, duration: 0.085, gain: 0.07, minInterval: 70 },
  shotgun: { type: 'sawtooth', startFrequency: 105, endFrequency: 34, duration: 0.16, gain: 0.11, minInterval: 150 },
  ak47: { type: 'sawtooth', startFrequency: 165, endFrequency: 48, duration: 0.09, gain: 0.078, minInterval: 80 },
  barrett: { type: 'square', startFrequency: 88, endFrequency: 24, duration: 0.22, gain: 0.13, minInterval: 500 },
  rpg: { type: 'sawtooth', startFrequency: 72, endFrequency: 30, duration: 0.24, gain: 0.105, minInterval: 700 },
  m79: { type: 'triangle', startFrequency: 115, endFrequency: 42, duration: 0.16, gain: 0.09, minInterval: 500 },
  impact: { type: 'triangle', startFrequency: 420, endFrequency: 160, duration: 0.045, gain: 0.026, minInterval: 32 },
  explosion: { type: 'sawtooth', startFrequency: 95, endFrequency: 28, duration: 0.28, gain: 0.12, minInterval: 90 },
  enemyAttack: { type: 'triangle', startFrequency: 180, endFrequency: 310, duration: 0.13, gain: 0.055, minInterval: 90 },
  pickup: { type: 'sine', startFrequency: 420, endFrequency: 780, duration: 0.12, gain: 0.06, minInterval: 80 },
  hurt: { type: 'sawtooth', startFrequency: 120, endFrequency: 52, duration: 0.2, gain: 0.09, minInterval: 160 },
  wave: { type: 'triangle', startFrequency: 210, endFrequency: 420, duration: 0.24, gain: 0.065, minInterval: 280 },
};

class GameSoundManager {
  private context: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private effectsGain: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private settings: AudioSettings = { ...DEFAULT_AUDIO_SETTINGS };
  private lastPlayedAt = new Map<SoundEffect, number>();
  private musicNodes: OscillatorNode[] = [];
  private requestedMusic: MusicMode = 'menu';
  private activeMusic: MusicMode | null = null;
  private musicPaused = false;
  private initialized = false;

  initialize(): void {
    if (this.initialized || typeof window === 'undefined') return;
    this.initialized = true;
    this.settings = SaveManager.load<AudioSettings>(SAVE_KEYS.audioSettings, { ...DEFAULT_AUDIO_SETTINGS });

    const unlock = (): void => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
      void this.unlock();
    };
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
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
    this.applyBusVolumes();
  }

  play(effect: SoundEffect): void {
    const context = this.context;
    const effectsGain = this.effectsGain;
    if (!context || !effectsGain || context.state !== 'running') return;

    const preset = SYNTH_PRESETS[effect];
    const nowMs = performance.now();
    if (nowMs - (this.lastPlayedAt.get(effect) ?? -Infinity) < preset.minInterval) return;
    this.lastPlayedAt.set(effect, nowMs);

    const oscillator = context.createOscillator();
    const envelope = context.createGain();
    const startAt = context.currentTime;
    oscillator.type = preset.type;
    oscillator.frequency.setValueAtTime(Math.max(1, preset.startFrequency), startAt);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, preset.endFrequency), startAt + preset.duration);
    envelope.gain.setValueAtTime(preset.gain, startAt);
    envelope.gain.exponentialRampToValueAtTime(0.0001, startAt + preset.duration);
    oscillator.connect(envelope);
    envelope.connect(effectsGain);
    oscillator.start(startAt);
    oscillator.stop(startAt + preset.duration + 0.02);
  }

  setMusic(mode: MusicMode): void {
    this.requestedMusic = mode;
    if (this.context?.state === 'running') this.startMusic(mode);
  }

  pauseMusic(paused: boolean): void {
    this.musicPaused = paused;
    this.applyBusVolumes();
  }

  private async unlock(): Promise<void> {
    const context = this.ensureContext();
    if (!context) return;
    try {
      if (context.state !== 'running') await context.resume();
    } catch {
      return;
    }
    this.startMusic(this.requestedMusic);
  }

  private ensureContext(): AudioContext | null {
    if (this.context) return this.context;
    if (typeof window === 'undefined') return null;

    const AudioContextConstructor = window.AudioContext
      ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextConstructor) return null;

    try {
      this.context = new AudioContextConstructor();
    } catch {
      return null;
    }
    this.masterGain = this.context.createGain();
    this.effectsGain = this.context.createGain();
    this.musicGain = this.context.createGain();
    this.effectsGain.connect(this.masterGain);
    this.musicGain.connect(this.masterGain);
    this.masterGain.connect(this.context.destination);
    this.applyBusVolumes();
    return this.context;
  }

  private applyBusVolumes(): void {
    const now = this.context?.currentTime ?? 0;
    this.masterGain?.gain.setTargetAtTime(this.settings.masterVolume, now, 0.02);
    this.effectsGain?.gain.setTargetAtTime(this.settings.effectsVolume, now, 0.02);
    this.musicGain?.gain.setTargetAtTime(this.musicPaused ? 0 : this.settings.musicVolume, now, 0.04);
  }

  private startMusic(mode: MusicMode): void {
    const context = this.context;
    const musicGain = this.musicGain;
    if (!context || !musicGain || context.state !== 'running' || this.activeMusic === mode) return;

    for (const oscillator of this.musicNodes) {
      try {
        oscillator.stop();
      } catch {
        // 已停止或浏览器正在关闭音频上下文时无需重复处理。
      }
    }
    this.musicNodes = [];
    this.activeMusic = mode;

    const notes = mode === 'battle'
      ? [{ frequency: 49, type: 'sawtooth' as OscillatorType, gain: 0.018 }, { frequency: 73.5, type: 'triangle' as OscillatorType, gain: 0.014 }]
      : [{ frequency: 55, type: 'sine' as OscillatorType, gain: 0.024 }, { frequency: 82.4, type: 'triangle' as OscillatorType, gain: 0.012 }];

    for (const note of notes) {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = note.type;
      oscillator.frequency.setValueAtTime(note.frequency, context.currentTime);
      gain.gain.setValueAtTime(note.gain, context.currentTime);
      oscillator.connect(gain);
      gain.connect(musicGain);
      oscillator.start();
      this.musicNodes.push(oscillator);
    }
  }
}

function clampVolume(value: number): number {
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
}

export const SoundManager = new GameSoundManager();
