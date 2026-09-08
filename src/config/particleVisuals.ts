/** 战斗静态粒子资源。它们不是序列帧特效，不进入 EFFECT_TEXTURE_LAYOUTS。 */
export const PARTICLE_ASSET_KEYS = {
  blood: 'game-particle-blood',
  spark: 'game-particle-spark',
} as const;

export type ParticleAssetKey = typeof PARTICLE_ASSET_KEYS[keyof typeof PARTICLE_ASSET_KEYS];
