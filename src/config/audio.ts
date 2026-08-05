import type { WeaponId } from './weapons';

import playerHurt01Url from '../assets/processed/audio/characters/player-hurt-01.mp3';
import playerHurt02Url from '../assets/processed/audio/characters/player-hurt-02.mp3';
import playerHurt03Url from '../assets/processed/audio/characters/player-hurt-03.mp3';
import zombieAttack01Url from '../assets/processed/audio/characters/zombie-attack-01.wav';
import zombieAttack02Url from '../assets/processed/audio/characters/zombie-attack-02.wav';
import zombieAttack03Url from '../assets/processed/audio/characters/zombie-attack-03.wav';
import zombieDeath01Url from '../assets/processed/audio/characters/zombie-death-01.wav';
import zombieDeath02Url from '../assets/processed/audio/characters/zombie-death-02.wav';
import zombieDeath03Url from '../assets/processed/audio/characters/zombie-death-03.wav';
import dustBurst01Url from '../assets/processed/audio/combat/dust-burst-01.ogg';
import explosion01Url from '../assets/processed/audio/combat/explosion-01.ogg';
import fleshHit01Url from '../assets/processed/audio/combat/flesh-hit-01.ogg';
import fleshHit02Url from '../assets/processed/audio/combat/flesh-hit-02.ogg';
import fleshHit03Url from '../assets/processed/audio/combat/flesh-hit-03.ogg';
import metalHit01Url from '../assets/processed/audio/combat/metal-hit-01.ogg';
import metalHit02Url from '../assets/processed/audio/combat/metal-hit-02.ogg';
import metalHit03Url from '../assets/processed/audio/combat/metal-hit-03.ogg';
import battleMusicUrl from '../assets/processed/audio/music/battle.wav';
import menuMusicUrl from '../assets/processed/audio/music/menu.ogg';
import bossAlert01Url from '../assets/processed/audio/ui/boss-alert-01.ogg';
import uiConfirm01Url from '../assets/processed/audio/ui/confirm-01.ogg';
import uiConfirm02Url from '../assets/processed/audio/ui/confirm-02.ogg';
import uiMove01Url from '../assets/processed/audio/ui/move-01.ogg';
import uiMove02Url from '../assets/processed/audio/ui/move-02.ogg';
import pickup01Url from '../assets/processed/audio/ui/pickup-01.ogg';
import wave01Url from '../assets/processed/audio/ui/wave-01.ogg';
import empty01Url from '../assets/processed/audio/weapons/empty-01.ogg';
import firearmCz01Url from '../assets/processed/audio/weapons/firearm-cz-01.wav';
import firearmCz02Url from '../assets/processed/audio/weapons/firearm-cz-02.wav';
import firearmCz03Url from '../assets/processed/audio/weapons/firearm-cz-03.wav';
import firearmCz04Url from '../assets/processed/audio/weapons/firearm-cz-04.wav';
import firearmMosin01Url from '../assets/processed/audio/weapons/firearm-mosin-01.wav';
import firearmMosin02Url from '../assets/processed/audio/weapons/firearm-mosin-02.wav';
import firearmMosin03Url from '../assets/processed/audio/weapons/firearm-mosin-03.wav';
import firearmShotgun01Url from '../assets/processed/audio/weapons/firearm-shotgun-01.wav';
import firearmSks01Url from '../assets/processed/audio/weapons/firearm-sks-01.wav';
import firearmSks02Url from '../assets/processed/audio/weapons/firearm-sks-02.wav';
import firearmSks03Url from '../assets/processed/audio/weapons/firearm-sks-03.wav';
import firearmSks04Url from '../assets/processed/audio/weapons/firearm-sks-04.wav';
import launcherM7901Url from '../assets/processed/audio/weapons/launcher-m79-01.ogg';
import launcherRpg01Url from '../assets/processed/audio/weapons/launcher-rpg-01.ogg';
import reloadPistolUrl from '../assets/processed/audio/weapons/reload-pistol.wav';
import reloadRifleUrl from '../assets/processed/audio/weapons/reload-rifle.wav';
import reloadShotgunUrl from '../assets/processed/audio/weapons/reload-shotgun.wav';
import weaponSwitch01Url from '../assets/processed/audio/weapons/switch-01.ogg';
import fireLoopUrl from '../assets/processed/audio/world/fire-loop.ogg';

