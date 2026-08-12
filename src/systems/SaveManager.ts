/**
 * 唯一的持久化出入口。当前基于 localStorage，未来接后端时由此层迁移。
 * 读取时永远校验已知数据结构，避免损坏或旧格式存档把非法值带入运行时。
 */

import { DEFAULT_KEYBINDS, isKnownKeybindCode, type Keybinds } from '../config/keybinds';

const PREFIX = 'ez:';
export const CURRENT_SAVE_VERSION = 2;

export interface AudioSettings {
  masterVolume: number;
  effectsVolume: number;
  musicVolume: number;
}

export type AccessibilityLevel = 'off' | 'low' | 'medium' | 'high';
export interface AccessibilitySettings {
  shake: AccessibilityLevel;
  flash: AccessibilityLevel;
  blood: boolean;
  slowMotion: AccessibilityLevel;
}

export const DEFAULT_ACCESSIBILITY_SETTINGS: AccessibilitySettings = {
  shake: 'high', flash: 'high', blood: true, slowMotion: 'high',
};

export const DEFAULT_AUDIO_SETTINGS: AudioSettings = {
  masterVolume: 0.8,
  effectsVolume: 0.8,
  musicVolume: 0.45,
};

/** 存档键名常量，避免散落的字符串。 */
export const SAVE_KEYS = {
  saveVersion: 'saveVersion',
  keybinds: 'keybinds',
  unlockedLevels: 'unlockedLevels',
  endlessBestWave: 'endlessBestWave',
  audioSettings: 'audioSettings',
  accessibilitySettings: 'accessibilitySettings',
} as const;

/** storage 不可用时的内存兜底。 */
const memoryFallback = new Map<string, string>();
let migrationChecked = false;

function readRaw(key: string): string | null {
  try {
    if (typeof window === 'undefined') return memoryFallback.get(key) ?? null;
    return window.localStorage.getItem(PREFIX + key);
  } catch {
    return memoryFallback.get(key) ?? null;
  }
}

function writeRaw(key: string, value: string): void {
  try {
    if (typeof window === 'undefined') {
      memoryFallback.set(key, value);
      return;
    }
    window.localStorage.setItem(PREFIX + key, value);
  } catch {
    memoryFallback.set(key, value);
  }
}

function removeRaw(key: string): void {
  memoryFallback.delete(key);
  try {
    if (typeof window !== 'undefined') window.localStorage.removeItem(PREFIX + key);
  } catch {
    // localStorage 不可用时内存兜底已在上方清理。
  }
}

function parseRaw(key: string): unknown {
  const raw = readRaw(key);
  if (raw === null) return undefined;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return undefined;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function normalizeKeybinds(value: unknown): Keybinds {
  const source = isRecord(value) ? value : {};
  const normalized = { ...DEFAULT_KEYBINDS };
  for (const action of Object.keys(DEFAULT_KEYBINDS) as Array<keyof Keybinds>) {
    const candidate = source[action];
    if (typeof candidate === 'string' && isKnownKeybindCode(candidate)) {
      normalized[action] = candidate;
    }
  }
  return normalized;
}

export function normalizeUnlockedLevels(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((entry): entry is string => typeof entry === 'string'))];
}

export function normalizeBestWave(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(0, Math.floor(value))
    : 0;
}

export function normalizeAudioSettings(value: unknown): AudioSettings {
  const source = isRecord(value) ? value : {};
  const clampVolume = (candidate: unknown, fallback: number): number => (
    typeof candidate === 'number' && Number.isFinite(candidate)
      ? Math.min(1, Math.max(0, candidate))
      : fallback
  );
  return {
    masterVolume: clampVolume(source.masterVolume, DEFAULT_AUDIO_SETTINGS.masterVolume),
    effectsVolume: clampVolume(source.effectsVolume, DEFAULT_AUDIO_SETTINGS.effectsVolume),
    musicVolume: clampVolume(source.musicVolume, DEFAULT_AUDIO_SETTINGS.musicVolume),
  };
}

