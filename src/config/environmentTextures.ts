/**
 * 环境资源的运行时纹理键。
 *
 * 这些键是纯数据，刻意与 `systems/EnvironmentAssetManager` 里的 Phaser 运行时逻辑分开：
 * 键表需要被纯规则测试和资产校验直接读取，而 `import Phaser` 在 node 环境下会立即触碰
 * `window` 并抛错。同形态的做法已经在 `config/characters.ts`、`config/zombieVisuals.ts` 用过。
 */
import type { ItemId } from './items';
import type { MedicineId } from './medicine';
import type { ObstacleKind } from './types';

export const ENVIRONMENT_TEXTURE_KEYS = {
  obstacleContainer: 'env-obstacle-container',
  obstacleTruck: 'env-obstacle-truck',
  obstacleWall: 'env-obstacle-wall',
  propOilBarrel: 'env-prop-oil-barrel',
  propFlourBarrel: 'env-prop-flour-barrel',
  propMine: 'env-prop-mine',
  pickupAmmo: 'env-pickup-ammo',
  pickupEnhancement: 'env-pickup-enhancement',
  medicineBandage: 'env-medicine-bandage',
  medicineMedkit: 'env-medicine-medkit',
  medicineEnergyDrink: 'env-medicine-energy-drink',
  bulletFriendly: 'env-bullet-friendly',
  bulletExplosive: 'env-bullet-explosive',
  bulletEnemy: 'env-bullet-enemy',
} as const;

export const OBSTACLE_TEXTURE_KEYS = {
  container: ENVIRONMENT_TEXTURE_KEYS.obstacleContainer,
  wreck: ENVIRONMENT_TEXTURE_KEYS.obstacleTruck,
  barricade: ENVIRONMENT_TEXTURE_KEYS.obstacleWall,
} satisfies Record<ObstacleKind, string>;

export const PROP_TEXTURE_KEYS = {
  barrel_oil: ENVIRONMENT_TEXTURE_KEYS.propOilBarrel,
  barrel_flour: ENVIRONMENT_TEXTURE_KEYS.propFlourBarrel,
  mine: ENVIRONMENT_TEXTURE_KEYS.propMine,
} satisfies Record<ItemId, string>;

/**
 * 三种药品各自的运行时图标。
 * 与 `PROP_TEXTURE_KEYS` 同形态：用 `satisfies Record<MedicineId, string>` 保证新增药品时
 * 编译期就暴露缺失的图标，而不是等到运行时纹理取不到才发现。
 */
export const MEDICINE_TEXTURE_KEYS = {
  bandage: ENVIRONMENT_TEXTURE_KEYS.medicineBandage,
  medkit: ENVIRONMENT_TEXTURE_KEYS.medicineMedkit,
  energy_drink: ENVIRONMENT_TEXTURE_KEYS.medicineEnergyDrink,
} satisfies Record<MedicineId, string>;