export const AUDIO_ASSET_KEYS = {
  playerHurt01: 'audio.character.player-hurt.01',
  playerHurt02: 'audio.character.player-hurt.02',
  playerHurt03: 'audio.character.player-hurt.03',
  zombieAttack01: 'audio.character.zombie-attack.01',
  zombieAttack02: 'audio.character.zombie-attack.02',
  zombieAttack03: 'audio.character.zombie-attack.03',
  zombieDeath01: 'audio.character.zombie-death.01',
  zombieDeath02: 'audio.character.zombie-death.02',
  zombieDeath03: 'audio.character.zombie-death.03',
  dustBurst01: 'audio.combat.dust-burst.01',
  explosion01: 'audio.combat.explosion.01',
  fleshHit01: 'audio.combat.flesh-hit.01',
  fleshHit02: 'audio.combat.flesh-hit.02',
  fleshHit03: 'audio.combat.flesh-hit.03',
  metalHit01: 'audio.combat.metal-hit.01',
  metalHit02: 'audio.combat.metal-hit.02',
  metalHit03: 'audio.combat.metal-hit.03',
  battleMusic: 'audio.music.battle',
  menuMusic: 'audio.music.menu',
  bossAlert01: 'audio.ui.boss-alert.01',
  uiConfirm01: 'audio.ui.confirm.01',
  uiConfirm02: 'audio.ui.confirm.02',
  uiMove01: 'audio.ui.move.01',
  uiMove02: 'audio.ui.move.02',
  pickup01: 'audio.ui.pickup.01',
  wave01: 'audio.ui.wave.01',
  empty01: 'audio.weapon.empty.01',
  firearmCz01: 'audio.weapon.firearm-cz.01',
  firearmCz02: 'audio.weapon.firearm-cz.02',
  firearmCz03: 'audio.weapon.firearm-cz.03',
  firearmCz04: 'audio.weapon.firearm-cz.04',
  firearmMosin01: 'audio.weapon.firearm-mosin.01',
  firearmMosin02: 'audio.weapon.firearm-mosin.02',
  firearmMosin03: 'audio.weapon.firearm-mosin.03',
  firearmShotgun01: 'audio.weapon.firearm-shotgun.01',
  firearmSks01: 'audio.weapon.firearm-sks.01',
  firearmSks02: 'audio.weapon.firearm-sks.02',
  firearmSks03: 'audio.weapon.firearm-sks.03',
  firearmSks04: 'audio.weapon.firearm-sks.04',
  launcherM7901: 'audio.weapon.launcher-m79.01',
  launcherRpg01: 'audio.weapon.launcher-rpg.01',
  reloadPistol: 'audio.weapon.reload-pistol',
  reloadRifle: 'audio.weapon.reload-rifle',
  reloadShotgun: 'audio.weapon.reload-shotgun',
  weaponSwitch01: 'audio.weapon.switch.01',
  fireLoop: 'audio.world.fire-loop',
} as const;

export type AudioAssetKey = typeof AUDIO_ASSET_KEYS[keyof typeof AUDIO_ASSET_KEYS];

export interface AudioAssetSource {
  key: AudioAssetKey;
  url: string;
}

