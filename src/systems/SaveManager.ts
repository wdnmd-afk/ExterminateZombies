/**
 * 唯一的持久化出入口。当前基于 localStorage,将来接后端只需改这一层。
 * 全程 try/catch 兜底:隐私模式禁用 storage 时不崩,退化为内存态。
 */

const PREFIX = 'ez:'; // ExterminateZombies 命名空间,避免与其它站点冲突

/** storage 不可用时的内存兜底。 */
const memoryFallback = new Map<string, string>();

function readRaw(key: string): string | null {
  try {
    return window.localStorage.getItem(PREFIX + key);
  } catch {
    return memoryFallback.get(key) ?? null;
  }
}

function writeRaw(key: string, value: string): void {
  try {
    window.localStorage.setItem(PREFIX + key, value);
  } catch {
    memoryFallback.set(key, value);
  }
}

export const SaveManager = {
  /** 读取并 JSON 解析;缺失或损坏时返回 fallback。 */
  load<T>(key: string, fallback: T): T {
    const raw = readRaw(key);
    if (raw === null) return fallback;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return fallback;
    }
  },

  /** JSON 序列化后写入。 */
  save<T>(key: string, value: T): void {
    try {
      writeRaw(key, JSON.stringify(value));
    } catch {
      /* 序列化失败(如循环引用)时静默忽略,不影响游戏。 */
    }
  },
};

/** 存档键名常量,避免散落的字符串。 */
export const SAVE_KEYS = {
  keybinds: 'keybinds',
  unlockedLevels: 'unlockedLevels',
  endlessBestWave: 'endlessBestWave',
} as const;
