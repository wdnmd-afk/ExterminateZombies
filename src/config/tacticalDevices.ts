import type { NormalZombieId } from './zombies';

export const TACTICAL_TEXTURE_KEYS = {
  lure: 'tactical-lure-station',
  countershot: 'tactical-countershot',
} as const;

export const LURE_SETTINGS = {
  charges: 2,
  durationMs: 9000,
  cooldownMs: 18000,
  attractionRadius: 340,
  interactionRadius: 88,
  playerPriorityRadius: 56,
  arrivalRadius: 30,
  affectedTypes: ['walker', 'runner', 'drifter', 'bloodied', 'headless'] satisfies NormalZombieId[],
} as const;