export const AUDIO_ASSETS = [
  { key: AUDIO_ASSET_KEYS.playerHurt01, url: playerHurt01Url },
  { key: AUDIO_ASSET_KEYS.playerHurt02, url: playerHurt02Url },
  { key: AUDIO_ASSET_KEYS.playerHurt03, url: playerHurt03Url },
  { key: AUDIO_ASSET_KEYS.zombieAttack01, url: zombieAttack01Url },
  { key: AUDIO_ASSET_KEYS.zombieAttack02, url: zombieAttack02Url },
  { key: AUDIO_ASSET_KEYS.zombieAttack03, url: zombieAttack03Url },
  { key: AUDIO_ASSET_KEYS.zombieDeath01, url: zombieDeath01Url },
  { key: AUDIO_ASSET_KEYS.zombieDeath02, url: zombieDeath02Url },
  { key: AUDIO_ASSET_KEYS.zombieDeath03, url: zombieDeath03Url },
  { key: AUDIO_ASSET_KEYS.dustBurst01, url: dustBurst01Url },
  { key: AUDIO_ASSET_KEYS.explosion01, url: explosion01Url },
  { key: AUDIO_ASSET_KEYS.fleshHit01, url: fleshHit01Url },
  { key: AUDIO_ASSET_KEYS.fleshHit02, url: fleshHit02Url },
  { key: AUDIO_ASSET_KEYS.fleshHit03, url: fleshHit03Url },
  { key: AUDIO_ASSET_KEYS.metalHit01, url: metalHit01Url },
  { key: AUDIO_ASSET_KEYS.metalHit02, url: metalHit02Url },
  { key: AUDIO_ASSET_KEYS.metalHit03, url: metalHit03Url },
  { key: AUDIO_ASSET_KEYS.battleMusic, url: battleMusicUrl },
  { key: AUDIO_ASSET_KEYS.menuMusic, url: menuMusicUrl },
  { key: AUDIO_ASSET_KEYS.bossAlert01, url: bossAlert01Url },
  { key: AUDIO_ASSET_KEYS.uiConfirm01, url: uiConfirm01Url },
  { key: AUDIO_ASSET_KEYS.uiConfirm02, url: uiConfirm02Url },
  { key: AUDIO_ASSET_KEYS.uiMove01, url: uiMove01Url },
  { key: AUDIO_ASSET_KEYS.uiMove02, url: uiMove02Url },
  { key: AUDIO_ASSET_KEYS.pickup01, url: pickup01Url },
  { key: AUDIO_ASSET_KEYS.wave01, url: wave01Url },
  { key: AUDIO_ASSET_KEYS.empty01, url: empty01Url },
  { key: AUDIO_ASSET_KEYS.firearmCz01, url: firearmCz01Url },
  { key: AUDIO_ASSET_KEYS.firearmCz02, url: firearmCz02Url },
  { key: AUDIO_ASSET_KEYS.firearmCz03, url: firearmCz03Url },
  { key: AUDIO_ASSET_KEYS.firearmCz04, url: firearmCz04Url },
  { key: AUDIO_ASSET_KEYS.firearmMosin01, url: firearmMosin01Url },
  { key: AUDIO_ASSET_KEYS.firearmMosin02, url: firearmMosin02Url },
  { key: AUDIO_ASSET_KEYS.firearmMosin03, url: firearmMosin03Url },
  { key: AUDIO_ASSET_KEYS.firearmShotgun01, url: firearmShotgun01Url },
  { key: AUDIO_ASSET_KEYS.firearmSks01, url: firearmSks01Url },
  { key: AUDIO_ASSET_KEYS.firearmSks02, url: firearmSks02Url },
  { key: AUDIO_ASSET_KEYS.firearmSks03, url: firearmSks03Url },
  { key: AUDIO_ASSET_KEYS.firearmSks04, url: firearmSks04Url },
  { key: AUDIO_ASSET_KEYS.launcherM7901, url: launcherM7901Url },
  { key: AUDIO_ASSET_KEYS.launcherRpg01, url: launcherRpg01Url },
  { key: AUDIO_ASSET_KEYS.reloadPistol, url: reloadPistolUrl },
  { key: AUDIO_ASSET_KEYS.reloadRifle, url: reloadRifleUrl },
  { key: AUDIO_ASSET_KEYS.reloadShotgun, url: reloadShotgunUrl },
  { key: AUDIO_ASSET_KEYS.weaponSwitch01, url: weaponSwitch01Url },
  { key: AUDIO_ASSET_KEYS.fireLoop, url: fireLoopUrl },
] as const satisfies readonly AudioAssetSource[];

export interface AudioEventDef {
  variants: readonly AudioAssetKey[];
  volume: number;
  rate: number;
  rateJitter?: number;
  minInterval: number;
  maxVoices: number;
  spatial?: boolean;
}

