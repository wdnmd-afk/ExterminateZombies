import { LEVELS } from '../config/levels';
import { WEAPONS, type WeaponId } from '../config/weapons';
import { SAVE_KEYS, SaveManager } from './SaveManager';

const CHEAT_CODE = 'wykq';
const SESSION_KEY = 'ez:developer-cheats-enabled';
let memoryEnabled = false;
let sessionChecked = false;

export function appendDeveloperCheatInput(buffer: string, key: string): string {
  if (key.length !== 1 || !/[a-z]/i.test(key)) return buffer;
  return `${buffer}${key.toLowerCase()}`.slice(-CHEAT_CODE.length);
}

export function matchesDeveloperCheatCode(buffer: string): boolean {
  return buffer === CHEAT_CODE;
}

export function isDeveloperCheatEnabled(): boolean {
  if (!import.meta.env.DEV) return false;
  if (sessionChecked) return memoryEnabled;

  sessionChecked = true;
  try {
    memoryEnabled = window.sessionStorage.getItem(SESSION_KEY) === '1';
  } catch {
    // sessionStorage 不可用时，本次页面会话仍可使用内存标记。
  }
  return memoryEnabled;
}

export function activateDeveloperCheat(): boolean {
  if (!import.meta.env.DEV) return false;

  memoryEnabled = true;
  sessionChecked = true;
  try {
    window.sessionStorage.setItem(SESSION_KEY, '1');
  } catch {
    // 隐私模式等环境可能禁用 sessionStorage，不影响当前页面会话。
  }

  SaveManager.save(SAVE_KEYS.unlockedLevels, LEVELS.map((level) => level.id));
  SaveManager.save(SAVE_KEYS.unlockedWeapons, Object.keys(WEAPONS) as WeaponId[]);
  return true;
}
