import type { ItemId } from './items';
import type { BossZombieId, NormalZombieId } from './zombies';
import type { WeaponId } from './weapons';

/**
 * P2 垂直切片的唯一内容白名单。
 * 现有原型内容继续保留，但不得在没有更新 P1 决策文档的情况下进入正式切片。
 */
export const P2_VERTICAL_SLICE = {
  levelId: 'level_2',
  regularWaveCount: 3,
  /**
   * 切片段落的同屏敌人上限。
   * 上限本身由每个段落声明，这里是「上限的上限」：性能预算的最低测试档位是 50 活跃敌人
   * （`PROJECT_MASTER_PLAN.md` §5.15），在完成实测前不让切片越过该档位。
   */
  maxConcurrentEnemies: 40,
  weaponIds: ['pistol', 'smg', 'shotgun', 'rifle'] satisfies readonly WeaponId[],
  enemyIds: ['walker', 'runner', 'lurker', 'tank'] satisfies readonly NormalZombieId[],
  bossId: 'tank_boss' satisfies BossZombieId,
  tacticalItemIds: ['barrel_oil', 'barrel_flour', 'mine'] satisfies readonly ItemId[],
  enhancementIds: [
    'pistol_auto',
    'pistol_magnum',
    'pistol_ap_round',
    'smg_penetration',
    'smg_extended_mag',
    'smg_hollow_point',
    'shotgun_double_pellets',
    'shotgun_slug',
    'shotgun_drum_mag',
    'rifle_less_spread',
    'rifle_heavy_barrel',
    'rifle_tactical_reload',
  ],
} as const;
