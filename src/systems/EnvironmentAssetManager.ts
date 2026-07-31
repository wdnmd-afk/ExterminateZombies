/** 集中管理环境资源的运行时纹理键。 */
import Phaser from 'phaser';
import type { ItemId } from '../config/items';
import type { ObstacleKind } from '../config/types';

export const ENVIRONMENT_TEXTURE_KEYS = {
  obstacleContainer: 'env-obstacle-container',
  obstacleTruck: 'env-obstacle-truck',
  obstacleWall: 'env-obstacle-wall',
  propOilBarrel: 'env-prop-oil-barrel',
  propFlourBarrel: 'env-prop-flour-barrel',
  propMine: 'env-prop-mine',
  pickupAmmo: 'env-pickup-ammo',
  pickupHealth: 'env-pickup-health',
  pickupEnhancement: 'env-pickup-enhancement',
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

export function prepareEnvironmentAssets(scene: Phaser.Scene): void {
  for (const textureKey of Object.values(ENVIRONMENT_TEXTURE_KEYS)) {
    if (scene.textures.exists(textureKey)) {
      scene.textures.get(textureKey).setFilter(Phaser.Textures.FilterMode.NEAREST);
    }
  }
}
