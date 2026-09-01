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
  propFirebomb: 'env-prop-firebomb',
  propDustCanister: 'env-prop-dust-canister',
  propDemoCharge: 'env-prop-demo-charge',
  propCryoCanister: 'env-prop-cryo-canister',
  pickupAmmo: 'env-pickup-ammo',
  pickupEnhancement: 'env-pickup-enhancement',
  medicineBandage: 'env-medicine-bandage',
  medicineMedkit: 'env-medicine-medkit',
  medicineEnergyDrink: 'env-medicine-energy-drink',
  bulletFriendly: 'env-bullet-friendly',
  bulletExplosive: 'env-bullet-explosive',
  bulletEnemy: 'env-bullet-enemy',
  // 第二关正式位图环境（G5-2）。由 scripts/process_battlefield_environment_assets.py 生成。
  battlefieldLevel2Ground: 'env-battlefield-level2-ground',
  battlefieldLevel2Rail: 'env-battlefield-level2-rail',
  battlefieldLevel2Boundary: 'env-battlefield-level2-boundary',
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
  firebomb: ENVIRONMENT_TEXTURE_KEYS.propFirebomb,
  dust_canister: ENVIRONMENT_TEXTURE_KEYS.propDustCanister,
  demo_charge: ENVIRONMENT_TEXTURE_KEYS.propDemoCharge,
  cryo_canister: ENVIRONMENT_TEXTURE_KEYS.propCryoCanister,
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

/**
 * 战场位图环境的贴图登记（G5-2）。
 *
 * 尺寸由 `scripts/process_battlefield_environment_assets.py` 打印后粘贴，不要手改：
 * 它们由该脚本的 `GAME_WIDTH` / `RAIL_BAND_HEIGHT` / `BOUNDARY_THICKNESS` / `UPSCALE`
 * 决定，改了脚本必须重跑并同步这里，否则 `tests/battlefield-tile-assets.test.ts` 会红。
 *
 * 表结构刻意做成按主题 id 索引：G5-5 要把位图环境铺到其余九关，届时只新增条目，
 * 不改 `BattlefieldRenderer` 的渲染逻辑。
 */
export interface BattlefieldTileSet {
  /** 可平铺的地面基底单元，运行时由 TileSprite 铺满画布。 */
  ground: { textureKey: string; width: number; height: number };
  /** 横向铁轨带，宽度覆盖整个画布。 */
  rail: { textureKey: string; width: number; height: number };
  /** 边界带，厚度与 drawWorldBoundary() 的 20px 一致。 */
  boundary: { textureKey: string; width: number; height: number };
}

export const BATTLEFIELD_TILE_SETS: Record<string, BattlefieldTileSet> = {
  level_2: {
    ground: { textureKey: ENVIRONMENT_TEXTURE_KEYS.battlefieldLevel2Ground, width: 32, height: 32 },
    rail: { textureKey: ENVIRONMENT_TEXTURE_KEYS.battlefieldLevel2Rail, width: 1280, height: 116 },
    boundary: {
      textureKey: ENVIRONMENT_TEXTURE_KEYS.battlefieldLevel2Boundary,
      width: 1280,
      height: 20,
    },
  },
};

/** 已具备位图环境的主题 id。供测试与渲染分支共用同一份事实。 */
export function getBitmapBattlefieldIds(): string[] {
  return Object.keys(BATTLEFIELD_TILE_SETS);
}

/** 取某主题的位图贴图集；无位图环境的主题返回 null，调用方据此回退程序化绘制。 */
export function getBattlefieldTileSet(themeId: string): BattlefieldTileSet | null {
  return BATTLEFIELD_TILE_SETS[themeId] ?? null;
}
