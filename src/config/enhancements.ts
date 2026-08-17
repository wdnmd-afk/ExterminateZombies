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
    cardTitle: '处决回响',
    cardDescription: '伤害提升 55%、射速略降；击杀普通感染体时触发 50 伤害的小型爆炸。',
    effects: {
      damageFactor: 1.55,
      fireRateFactor: 1.2,
      setKillExplosion: { kind: 'explosion', damage: 50, radius: 62 },
    },
  },
  pistol_ap_round: {
    id: 'pistol_ap_round',
    weaponId: WEAPONS.pistol.id,
    cardTitle: '双发扳机',
    cardDescription: '一次弹药打出两发穿透弹；单颗伤害降至 55%，总火力略升且散射增大。',
    effects: { setBurstCount: 2, setPenetration: 1, damageFactor: 0.55, spreadFactor: 1.2 },
  },

  // ——— MP5 ———
  smg_penetration: {
    id: 'smg_penetration',
    weaponId: WEAPONS.smg.id,
    cardTitle: '弹链地狱',
    cardDescription: '每第 5 次击发触发额外两组齐射，弹链子弹伤害提升 25%，不额外消耗弹药。',
    effects: {
      setAmmoChain: { interval: 5, bonusBurstCount: 2, damageFactor: 1.25 },
    },
  },
  smg_extended_mag: {
    id: 'smg_extended_mag',
    weaponId: WEAPONS.smg.id,
    cardTitle: '追猎曳光',
    cardDescription: '弹匣提升 25%；命中标记目标 1.8 秒，后续玩家命中伤害提升 18%。',
    effects: {
      magazineFactor: 1.25,
      setMarkOnHit: { duration: 1800, damageFactor: 1.18 },
    },
  },
  smg_hollow_point: {
    id: 'smg_hollow_point',
    weaponId: WEAPONS.smg.id,
    cardTitle: '碎裂弹雨',
    cardDescription: '伤害提升 25%、散射增大；击杀普通感染体时触发 35 伤害碎裂爆炸。',
    effects: {
      damageFactor: 1.25,
      spreadFactor: 1.3,
      setKillExplosion: { kind: 'explosion', damage: 35, radius: 48 },
    },
  },

  // ——— M4A1 ———
  rifle_less_spread: {
    id: 'rifle_less_spread',
    weaponId: WEAPONS.rifle.id,
    cardTitle: '连锁标记',
    cardDescription: '命中后标记目标 3 秒；标记期间后续玩家命中伤害提升 35%，命中会刷新标记。',
    effects: {
      setMarkOnHit: { duration: 3000, damageFactor: 1.35 },
    },
  },
  rifle_heavy_barrel: {
    id: 'rifle_heavy_barrel',
    weaponId: WEAPONS.rifle.id,
    cardTitle: '双点爆发',
    cardDescription: '一次弹药形成两发点射；单颗伤害降至 58%，总火力提升 16%，射速略降。',
    effects: { setBurstCount: 2, damageFactor: 0.58, fireRateFactor: 1.15 },
  },
  rifle_tactical_reload: {
    id: 'rifle_tactical_reload',
    weaponId: WEAPONS.rifle.id,
    cardTitle: '三连脉冲',
    cardDescription: '换弹缩短 25%；每第 3 次击发追加两组齐射，脉冲伤害提升 10%。',
    effects: {
      reloadTimeFactor: 0.75,
      setAmmoChain: { interval: 3, bonusBurstCount: 2, damageFactor: 1.1 },
    },
  },

  // ——— SPAS-12 ———
  shotgun_double_pellets: {
    id: 'shotgun_double_pellets',
    weaponId: WEAPONS.shotgun.id,
    cardTitle: '四管齐射',
    cardDescription: '一次射击形成 4 组弹道，总弹量提升约 33%，但散射略增；仍只消耗 1 发弹药。',
    effects: { setBurstCount: 4, pelletsFactor: 1 / 3, spreadFactor: 1.15 },
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
    cardTitle: '街扫模式',
    cardDescription: '霰弹枪改为按住连射，弹匣提升 50%、射击间隔缩短 20%，但装填略慢。',
    effects: { setToAuto: true, magazineFactor: 1.5, fireRateFactor: 0.8, reloadTimeFactor: 1.15 },
  },

  // ——— AK-47 ———
  ak47_muzzle_brake: {
    id: 'ak47_muzzle_brake',
    weaponId: WEAPONS.ak47.id,
    cardTitle: '双流压制',
    cardDescription: '每发弹药形成两条压制弹道；单颗伤害降至 60%，总火力提升 20%，散射略增。',
    effects: { setBurstCount: 2, damageFactor: 0.6, spreadFactor: 1.1 },
  },
  ak47_steel_core: {
    id: 'ak47_steel_core',
    weaponId: WEAPONS.ak47.id,
    cardTitle: '破阵标记',
    cardDescription: '额外获得 2 次穿透；命中标记目标 2.2 秒，后续玩家命中伤害提升 20%。',
    effects: {
      addPenetration: 2,
      setMarkOnHit: { duration: 2200, damageFactor: 1.2 },
    },
  },
  ak47_high_cycle: {
    id: 'ak47_high_cycle',
    weaponId: WEAPONS.ak47.id,
    cardTitle: '过热齐射',
    cardDescription: '射速提升 20%、散射增大；每第 8 次击发追加两组 15% 增伤的过热弹。',
    effects: {
      fireRateFactor: 0.8,
      spreadFactor: 1.25,
      setAmmoChain: { interval: 8, bonusBurstCount: 2, damageFactor: 1.15 },
    },
  },

  // ——— Barrett M82 ———
  barrett_rapid_bolt: {
    id: 'barrett_rapid_bolt',
    weaponId: WEAPONS.barrett.id,
    cardTitle: '自动反器材',
    cardDescription: '巴雷特改为按住连射，射击间隔缩短 30%，单发伤害降低 20%。',
    effects: { setToAuto: true, fireRateFactor: 0.7, damageFactor: 0.8 },
  },
  barrett_apex_round: {
    id: 'barrett_apex_round',
    weaponId: WEAPONS.barrett.id,
    cardTitle: '双芯穿刺',
    cardDescription: '一次弹药发射两枚穿刺弹；单颗伤害降至 55%，总火力提升 10%，额外穿透 2 次。',
    effects: { setBurstCount: 2, damageFactor: 0.55, addPenetration: 2 },
  },
  barrett_extended_mag: {
    id: 'barrett_extended_mag',
    weaponId: WEAPONS.barrett.id,
    cardTitle: '超杀震荡',
    cardDescription: '巴雷特击杀普通感染体时，在目标位置触发 80 伤害、78 半径的震荡爆炸。',
    effects: {
      setKillExplosion: { kind: 'explosion', damage: 80, radius: 78 },
    },
  },

  // ——— RPG-7 ———
  rpg_wider_explosion: {
    id: 'rpg_wider_explosion',
    weaponId: WEAPONS.rpg.id,
    cardTitle: '子母弹头',
    cardDescription: '主爆炸后在外围生成 4 枚子爆破，每枚继承 20% 伤害与 32% 半径。',
    effects: {
      setImpactFragments: { count: 4, offset: 140, damageFactor: 0.2, radiusFactor: 0.32 },
    },
  },
  rpg_thermobaric: {
    id: 'rpg_thermobaric',
    weaponId: WEAPONS.rpg.id,
    cardTitle: '燃烧风暴',
    cardDescription: '主爆炸伤害提升 35%、半径略缩，并留下持续 3.5 秒的燃烧区。',
    effects: {
      explosionDamageFactor: 1.35,
      addExplosionRadius: -20,
      setImpactLingering: {
        kind: 'fire', duration: 3500, radius: 110, tickDamage: 15, tickRate: 400, color: 0xff6622,
      },
    },
  },
  rpg_quick_load: {
    id: 'rpg_quick_load',
    weaponId: WEAPONS.rpg.id,
    cardTitle: '双火箭巢',
    cardDescription: '一次弹药齐射两枚火箭；每枚爆炸伤害降至 55%，换弹缩短 25%。',
    effects: { setBurstCount: 2, explosionDamageFactor: 0.55, reloadTimeFactor: 0.75 },
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
    cardTitle: '蜂群榴弹',
    cardDescription: '主爆炸伤害提升 20%，并在近外围生成 6 枚小型子爆破。',
    effects: {
      explosionDamageFactor: 1.2,
      setImpactFragments: { count: 6, offset: 85, damageFactor: 0.16, radiusFactor: 0.28 },
    },
  },
  m79_double_tube: {
    id: 'm79_double_tube',
    weaponId: WEAPONS.m79.id,
    cardTitle: '双管齐发',
    cardDescription: '一次弹药同时发射两枚榴弹；每枚爆炸伤害降至 58%，换弹时间增加 10%。',
    effects: { setBurstCount: 2, explosionDamageFactor: 0.58, reloadTimeFactor: 1.1 },
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
