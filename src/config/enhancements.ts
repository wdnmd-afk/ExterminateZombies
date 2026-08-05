import type { EnhancementDef } from './types';
import { WEAPONS, type WeaponId } from './weapons';

/**
 * 武器强化卡池。每把武器 3 张，覆盖全部 8 把武器。
 *
 * 约定：
 * 1. 键名与 `id` 必须一致，`weaponId` 必须指向 `WEAPONS` 中的真实武器。
 * 2. `effects` 不能为空对象，否则会出现「抽到但没有任何作用」的空卡。
 * 3. 同一武器的多张卡可以同时持有并继续叠加，不存在互斥组。写新卡时
 *    要假定它会和同武器的其它卡共存：倍率相乘、加法相加、改造类取最强档。
 * 4. `addExplosionRadius` / `explosionDamageFactor` / `setImpactLingering`
 *    只对配置了 `impactEffect` 的爆炸武器有意义。
 */
export const ENHANCEMENTS: Record<string, EnhancementDef> = {
  // ——— 沙漠之鹰 ———
  pistol_auto: {
    id: 'pistol_auto',
    weaponId: WEAPONS.pistol.id,
    cardTitle: '连射改造',
    cardDescription: '你的手枪变为全自动，按住即可连续开火。射速略微提升。',
    effects: { setToAuto: true, fireRateFactor: 0.8 },
  },
  pistol_magnum: {
    id: 'pistol_magnum',
    weaponId: WEAPONS.pistol.id,
    cardTitle: '马格努姆装药',
    cardDescription: '手枪单发伤害提升 80%，但射速下降 25%。',
    effects: { damageFactor: 1.8, fireRateFactor: 1.25 },
  },
  pistol_ap_round: {
    id: 'pistol_ap_round',
    weaponId: WEAPONS.pistol.id,
    cardTitle: '穿甲弹',
    cardDescription: '手枪子弹可穿透 2 个敌人，单发伤害降低 15%。',
    effects: { setPenetration: 2, damageFactor: 0.85 },
  },

  // ——— MP5 ———
  smg_penetration: {
    id: 'smg_penetration',
    weaponId: WEAPONS.smg.id,
    cardTitle: '穿甲弹头',
    cardDescription: '冲锋枪的子弹现在可以穿透 2 个敌人。',
    effects: { setPenetration: 2 },
  },
  smg_extended_mag: {
    id: 'smg_extended_mag',
    weaponId: WEAPONS.smg.id,
    cardTitle: '加长弹匣',
    cardDescription: '冲锋枪弹匣容量提升 50%，换弹时间缩短 15%。',
    effects: { magazineFactor: 1.5, reloadTimeFactor: 0.85 },
  },
  smg_hollow_point: {
    id: 'smg_hollow_point',
    weaponId: WEAPONS.smg.id,
    cardTitle: '空尖弹',
    cardDescription: '冲锋枪单发伤害提升 45%，但散射范围明显增大。',
    effects: { damageFactor: 1.45, spreadFactor: 1.35 },
  },

  // ——— M4A1 ———
  rifle_less_spread: {
    id: 'rifle_less_spread',
    weaponId: WEAPONS.rifle.id,
    cardTitle: '精准步枪',
    cardDescription: '步枪的散射角度大幅减小，更为精准。',
    effects: { spreadFactor: 0.3 },
  },
  rifle_heavy_barrel: {
    id: 'rifle_heavy_barrel',
    weaponId: WEAPONS.rifle.id,
    cardTitle: '重型枪管',
    cardDescription: '步枪单发伤害提升 40%，射速下降 30%。',
    effects: { damageFactor: 1.4, fireRateFactor: 1.3 },
  },
  rifle_tactical_reload: {
    id: 'rifle_tactical_reload',
    weaponId: WEAPONS.rifle.id,
    cardTitle: '战术换弹',
    cardDescription: '步枪换弹时间缩短 45%，弹匣容量提升 20%。',
    effects: { reloadTimeFactor: 0.55, magazineFactor: 1.2 },
  },

  // ——— SPAS-12 ———
  shotgun_double_pellets: {
    id: 'shotgun_double_pellets',
    weaponId: WEAPONS.shotgun.id,
    cardTitle: '双倍火力',
    cardDescription: '霰弹枪的弹丸数量翻倍，散射范围略微增大。若已改为独头弹，则改为单发伤害翻倍。',
    effects: { pelletsFactor: 2, spreadFactor: 1.2 },
  },
  shotgun_slug: {
    id: 'shotgun_slug',
    weaponId: WEAPONS.shotgun.id,
    cardTitle: '独头鹿弹',
    cardDescription: '霰弹枪变为发射单发高伤害独头弹，伤害变为 3 倍，且拥有 1 次穿透。',
    effects: { setPellets: 1, damageFactor: 3, setPenetration: 1, spreadFactor: 0.1 },
  },
  shotgun_drum_mag: {
    id: 'shotgun_drum_mag',
    weaponId: WEAPONS.shotgun.id,
    cardTitle: '弹鼓供弹',
    cardDescription: '霰弹枪弹匣容量翻倍，换弹时间增加 15%。',
    effects: { magazineFactor: 2, reloadTimeFactor: 1.15 },
  },

  // ——— AK-47 ———
  ak47_muzzle_brake: {
    id: 'ak47_muzzle_brake',
    weaponId: WEAPONS.ak47.id,
    cardTitle: '枪口制退器',
    cardDescription: 'AK-47 的散射角度减少 55%，连发时更容易控制。',
    effects: { spreadFactor: 0.45 },
  },
  ak47_steel_core: {
    id: 'ak47_steel_core',
    weaponId: WEAPONS.ak47.id,
    cardTitle: '钢芯弹',
    cardDescription: 'AK-47 额外获得 2 次穿透，单发伤害提升 15%。',
    effects: { addPenetration: 2, damageFactor: 1.15 },
  },
  ak47_high_cycle: {
    id: 'ak47_high_cycle',
    weaponId: WEAPONS.ak47.id,
    cardTitle: '高循环枪机',
    cardDescription: 'AK-47 射速提升 30%，但散射范围增大 30%。',
    effects: { fireRateFactor: 0.7, spreadFactor: 1.3 },
  },

  // ——— Barrett M82 ———
  barrett_rapid_bolt: {
    id: 'barrett_rapid_bolt',
    weaponId: WEAPONS.barrett.id,
    cardTitle: '速射枪机',
    cardDescription: '巴雷特射速提升 40%，单发伤害降低 15%。',
    effects: { fireRateFactor: 0.6, damageFactor: 0.85 },
  },
  barrett_apex_round: {
    id: 'barrett_apex_round',
    weaponId: WEAPONS.barrett.id,
    cardTitle: '破甲穿刺弹',
    cardDescription: '巴雷特单发伤害提升 50%，额外获得 4 次穿透。',
    effects: { damageFactor: 1.5, addPenetration: 4 },
  },
  barrett_extended_mag: {
    id: 'barrett_extended_mag',
    weaponId: WEAPONS.barrett.id,
    cardTitle: '扩容弹匣',
    cardDescription: '巴雷特弹匣容量翻倍，换弹时间缩短 20%。',
    effects: { magazineFactor: 2, reloadTimeFactor: 0.8 },
  },

  // ——— RPG-7 ———
  rpg_wider_explosion: {
    id: 'rpg_wider_explosion',
    weaponId: WEAPONS.rpg.id,
    cardTitle: '扩大爆炸',
    cardDescription: '火箭弹的爆炸半径增加 50 像素，注意别把自己卷进去。',
    effects: { addExplosionRadius: 50 },
  },
  rpg_thermobaric: {
    id: 'rpg_thermobaric',
    weaponId: WEAPONS.rpg.id,
    cardTitle: '温压弹头',
    cardDescription: '火箭弹爆炸伤害提升 60%，但爆炸半径收缩 25 像素。',
    effects: { explosionDamageFactor: 1.6, addExplosionRadius: -25 },
  },
  rpg_quick_load: {
    id: 'rpg_quick_load',
    weaponId: WEAPONS.rpg.id,
    cardTitle: '速装弹',
    cardDescription: '火箭筒换弹时间缩短 45%，射击间隔缩短 25%。',
    effects: { reloadTimeFactor: 0.55, fireRateFactor: 0.75 },
  },

  // ——— M79 ———
  m79_fire_linger: {
    id: 'm79_fire_linger',
    weaponId: WEAPONS.m79.id,
    cardTitle: '燃烧榴弹',
    cardDescription: '榴弹爆炸后会留下一片燃烧区域，持续造成伤害。火焰同样会烧伤你自己。',
    effects: {
      setImpactLingering: {
        kind: 'fire', duration: 3200, radius: 72, tickDamage: 14, tickRate: 400, color: 0xff6622,
      },
    },
  },
  m79_heavy_charge: {
    id: 'm79_heavy_charge',
    weaponId: WEAPONS.m79.id,
    cardTitle: '高爆装药',
    cardDescription: '榴弹爆炸伤害提升 70%，爆炸半径增加 30 像素。',
    effects: { explosionDamageFactor: 1.7, addExplosionRadius: 30 },
  },
  m79_double_tube: {
    id: 'm79_double_tube',
    weaponId: WEAPONS.m79.id,
    cardTitle: '双管榴弹发射器',
    cardDescription: 'M79 弹匣容量翻倍，可以连打两发再换弹，换弹时间增加 20%。',
    effects: { magazineFactor: 2, reloadTimeFactor: 1.2 },
  },
};

/** 强化卡只允许引用已注册武器；配置错误应在进入抽卡界面时立即暴露。 */
export function getEnhancementWeaponLabel(weaponId: string): string {
  const weapon = Object.values(WEAPONS).find((candidate) => candidate.id === weaponId);
  if (!weapon) {
    throw new Error(`强化配置引用了未知武器：${weaponId}`);
  }
  return weapon.name;
}

/** 返回某把武器的全部强化卡，供校验和图鉴类界面复用。 */
export function getEnhancementsForWeapon(weaponId: WeaponId): EnhancementDef[] {
  return Object.values(ENHANCEMENTS).filter((entry) => entry.weaponId === weaponId);
}
