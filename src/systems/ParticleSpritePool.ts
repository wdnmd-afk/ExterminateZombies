import Phaser from 'phaser';
import { ObjectPool } from '../utils/ObjectPool';
import type { ParticleAssetKey } from '../config/particleVisuals';

export interface ParticleSpawnOptions {
  x: number;
  y: number;
  size: number;
  depth: number;
  alpha?: number;
  tint?: number;
  blend?: 'add' | 'normal';
}

/** 静态位图粒子池，和需要播放动画帧的 EffectSpritePool 分开维护。 */
export class ParticleSpritePool {
  private readonly pool: ObjectPool<Phaser.GameObjects.Image>;
  private destroyed = false;

  constructor(scene: Phaser.Scene, initialSize = 24) {
    this.pool = new ObjectPool(
      scene,
      (owner) => {
        const image = owner.add.image(0, 0, '__DEFAULT');
        image.setActive(false);
        image.setVisible(false);
        return image;
      },
      initialSize,
    );
  }

  spawn(textureKey: ParticleAssetKey, options: ParticleSpawnOptions): Phaser.GameObjects.Image {
    if (this.destroyed) throw new Error('Cannot spawn from a destroyed particle pool.');
    const particle = this.pool.acquire();
    particle.setTexture(textureKey);
    particle.setPosition(options.x, options.y);
    particle.setDisplaySize(options.size, options.size);
    particle.setAlpha(options.alpha ?? 1);
    particle.setTint(options.tint ?? 0xffffff);
    particle.setBlendMode(
      options.blend === 'add' ? Phaser.BlendModes.ADD : Phaser.BlendModes.NORMAL,
    );
    particle.setDepth(options.depth);
    particle.setActive(true);
    particle.setVisible(true);
    return particle;
  }

  release(particle: Phaser.GameObjects.Image): void {
    if (this.destroyed) return;
    particle.setActive(false);
    particle.setVisible(false);
    particle.clearTint();
    particle.setAlpha(1);
    particle.setScale(1);
    particle.setRotation(0);
    particle.setBlendMode(Phaser.BlendModes.NORMAL);
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.pool.forEachActive((particle) => this.release(particle));
    this.pool.destroy();
  }
}
