import type { EnhancementDef } from './types';
import { WEAPONS } from './weapons';

export const ENHANCEMENTS: Record<string, EnhancementDef> = {
  // 手枪
  pistol_auto: {
    id: 'pistol_auto',
    weaponId: WEAPONS.pistol.id,
    cardTitle: '连射改造',
    cardDescription: '你的手枪变为全自动，按住即可连续开火。射速略微提升。',
    effects: { setToAuto: true, fireRateFactor: 0.8 }
  },
  
  // 霰弹枪
  shotgun_double_pellets: {
    id: 'shotgun_double_pellets',
    weaponId: WEAPONS.shotgun.id,
    exclusionKey: 'shotgun_ammo_mod',
    cardTitle: '双倍火力',
    cardDescription: '霰弹枪的弹丸数量翻倍，散射范围略微增大。',
    effects: { pelletsFactor: 2, spreadFactor: 1.2 }
  },
  shotgun_slug: {
    id: 'shotgun_slug',
    weaponId: WEAPONS.shotgun.id,
    exclusionKey: 'shotgun_ammo_mod',
    cardTitle: '独头鹿弹',
    cardDescription: '霰弹枪变为发射单发高伤害独头弹，伤害变为3倍，且拥有1次穿透。',
    effects: { setPellets: 1, damageFactor: 3, setPenetration: 1, spreadFactor: 0.1 }
  },

  // SMG
  smg_penetration: {
    id: 'smg_penetration',
    weaponId: WEAPONS.smg.id,
    cardTitle: '穿甲弹头',
    cardDescription: '冲锋枪的子弹现在可以穿透2个敌人。',
    effects: { setPenetration: 2 }
  },

  // Rifle
  rifle_less_spread: {
    id: 'rifle_less_spread',
    weaponId: WEAPONS.rifle.id,
    cardTitle: '精准步枪',
    cardDescription: '步枪的散射角度大幅减小，更为精准。',
    effects: { spreadFactor: 0.3 }
  },

  // RPG
  rpg_wider_explosion: {
    id: 'rpg_wider_explosion',
    weaponId: 'rpg', // 假设rpg id为'rpg'
    exclusionKey: 'rpg_explosion_mod',
    cardTitle: '扩大爆炸',
    cardDescription: '火箭筒的爆炸半径增加50%。',
    effects: { addExplosionRadius: 50 }
  },

  // M79
  m79_fire_linger: {
    id: 'm79_fire_linger',
    weaponId: 'm79', // 假设m79 id为'm79'
    cardTitle: '燃烧榴弹',
    cardDescription: '榴弹爆炸后会留下一片燃烧区域，持续造成伤害。',
    effects: { 
      // 这个效果比较复杂,需要在WeaponManager/AreaEffectFactory中特殊处理
      // 暂时只加描述,逻辑实现时再具体设计
    }
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