export const AUDIO_EVENT_DEFS = {
  uiMove: { variants: [AUDIO_ASSET_KEYS.uiMove01, AUDIO_ASSET_KEYS.uiMove02], volume: 0.55, rate: 1, rateJitter: 0.03, minInterval: 35, maxVoices: 2 },
  uiConfirm: { variants: [AUDIO_ASSET_KEYS.uiConfirm01, AUDIO_ASSET_KEYS.uiConfirm02], volume: 0.68, rate: 1, rateJitter: 0.02, minInterval: 60, maxVoices: 2 },
  pistol: { variants: [AUDIO_ASSET_KEYS.firearmCz01, AUDIO_ASSET_KEYS.firearmCz02, AUDIO_ASSET_KEYS.firearmCz03], volume: 0.62, rate: 0.92, rateJitter: 0.025, minInterval: 260, maxVoices: 3 },
  smg: { variants: [AUDIO_ASSET_KEYS.firearmCz02, AUDIO_ASSET_KEYS.firearmCz03, AUDIO_ASSET_KEYS.firearmCz04], volume: 0.32, rate: 1.34, rateJitter: 0.05, minInterval: 52, maxVoices: 5 },
  rifle: { variants: [AUDIO_ASSET_KEYS.firearmSks01, AUDIO_ASSET_KEYS.firearmSks02, AUDIO_ASSET_KEYS.firearmSks03], volume: 0.47, rate: 1.04, rateJitter: 0.035, minInterval: 96, maxVoices: 4 },
  shotgun: { variants: [AUDIO_ASSET_KEYS.firearmShotgun01], volume: 0.78, rate: 0.92, rateJitter: 0.035, minInterval: 620, maxVoices: 2 },
  ak47: { variants: [AUDIO_ASSET_KEYS.firearmSks02, AUDIO_ASSET_KEYS.firearmSks03, AUDIO_ASSET_KEYS.firearmSks04], volume: 0.53, rate: 0.88, rateJitter: 0.045, minInterval: 88, maxVoices: 4 },
  barrett: { variants: [AUDIO_ASSET_KEYS.firearmMosin01, AUDIO_ASSET_KEYS.firearmMosin02, AUDIO_ASSET_KEYS.firearmMosin03], volume: 0.86, rate: 0.74, rateJitter: 0.025, minInterval: 760, maxVoices: 2 },
  rpg: { variants: [AUDIO_ASSET_KEYS.launcherRpg01], volume: 0.68, rate: 0.72, rateJitter: 0.025, minInterval: 900, maxVoices: 2 },
  m79: { variants: [AUDIO_ASSET_KEYS.launcherM7901], volume: 0.64, rate: 0.86, rateJitter: 0.035, minInterval: 650, maxVoices: 2 },
  empty: { variants: [AUDIO_ASSET_KEYS.empty01], volume: 0.42, rate: 1.12, rateJitter: 0.04, minInterval: 150, maxVoices: 1 },
  reloadPistol: { variants: [AUDIO_ASSET_KEYS.reloadPistol], volume: 0.48, rate: 1.08, minInterval: 220, maxVoices: 1 },
  reloadRifle: { variants: [AUDIO_ASSET_KEYS.reloadRifle], volume: 0.44, rate: 1.05, minInterval: 220, maxVoices: 1 },
  reloadShotgun: { variants: [AUDIO_ASSET_KEYS.reloadShotgun], volume: 0.56, rate: 1, minInterval: 220, maxVoices: 1 },
  weaponSwitch: { variants: [AUDIO_ASSET_KEYS.weaponSwitch01], volume: 0.32, rate: 1.05, rateJitter: 0.04, minInterval: 90, maxVoices: 1 },
  mineDeploy: { variants: [AUDIO_ASSET_KEYS.metalHit02, AUDIO_ASSET_KEYS.weaponSwitch01], volume: 0.34, rate: 0.78, rateJitter: 0.04, minInterval: 120, maxVoices: 2, spatial: true },
  impact: { variants: [AUDIO_ASSET_KEYS.fleshHit01, AUDIO_ASSET_KEYS.fleshHit02, AUDIO_ASSET_KEYS.fleshHit03], volume: 0.30, rate: 1, rateJitter: 0.10, minInterval: 32, maxVoices: 5, spatial: true },
  metalImpact: { variants: [AUDIO_ASSET_KEYS.metalHit01, AUDIO_ASSET_KEYS.metalHit02, AUDIO_ASSET_KEYS.metalHit03], volume: 0.29, rate: 1, rateJitter: 0.08, minInterval: 38, maxVoices: 4, spatial: true },
  explosion: { variants: [AUDIO_ASSET_KEYS.explosion01], volume: 0.72, rate: 0.84, rateJitter: 0.11, minInterval: 55, maxVoices: 4, spatial: true },
  dustBurst: { variants: [AUDIO_ASSET_KEYS.dustBurst01], volume: 0.42, rate: 0.82, rateJitter: 0.08, minInterval: 80, maxVoices: 3, spatial: true },
  enemyAttack: { variants: [AUDIO_ASSET_KEYS.zombieAttack01, AUDIO_ASSET_KEYS.zombieAttack02, AUDIO_ASSET_KEYS.zombieAttack03], volume: 0.42, rate: 1, rateJitter: 0.12, minInterval: 110, maxVoices: 3, spatial: true },
  enemyDeath: { variants: [AUDIO_ASSET_KEYS.zombieDeath01, AUDIO_ASSET_KEYS.zombieDeath02, AUDIO_ASSET_KEYS.zombieDeath03], volume: 0.36, rate: 1, rateJitter: 0.14, minInterval: 55, maxVoices: 4, spatial: true },
  pickup: { variants: [AUDIO_ASSET_KEYS.pickup01], volume: 0.48, rate: 1.08, rateJitter: 0.04, minInterval: 75, maxVoices: 2 },
  hurt: { variants: [AUDIO_ASSET_KEYS.playerHurt01, AUDIO_ASSET_KEYS.playerHurt02, AUDIO_ASSET_KEYS.playerHurt03], volume: 0.70, rate: 1, rateJitter: 0.04, minInterval: 160, maxVoices: 2 },
  wave: { variants: [AUDIO_ASSET_KEYS.wave01], volume: 0.54, rate: 1, minInterval: 260, maxVoices: 1 },
  bossWave: { variants: [AUDIO_ASSET_KEYS.bossAlert01], volume: 0.78, rate: 0.82, minInterval: 600, maxVoices: 1 },
  gameOver: { variants: [AUDIO_ASSET_KEYS.bossAlert01], volume: 0.58, rate: 0.62, minInterval: 800, maxVoices: 1 },
  levelClear: { variants: [AUDIO_ASSET_KEYS.wave01], volume: 0.62, rate: 1.18, minInterval: 800, maxVoices: 1 },
} as const satisfies Record<string, AudioEventDef>;

