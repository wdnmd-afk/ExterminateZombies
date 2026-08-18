/** 全局常量:画布尺寸、深度层级、事件名。 */

export const GAME_WIDTH = 1280;
export const GAME_HEIGHT = 720;

/** 渲染深度层级(数值越大越靠上)。 */
export const DEPTH = {
  ground: 0,
  lingerZone: 5,
  corpse: 8,
  prop: 10,
  pickup: 15,
  bullet: 20,
  zombie: 30,
  player: 40,
  effect: 50,
  damageNumber: 60,
  hud: 1000,
} as const;

/** GameScene 通过 events 广播、HUD 监听的事件名。 */
export const EVENTS = {
  healthChanged: 'healthChanged',
  characterChanged: 'characterChanged',
  ammoChanged: 'ammoChanged',
  weaponChanged: 'weaponChanged',
  itemChanged: 'itemChanged',
  scoreChanged: 'scoreChanged',
  waveChanged: 'waveChanged',
  waveAnnounced: 'waveAnnounced',
  combatAlert: 'combatAlert',
  pickupCollected: 'pickupCollected',
  pauseChanged: 'pauseChanged',
  killStreakChanged: 'killStreakChanged',
  killStreakMilestone: 'killStreakMilestone',
  gameOver: 'gameOver',
  levelClear: 'levelClear',
} as const;

/** 场景 key。 */
export const SCENES = {
  boot: 'BootScene',
  preload: 'PreloadScene',
  mainMenu: 'MainMenuScene',
  preparation: 'PreparationScene',
  weaponLibrary: 'WeaponLibraryScene',
  monsterLibrary: 'MonsterLibraryScene',
  game: 'GameScene',
  hud: 'HUDScene',
  settings: 'SettingsScene',
  gameOver: 'GameOverScene',
  levelClear: 'LevelClearScene',
  cardSelection: 'CardSelectionScene',
  credits: 'CreditsScene',
} as const;
