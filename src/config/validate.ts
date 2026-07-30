import { ITEMS } from './items';
import { LEVELS } from './levels';
import { MONSTER_LIBRARY } from './monsterLibrary';
import { WEAPON_LIBRARY, getWeaponDefinition } from './weaponLibrary';
import { WEAPONS } from './weapons';
import { ZOMBIES } from './zombies';

/**
 * 运行时配置完整性校验。错误会在 Boot 阶段阻止进入游戏，避免无效引用在战斗中才崩溃。
 */
export function validateGameConfig(): string[] {
  const errors: string[] = [];

  for (const [id, weapon] of Object.entries(WEAPONS)) {
    if (weapon.id !== id) errors.push(`武器键 ${id} 与 id ${weapon.id} 不一致`);
  }
  for (const [id, zombie] of Object.entries(ZOMBIES)) {
    if (zombie.id !== id) errors.push(`感染体键 ${id} 与 id ${zombie.id} 不一致`);
    for (const drop of zombie.drops) {
      if (drop.chance < 0 || drop.chance > 1) errors.push(`${id} 的掉落概率超出 0~1`);
      if (drop.type === 'weapon' && (!drop.itemId || !(drop.itemId in WEAPONS))) {
        errors.push(`${id} 引用了无效武器 ${drop.itemId ?? '(空)'}`);
      }
      if (drop.type === 'item' && (!drop.itemId || !(drop.itemId in ITEMS))) {
        errors.push(`${id} 引用了无效道具 ${drop.itemId ?? '(空)'}`);
      }
    }
  }
  for (const [id, item] of Object.entries(ITEMS)) {
    if (item.id !== id) errors.push(`道具键 ${id} 与 id ${item.id} 不一致`);
  }

  const levelIds = new Set<string>();
  for (const level of LEVELS) {
    if (levelIds.has(level.id)) errors.push(`关卡 id 重复：${level.id}`);
    levelIds.add(level.id);
    for (const prop of level.props) {
      if (!(prop.type in ITEMS) || ITEMS[prop.type as keyof typeof ITEMS].category !== 'prop') {
        errors.push(`${level.id} 引用了无效场景物 ${prop.type}`);
      }
    }
    for (const wave of level.waves) {
      for (const enemy of wave.enemies) {
        if (!(enemy.type in ZOMBIES)) errors.push(`${level.id} 引用了无效感染体 ${enemy.type}`);
        if (enemy.count <= 0) errors.push(`${level.id} 的 ${enemy.type} 数量必须大于 0`);
      }
    }
    if (level.boss && !(level.boss.type in ZOMBIES)) {
      errors.push(`${level.id} 引用了无效 Boss ${level.boss.type}`);
    }
  }

  const configuredMonsters = Object.keys(ZOMBIES).sort();
  const documentedMonsters = MONSTER_LIBRARY.map((entry) => entry.id).sort();
  if (
    new Set(documentedMonsters).size !== documentedMonsters.length
    || configuredMonsters.join('|') !== documentedMonsters.join('|')
  ) {
    errors.push('怪物图鉴必须无重复地覆盖全部感染体配置');
  }

  for (const entry of WEAPON_LIBRARY) {
    if (entry.availability.kind !== 'unavailable' && !getWeaponDefinition(entry)) {
      errors.push(`已开放武器档案 ${entry.id} 缺少战斗配置`);
    }
  }

  return errors;
}
