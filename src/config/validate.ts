import { ITEMS } from './items';
import { ENHANCEMENTS } from './enhancements';
import { LEVELS } from './levels';
import { MONSTER_LIBRARY } from './monsterLibrary';
import { WEAPON_LIBRARY, getWeaponDefinition } from './weaponLibrary';
import { WEAPONS, getWeaponDef, type WeaponId } from './weapons';
import { ZOMBIES } from './zombies';
import type { DropDef, WeaponDef, ZombieDef } from './types';
import { P2_VERTICAL_SLICE } from './verticalSlice';
import { getScriptedMoments } from './scriptedMoments';
import { getWaveEnemyEntries, getWaveSegments } from './waveShape';
import { AMMO_SUPPLY_CONFIG } from './ammo';

/**
 * 运行时配置完整性校验。错误会在 Boot 阶段阻止进入游戏，避免无效引用在战斗中才崩溃。
 */
export function validateGameConfig(): string[] {
  const errors: string[] = [];

  for (const [id, weapon] of Object.entries(WEAPONS)) {
    if (weapon.id !== id) errors.push(`武器键 ${id} 与 id ${weapon.id} 不一致`);
    validateWeaponFeelFields(id, weapon, errors);
  }
  for (const [id, zombie] of Object.entries(ZOMBIES)) {
    if (zombie.id !== id) errors.push(`感染体键 ${id} 与 id ${zombie.id} 不一致`);
    let adaptiveAmmoDrops = 0;
    for (const drop of zombie.drops as DropDef[]) {
      if (drop.chance < 0 || drop.chance > 1) errors.push(`${id} 的掉落概率超出 0~1`);
      if (drop.type === 'ammo') {
        if (drop.ammoMode === 'adaptive') adaptiveAmmoDrops += 1;
        if (drop.ammoMode === 'fixed' && drop.amount <= 0) {
          errors.push(`${id} 的固定弹药掉落数量必须大于 0`);
        }
      }
      if (drop.type === 'weapon' && (!drop.itemId || !(drop.itemId in WEAPONS))) {
        errors.push(`${id} 引用了无效武器 ${drop.itemId ?? '(空)'}`);
      }
      if (drop.type === 'item' && (!drop.itemId || !(drop.itemId in ITEMS))) {
        errors.push(`${id} 引用了无效道具 ${drop.itemId ?? '(空)'}`);
      }
    }
    if (adaptiveAmmoDrops > 1) errors.push(`${id} 只能配置一次自适应弹药机会`);
    const definition = zombie as ZombieDef;
    let previousPhaseThreshold = 1;
    for (const phase of definition.bossPhases ?? []) {
      if (!id.includes('boss')) errors.push(`${id} 配置了 Boss 阶段但 id 不含 boss`);
      if (phase.healthRatio <= 0 || phase.healthRatio >= previousPhaseThreshold) {
        errors.push(`${id} 的 Boss 阶段生命阈值必须在 0~1 内严格递减`);
      }
      if ((phase.speedMultiplier ?? 1) <= 0) errors.push(`${id} 的 Boss 阶段速度倍率必须大于 0`);
      if ((phase.baseAbilityCooldownMultiplier ?? 1) <= 0) errors.push(`${id} 的 Boss 阶段冷却倍率必须大于 0`);
      if ((phase.baseAbilityRecoveryMultiplier ?? 1) <= 0) errors.push(`${id} 的 Boss 阶段恢复倍率必须大于 0`);
      previousPhaseThreshold = phase.healthRatio;
    }
  }
  for (const [id, item] of Object.entries(ITEMS)) {
    if (item.id !== id) errors.push(`道具键 ${id} 与 id ${item.id} 不一致`);
  }

  const levelIds = new Set<string>();
  for (const level of LEVELS) {
    if (levelIds.has(level.id)) errors.push(`关卡 id 重复：${level.id}`);
    levelIds.add(level.id);
    if (level.name.trim().length === 0) errors.push(`${level.id} 缺少关卡名称`);
    if (level.briefing.trim().length === 0) errors.push(`${level.id} 缺少任务简报`);
    if (level.waves.length === 0) errors.push(`${level.id} 没有配置波次`);
    if (level.props.length === 0) errors.push(`${level.id} 没有配置战术场景物`);
    if ((level.obstacles?.length ?? 0) === 0) errors.push(`${level.id} 没有配置障碍物`);
    for (const prop of level.props) {
      if (!(prop.type in ITEMS) || ITEMS[prop.type as keyof typeof ITEMS].category !== 'prop') {
        errors.push(`${level.id} 引用了无效场景物 ${prop.type}`);
      }
    }
    for (const wave of level.waves) {
      const segments = getWaveSegments(wave);
      if (segments.length === 0) errors.push(`${level.id} 有阶段没有任何生成段落`);
      if (wave.startDelay <= 0) errors.push(`${level.id} 的阶段准备时间必须大于 0`);
      for (const segment of segments) {
        if (segment.enemies.length === 0) errors.push(`${level.id} 有空的生成段落`);
        if (segment.spawnInterval <= 0) errors.push(`${level.id} 的段落生成间隔必须大于 0`);
        if (segment.leadIn < 0) errors.push(`${level.id} 的段落静默时间不能为负`);
        if (segment.concurrentCap !== undefined && segment.concurrentCap <= 0) {
          errors.push(`${level.id} 的段落同屏上限必须大于 0`);
        }
        for (const enemy of segment.enemies) {
          if (!(enemy.type in ZOMBIES)) errors.push(`${level.id} 引用了无效感染体 ${enemy.type}`);
          if (enemy.count <= 0) errors.push(`${level.id} 的 ${enemy.type} 数量必须大于 0`);
        }
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
    if (entry.availability.kind === 'enemyDrop') {
      const weaponId = entry.availability.weaponId;
      const hasDropSource = Object.values(ZOMBIES).some((zombie) => zombie.drops.some(
        (drop) => drop.type === 'weapon' && drop.itemId === weaponId,
      ));
      if (!hasDropSource) errors.push(`战场武器 ${entry.id} 没有敌人掉落来源`);
    }
  }

  const hasAdaptiveAmmoSource = Object.values(ZOMBIES).some((zombie) => zombie.drops.some(
    (drop) => drop.type === 'ammo' && drop.ammoMode === 'adaptive',
  ));
  if (!hasAdaptiveAmmoSource) errors.push('没有感染体提供自适应弹药机会');
  for (const [weaponId, weapon] of Object.entries(WEAPONS)) {
    if (weapon.infiniteAmmo) continue;
    if (AMMO_SUPPLY_CONFIG.amounts[weapon.ammoType] <= 0) {
      errors.push(`武器 ${weaponId} 的 ${weapon.ammoType} 自适应补给数量必须大于 0`);
    }
  }
  if (AMMO_SUPPLY_CONFIG.targetMagazines <= 0) errors.push('弹药目标弹匣数必须大于 0');
  if (AMMO_SUPPLY_CONFIG.lowStockMagazines <= 0) errors.push('低弹阈值弹匣数必须大于 0');
  if (AMMO_SUPPLY_CONFIG.pityKillCount < 1) errors.push('弹药保底击杀数必须至少为 1');

  const enhancedWeaponIds = new Set<string>();
  for (const [key, enhancement] of Object.entries(ENHANCEMENTS)) {
    if (enhancement.id !== key) errors.push(`强化卡键 ${key} 与 id ${enhancement.id} 不一致`);
    if (!(enhancement.weaponId in WEAPONS)) {
      errors.push(`强化卡 ${key} 引用了无效武器 ${enhancement.weaponId}`);
      continue;
    }
    // 空 effects 会产生「抽到但没有任何作用」的空卡，必须在启动阶段拦下。
    if (Object.keys(enhancement.effects).length === 0) {
      errors.push(`强化卡 ${key} 没有配置任何实际效果`);
    }
    const impactOnly = enhancement.effects.addExplosionRadius !== undefined
      || enhancement.effects.explosionDamageFactor !== undefined
      || enhancement.effects.setImpactLingering !== undefined;
    if (impactOnly && !getWeaponDef(enhancement.weaponId as WeaponId).impactEffect) {
      errors.push(`强化卡 ${key} 修改爆炸参数，但 ${enhancement.weaponId} 没有命中爆炸配置`);
    }
    const burstCount = enhancement.effects.setBurstCount;
    if (burstCount !== undefined && (!Number.isInteger(burstCount) || burstCount < 2)) {
      errors.push(`强化卡 ${key} 的齐射组数必须是至少为 2 的整数`);
    }
    const ammoChain = enhancement.effects.setAmmoChain;
    if (ammoChain) {
      if (!Number.isInteger(ammoChain.interval) || ammoChain.interval < 2) {
        errors.push(`强化卡 ${key} 的弹链间隔必须是至少为 2 的整数`);
      }
      if (!Number.isInteger(ammoChain.bonusBurstCount) || ammoChain.bonusBurstCount < 1) {
        errors.push(`强化卡 ${key} 的弹链额外齐射必须是正整数`);
      }
      if (ammoChain.damageFactor < 1) {
        errors.push(`强化卡 ${key} 的弹链伤害倍率不得小于 1`);
      }
    }
    const mark = enhancement.effects.setMarkOnHit;
    if (mark) {
      if (mark.duration <= 0) errors.push(`强化卡 ${key} 的标记持续时间必须大于 0`);
      if (mark.damageFactor <= 1) errors.push(`强化卡 ${key} 的标记伤害倍率必须大于 1`);
    }
    enhancedWeaponIds.add(enhancement.weaponId);
  }
  for (const weaponId of Object.keys(WEAPONS)) {
    if (!enhancedWeaponIds.has(weaponId)) errors.push(`武器 ${weaponId} 没有任何强化卡`);
  }

  validateP2VerticalSlice(errors);

  // 强化包是局内成长的唯一入口；没有任何感染体掉落时整套系统在实机中不可达。
  const hasEnhancementDrop = Object.values(ZOMBIES)
    .some((zombie) => zombie.drops.some((drop) => drop.type === 'enhancement_pack'));
  if (!hasEnhancementDrop) errors.push('没有任何感染体掉落强化包，武器增强系统不可达');

  return errors;
}

/**
 * 爽感字段取值域校验。
 * 这些字段全部可选，写错时不会报类型错误，只会在战斗中表现成「暴击不生效」
 * 或「衰减档位顺序颠倒导致近距离反而更弱」这类难以定位的问题，因此在启动阶段拦下。
 */
function validateWeaponFeelFields(id: string, weapon: WeaponDef, errors: string[]): void {
  if (weapon.critChance !== undefined) {
    if (weapon.critChance <= 0 || weapon.critChance > 1) {
      errors.push(`武器 ${id} 的暴击概率必须落在 0~1 之间`);
    }
    if ((weapon.critMultiplier ?? 0) <= 1) {
      errors.push(`武器 ${id} 配置了暴击概率但缺少大于 1 的暴击倍率`);
    }
  }
  if (weapon.critMultiplier !== undefined && weapon.critChance === undefined) {
    errors.push(`武器 ${id} 配置了暴击倍率但没有暴击概率，永远不会触发`);
  }
  if (weapon.executeThreshold !== undefined
    && (weapon.executeThreshold <= 0 || weapon.executeThreshold >= 1)) {
    errors.push(`武器 ${id} 的处决阈值必须落在 0~1 之间（不含端点）`);
  }
  if (weapon.knockback !== undefined && weapon.knockback <= 0) {
    errors.push(`武器 ${id} 的击退距离必须大于 0`);
  }
  if (weapon.chainBonus !== undefined && weapon.chainBonus < 1) {
    errors.push(`武器 ${id} 的穿透加成不能小于 1，否则越穿越弱`);
  }
  if (weapon.killSlowMotionTier !== undefined
    && weapon.killSlowMotionTier !== 'A'
    && weapon.killSlowMotionTier !== 'S') {
    errors.push(`武器 ${id} 的击杀慢动作档位必须是 A 或 S`);
  }
  if (weapon.movementPenalty !== undefined
    && (weapon.movementPenalty < 0 || weapon.movementPenalty > 1)) {
    errors.push(`武器 ${id} 的移动惩罚承受比例必须落在 0~1 之间`);
  }
  if (weapon.bounceCount !== undefined
    && (!Number.isInteger(weapon.bounceCount) || weapon.bounceCount < 0 || weapon.bounceCount > 1)) {
    errors.push(`武器 ${id} 的反弹次数必须是 0 或 1`);
  }
  const stops = weapon.damageDropoff;
  if (!stops) return;
  if (stops.length === 0) {
    errors.push(`武器 ${id} 的距离衰减档位为空数组，应直接省略该字段`);
    return;
  }
  let previousDistance = -1;
  for (const stop of stops) {
    if (stop.distance < 0) errors.push(`武器 ${id} 的距离衰减档位距离不能为负`);
    if (stop.distance <= previousDistance) {
      errors.push(`武器 ${id} 的距离衰减档位必须按距离严格升序`);
    }
    if (stop.multiplier <= 0 || stop.multiplier > 1) {
      errors.push(`武器 ${id} 的距离衰减倍率必须落在 0~1 之间`);
    }
    previousDistance = stop.distance;
  }
  if (stops[stops.length - 1].distance > weapon.range) {
    errors.push(`武器 ${id} 的最远衰减档位超出射程，永远不会生效`);
  }
}

/** P2 白名单属于产品范围门禁，避免原型内容在后续改波次或掉落时重新混入正式切片。 */
function validateP2VerticalSlice(errors: string[]): void {
  const slice = P2_VERTICAL_SLICE;
  const level = LEVELS.find((entry) => entry.id === slice.levelId);
  if (!level) {
    errors.push(`P2 垂直切片引用了未知关卡 ${slice.levelId}`);
    return;
  }

  if (level.waves.length !== slice.regularWaveCount) {
    errors.push(`P2 垂直切片必须配置 ${slice.regularWaveCount} 个常规战斗阶段`);
  }
  if (level.boss?.type !== slice.bossId) {
    errors.push(`P2 垂直切片 Boss 必须为 ${slice.bossId}`);
  }

  const enemyWhitelist = new Set<string>(slice.enemyIds);
  const weaponWhitelist = new Set<string>(slice.weaponIds);
  let guaranteedEnhancements = 0;
  const guaranteedWeapons = new Set<string>(['pistol']);
  for (const wave of level.waves) {
    for (const enemy of getWaveEnemyEntries(wave)) {
      if (!enemyWhitelist.has(enemy.type)) {
        errors.push(`P2 垂直切片混入非白名单感染体 ${enemy.type}`);
      }
    }
    // 同屏上限是切片的性能与可读性门禁：段落写法必须逐段声明，不允许静默无上限。
    for (const segment of getWaveSegments(wave)) {
      if (segment.concurrentCap === undefined) {
        errors.push('P2 垂直切片的生成段落必须声明同屏上限');
      } else if (segment.concurrentCap > slice.maxConcurrentEnemies) {
        errors.push(`P2 垂直切片的同屏上限不得超过 ${slice.maxConcurrentEnemies}`);
      }
    }
    for (const reward of wave.rewards ?? []) {
      if (reward.type === 'enhancement') {
        guaranteedEnhancements += 1;
      } else if (!weaponWhitelist.has(reward.weaponId)) {
        errors.push(`P2 阶段奖励混入非白名单武器 ${reward.weaponId}`);
      } else {
        guaranteedWeapons.add(reward.weaponId);
      }
    }
  }
  if (guaranteedEnhancements !== 2) errors.push('P2 垂直切片必须保证恰好 2 次强化选择');
  for (const weaponId of slice.weaponIds) {
    if (!guaranteedWeapons.has(weaponId)) errors.push(`P2 垂直切片缺少固定武器来源 ${weaponId}`);
  }

  const tacticalWhitelist = new Set<string>(slice.tacticalItemIds);
  for (const prop of level.props) {
    if (!tacticalWhitelist.has(prop.type)) {
      errors.push(`P2 垂直切片混入非白名单战术元素 ${prop.type}`);
    }
  }

  // 剧本时刻会在运行时额外生成敌人与场景物，同样必须受切片白名单约束，
  // 否则它会成为绕过内容冻结的后门。段落索引也要指向真实存在的段落。
  for (const moment of getScriptedMoments(slice.levelId)) {
    if (moment.trigger.kind === 'segmentStart') {
      const targetWave = level.waves[moment.trigger.wave];
      const targetSegment = targetWave
        ? getWaveSegments(targetWave)[moment.trigger.segment]
        : undefined;
      if (!targetSegment) {
        errors.push(`剧本时刻 ${moment.id} 指向不存在的阶段或段落`);
      }
    }
    for (const action of moment.actions ?? []) {
      if (action.kind === 'props') {
        if (!tacticalWhitelist.has(action.itemId)) {
          errors.push(`剧本时刻 ${moment.id} 混入非白名单战术元素 ${action.itemId}`);
        }
      } else if (!enemyWhitelist.has(action.type)) {
        errors.push(`剧本时刻 ${moment.id} 混入非白名单感染体 ${action.type}`);
      }
    }
  }

  for (const weaponId of slice.weaponIds) {
    if (!(weaponId in WEAPONS)) errors.push(`P2 垂直切片引用了未知武器 ${weaponId}`);
  }
  for (const enhancementId of slice.enhancementIds) {
    const enhancement = ENHANCEMENTS[enhancementId];
    if (!enhancement) {
      errors.push(`P2 垂直切片引用了未知强化卡 ${enhancementId}`);
    } else if (!(slice.weaponIds as readonly string[]).includes(enhancement.weaponId)) {
      errors.push(`P2 强化卡 ${enhancementId} 不属于切片武器`);
    }
  }
}
