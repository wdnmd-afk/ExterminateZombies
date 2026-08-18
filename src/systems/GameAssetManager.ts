import Phaser from 'phaser';
import {
  FACING_DIRECTIONS,
  ZOMBIE_ACTION_TEXTURE_LAYOUTS,
  ZOMBIE_TEXTURE_LAYOUTS,
  GAME_ASSET_KEYS,
  getZombieActionAnimationKey,
  resolveTextureFrameRate,
} from '../config/zombieVisuals';
import { prepareEnvironmentAssets } from './EnvironmentAssetManager';
import { prepareWeaponAssets } from './WeaponAssetManager';
import { CHARACTER_PORTRAIT_TEXTURE_KEYS, CHARACTER_TEXTURE_KEYS } from '../config/characters';

/**
 * 运行时素材装配。
 *
 * 视觉数据表本身是纯数据，放在 `config/zombieVisuals`，以便配置校验和布局测试
 * 在 Node 里读取；本文件只保留需要 Phaser 的切帧、建动画和纹理过滤，并原样转出
 * 数据表的公开接口，调用方不需要关心两者的分工。
 */
export * from '../config/zombieVisuals';

/**
 * 在 Preload 完成后统一切帧、建立动画并启用最近邻采样。
 * 所有处理只发生在内存中，不改写已归档的原始素材。
 */
export function prepareGameAssets(scene: Phaser.Scene): void {
  prepareTextureFiltering(scene);
  prepareEnvironmentAssets(scene);
  prepareWeaponAssets(scene);
  prepareZombieFrames(scene);
  prepareZombieActionFrames(scene);
  prepareZombieAnimations(scene);
  prepareZombieActionAnimations(scene);
}

function prepareTextureFiltering(scene: Phaser.Scene): void {
  const zombieKeys = ZOMBIE_TEXTURE_LAYOUTS.map((layout) => layout.textureKey);
  const actionKeys = ZOMBIE_ACTION_TEXTURE_LAYOUTS.flatMap(
    (layout) => layout.sources.map((source) => source.textureKey),
  );
  const keys = new Set<string>([
    GAME_ASSET_KEYS.player,
    ...Object.values(CHARACTER_TEXTURE_KEYS),
    ...zombieKeys,
    ...actionKeys,
  ]);
  for (const key of keys) {
    if (scene.textures.exists(key)) {
      scene.textures.get(key).setFilter(Phaser.Textures.FilterMode.NEAREST);
    }
  }

  // 档案立绘是唯一的例外。美术规范要求像素素材用最近邻，是为了避免放大发虚；
  // 立绘由矢量源按渲染倍率栅格化，到画面上始终是降采样，此时最近邻会丢采样点
  // 产生锯齿，必须用线性过滤。实机精灵仍走上面的最近邻分支。
  for (const key of Object.values(CHARACTER_PORTRAIT_TEXTURE_KEYS)) {
    if (scene.textures.exists(key)) {
      scene.textures.get(key).setFilter(Phaser.Textures.FilterMode.LINEAR);
    }
  }
}

function prepareZombieActionFrames(scene: Phaser.Scene): void {
  for (const layout of ZOMBIE_ACTION_TEXTURE_LAYOUTS) {
    for (const source of layout.sources) {
      if (!scene.textures.exists(source.textureKey)) continue;
      const texture = scene.textures.get(source.textureKey);

      for (let frameIndex = 0; frameIndex < source.frameCount; frameIndex++) {
        const frameName = String(frameIndex);
        if (texture.has(frameName)) continue;
        texture.add(
          frameName,
          0,
          (frameIndex % source.columns) * source.frameWidth,
          Math.floor(frameIndex / source.columns) * source.frameHeight,
          source.frameWidth,
          source.frameHeight,
        );
      }
    }
  }
}

function prepareZombieFrames(scene: Phaser.Scene): void {
  for (const layout of ZOMBIE_TEXTURE_LAYOUTS) {
    if (!scene.textures.exists(layout.textureKey)) continue;
    const texture = scene.textures.get(layout.textureKey);

    if (layout.kind === 'rotating') {
      for (let frameIndex = 0; frameIndex < layout.frameCount; frameIndex++) {
        const frameName = String(frameIndex);
        if (!texture.has(frameName)) {
          texture.add(
            frameName,
            0,
            frameIndex * layout.frameWidth,
            0,
            layout.frameWidth,
            layout.frameHeight,
          );
        }
      }
      continue;
    }

    for (let row = 0; row < 4; row++) {
      layout.frameXs.forEach((x, column) => {
        const frameName = `${row}-${column}`;
        if (!texture.has(frameName)) {
          texture.add(
            frameName,
            0,
            x,
            row * layout.frameHeight,
            layout.frameWidth,
            layout.frameHeight,
          );
        }
      });
    }
  }
}

function prepareZombieAnimations(scene: Phaser.Scene): void {
  for (const layout of ZOMBIE_TEXTURE_LAYOUTS) {
    if (!scene.textures.exists(layout.textureKey)) continue;
    const frameRate = resolveTextureFrameRate(layout.textureKey);

    if (layout.kind === 'rotating') {
      const animationKey = `${layout.textureKey}-rotate`;
      if (!scene.anims.exists(animationKey)) {
        scene.anims.create({
          key: animationKey,
          frames: Array.from({ length: layout.frameCount }, (_, frameIndex) => ({
            key: layout.textureKey,
            frame: String(frameIndex),
          })),
          frameRate,
          repeat: -1,
        });
      }
      continue;
    }

    for (const direction of FACING_DIRECTIONS) {
      const animationKey = `${layout.textureKey}-${direction}`;
      if (scene.anims.exists(animationKey)) continue;
      const row = layout.directionRows[direction];
      scene.anims.create({
        key: animationKey,
        frames: layout.frameXs.map((_x, column) => ({
          key: layout.textureKey,
          frame: `${row}-${column}`,
        })),
        frameRate,
        repeat: -1,
      });
    }
  }
}

function prepareZombieActionAnimations(scene: Phaser.Scene): void {
  for (const layout of ZOMBIE_ACTION_TEXTURE_LAYOUTS) {
    if (layout.sources.some((source) => !scene.textures.exists(source.textureKey))) continue;
    const animationKey = getZombieActionAnimationKey(layout.typeId, layout.action);
    if (!animationKey) continue;
    if (scene.anims.exists(animationKey)) continue;
    scene.anims.create({
      key: animationKey,
      frames: layout.sources.flatMap((source) => Array.from(
        { length: source.frameCount },
        (_, frameIndex) => ({ key: source.textureKey, frame: String(frameIndex) }),
      )),
      frameRate: layout.frameRate,
      repeat: 0,
    });
  }
}
