import { WEAPONS, type WeaponId } from './weapons';

export const MAX_WEAPON_LOADOUT_SIZE = 5;
export const REQUIRED_LOADOUT_WEAPON_ID: WeaponId = 'pistol';

const KNOWN_WEAPON_IDS = Object.keys(WEAPONS) as WeaponId[];
const KNOWN_WEAPON_ID_SET = new Set<string>(KNOWN_WEAPON_IDS);

/**
 * 编队约束的唯一实现：只接受真实且已解锁的武器，手枪固定在第 1 槽，总数不超过 5。
 * UI 禁用只负责反馈，不能替代这里的存档边界校验。
 */
export function normalizeWeaponLoadout(
  value: unknown,
  unlockedWeapons: readonly WeaponId[],
): WeaponId[] {
  const unlocked = new Set<WeaponId>(unlockedWeapons.filter((weaponId) => KNOWN_WEAPON_ID_SET.has(weaponId)));
  unlocked.add(REQUIRED_LOADOUT_WEAPON_ID);

  const result: WeaponId[] = [REQUIRED_LOADOUT_WEAPON_ID];
  if (!Array.isArray(value)) return result;

  for (const candidate of value) {
    if (typeof candidate !== 'string' || !KNOWN_WEAPON_ID_SET.has(candidate)) continue;
    const weaponId = candidate as WeaponId;
    if (weaponId === REQUIRED_LOADOUT_WEAPON_ID || !unlocked.has(weaponId) || result.includes(weaponId)) continue;
    result.push(weaponId);
    if (result.length >= MAX_WEAPON_LOADOUT_SIZE) break;
  }
  return result;
}

/** 旧存档没有编队字段时，优先保留原主武器，再按许可顺序补满可用槽位。 */
export function createDefaultWeaponLoadout(
  unlockedWeapons: readonly WeaponId[],
  preferredWeapon: WeaponId,
): WeaponId[] {
  return normalizeWeaponLoadout(
    [REQUIRED_LOADOUT_WEAPON_ID, preferredWeapon, ...unlockedWeapons],
    unlockedWeapons,
  );
}