export function normalizeAccessibilitySettings(value: unknown): AccessibilitySettings {
  const source = isRecord(value) ? value : {};
  const level = (candidate: unknown, fallback: AccessibilityLevel): AccessibilityLevel => (
    candidate === 'off' || candidate === 'low' || candidate === 'medium' || candidate === 'high'
      ? candidate : fallback
  );
  return {
    shake: level(source.shake, DEFAULT_ACCESSIBILITY_SETTINGS.shake),
    flash: level(source.flash, DEFAULT_ACCESSIBILITY_SETTINGS.flash),
    blood: typeof source.blood === 'boolean' ? source.blood : DEFAULT_ACCESSIBILITY_SETTINGS.blood,
    slowMotion: level(source.slowMotion, DEFAULT_ACCESSIBILITY_SETTINGS.slowMotion),
  };
}

function normalizeValue<T>(key: string, value: unknown, fallback: T): T {
  switch (key) {
    case SAVE_KEYS.keybinds:
      return normalizeKeybinds(value) as T;
    case SAVE_KEYS.unlockedLevels:
      return normalizeUnlockedLevels(value) as T;
    case SAVE_KEYS.endlessBestWave:
      return normalizeBestWave(value) as T;
    case SAVE_KEYS.audioSettings:
      return normalizeAudioSettings(value) as T;
    case SAVE_KEYS.accessibilitySettings:
      return normalizeAccessibilitySettings(value) as T;
    case SAVE_KEYS.saveVersion:
      return CURRENT_SAVE_VERSION as T;
    default:
      return value === undefined ? fallback : value as T;
  }
}

function migrateLegacySave(): void {
  if (migrationChecked) return;
  migrationChecked = true;

  const storedVersion = parseRaw(SAVE_KEYS.saveVersion);
  const version = typeof storedVersion === 'number' && Number.isInteger(storedVersion)
    ? storedVersion
    : 0;
  if (version >= CURRENT_SAVE_VERSION) return;

  // 旧版本使用同名独立键；归一化后原位写回即可完成兼容迁移。
  writeRaw(SAVE_KEYS.keybinds, JSON.stringify(normalizeKeybinds(parseRaw(SAVE_KEYS.keybinds))));
  writeRaw(SAVE_KEYS.unlockedLevels, JSON.stringify(normalizeUnlockedLevels(parseRaw(SAVE_KEYS.unlockedLevels))));
  writeRaw(SAVE_KEYS.endlessBestWave, JSON.stringify(normalizeBestWave(parseRaw(SAVE_KEYS.endlessBestWave))));
  writeRaw(SAVE_KEYS.audioSettings, JSON.stringify(normalizeAudioSettings(parseRaw(SAVE_KEYS.audioSettings))));
  writeRaw(SAVE_KEYS.accessibilitySettings, JSON.stringify(normalizeAccessibilitySettings(parseRaw(SAVE_KEYS.accessibilitySettings))));
  writeRaw(SAVE_KEYS.saveVersion, JSON.stringify(CURRENT_SAVE_VERSION));
}

export const SaveManager = {
  /** 在启动阶段执行一次旧存档迁移；重复调用无副作用。 */
  initialize(): void {
    migrateLegacySave();
  },

  /** 读取、解析并校验已知存档；缺失或损坏时返回安全值。 */
  load<T>(key: string, fallback: T): T {
    migrateLegacySave();
    return normalizeValue(key, parseRaw(key), fallback);
  },

  /** JSON 序列化后写入。 */
  save<T>(key: string, value: T): void {
    migrateLegacySave();
    try {
      writeRaw(key, JSON.stringify(normalizeValue(key, value, value)));
    } catch {
      /* 序列化失败（如循环引用）时保留旧值，不影响本局游戏。 */
    }
  },

  /** 仅清除关卡进度与无尽纪录，保留键位和音量偏好。 */
  resetProgress(initialLevelId: string): void {
    this.save(SAVE_KEYS.unlockedLevels, [initialLevelId]);
    this.save(SAVE_KEYS.endlessBestWave, 0);
  },

  /** 清除所有项目存档并恢复当前版本默认结构。 */
  resetAll(initialLevelId: string): void {
    Object.values(SAVE_KEYS).forEach(removeRaw);
    migrationChecked = false;
    this.save(SAVE_KEYS.keybinds, { ...DEFAULT_KEYBINDS });
    this.save(SAVE_KEYS.unlockedLevels, [initialLevelId]);
    this.save(SAVE_KEYS.endlessBestWave, 0);
    this.save(SAVE_KEYS.audioSettings, { ...DEFAULT_AUDIO_SETTINGS });
  },
};
