/**
 * 环境资源的 Phaser 运行时处理。
 *
 * 纹理键表本身放在 `config/environmentTextures.ts`：那份是纯数据，测试和资产校验要能在
 * 不加载 Phaser 的前提下读取。这里继续转出同名符号，既有导入方无需改动。
 */
import Phaser from 'phaser';
import { ENVIRONMENT_TEXTURE_KEYS } from '../config/environmentTextures';

export {
  ENVIRONMENT_TEXTURE_KEYS,
  OBSTACLE_TEXTURE_KEYS,
  PROP_TEXTURE_KEYS,
  MEDICINE_TEXTURE_KEYS,
} from '../config/environmentTextures';

export function prepareEnvironmentAssets(scene: Phaser.Scene): void {
  for (const textureKey of Object.values(ENVIRONMENT_TEXTURE_KEYS)) {
    if (scene.textures.exists(textureKey)) {
      scene.textures.get(textureKey).setFilter(Phaser.Textures.FilterMode.NEAREST);
    }
  }
}