export type SoundEffect = keyof typeof AUDIO_EVENT_DEFS;
export type MusicMode = 'menu' | 'battle';
export type SoundLoop = 'fire';

export const MUSIC_DEFS: Record<MusicMode, { asset: AudioAssetKey; volume: number }> = {
  menu: { asset: AUDIO_ASSET_KEYS.menuMusic, volume: 0.52 },
  battle: { asset: AUDIO_ASSET_KEYS.battleMusic, volume: 0.34 },
};

export const LOOP_DEFS: Record<SoundLoop, { asset: AudioAssetKey; volume: number; maxDistance: number }> = {
  fire: { asset: AUDIO_ASSET_KEYS.fireLoop, volume: 0.24, maxDistance: 820 },
};

export const WEAPON_FIRE_EVENTS: Record<WeaponId, SoundEffect> = {
  pistol: 'pistol',
  smg: 'smg',
  rifle: 'rifle',
  shotgun: 'shotgun',
  ak47: 'ak47',
  barrett: 'barrett',
  rpg: 'rpg',
  m79: 'm79',
};

export const WEAPON_RELOAD_EVENTS: Record<WeaponId, SoundEffect> = {
  pistol: 'reloadPistol',
  smg: 'reloadRifle',
  rifle: 'reloadRifle',
  shotgun: 'reloadShotgun',
  ak47: 'reloadRifle',
  barrett: 'reloadRifle',
  rpg: 'reloadShotgun',
  m79: 'reloadShotgun',
};
