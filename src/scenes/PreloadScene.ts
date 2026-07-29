import Phaser from 'phaser';
import weaponGunsUrl from '../assets/downloaded/weapons/pixel-art-guns-128x128/spritesheet-guns.png';
import desertEagleUrl from '../assets/downloaded/weapons/486-shotgun-desert-eagle/486_parallelo.png';
import playerPistoletUrl from '../assets/downloaded/characters/ghostbyte-action-horror-topdown-48x48/Personnage_vue_dessous_pistolet.png';
import zombieWalkerUrl from '../assets/downloaded/zombies/zombie-rpg-sprites/1ZombieSpriteSheet.png';
import zombieLurkerUrl from '../assets/downloaded/zombies/zombie-rpg-sprites/2ZombieSpriteSheet.png';
import zombieRunnerUrl from '../assets/downloaded/zombies/zombie-rpg-sprites/3ZombieSpriteSheet.png';
import zombieDrifterUrl from '../assets/downloaded/zombies/zombie-rpg-sprites/4ZombieSpriteSheet.png';
import zombieTankUrl from '../assets/downloaded/zombies/zombie-rpg-sprites/5ZombieSpriteSheet.png';
import zombieBomberUrl from '../assets/downloaded/zombies/zombie-rpg-sprites/6ZombieSpriteSheet.png';
import zombieFeralUrl from '../assets/zombie-1.1/PNG/48x64/zombie-NESW.png';
import zombieBloodiedUrl from '../assets/zombie-1.1/PNG/48x64/bloody_zombie-NESW.png';
import zombieHeadlessUrl from '../assets/zombie-1.1/PNG/48x64/headless_zombie-NESW.png';
import zombieRottingUrl from '../assets/zombie-1.1/PNG/48x64/rotting_zombie-NESW.png';
import zombieBloaterUrl from '../assets/downloaded/zombies/zombie-and-skeleton-32x48/zombie_n_skeleton2.png';
import zombieCrawlerUrl from '../assets/processed/zombies/crawler-strip.png';
import zombieStalkerUrl from '../assets/processed/zombies/stalker-strip.png';
import zombieOddityUrl from '../assets/processed/zombies/oddity-strip.png';
import { WEAPON_TEXTURE_KEYS } from '../config/weaponLibrary';
import { GAME_HEIGHT, GAME_WIDTH, SCENES } from '../constants';
import { configureHighResolutionScene } from '../systems/DisplayManager';
import { GAME_ASSET_KEYS, prepareGameAssets } from '../systems/GameAssetManager';

export class PreloadScene extends Phaser.Scene {
  constructor() {
    super(SCENES.preload);
  }

  preload(): void {
    this.load.spritesheet(WEAPON_TEXTURE_KEYS.guns, weaponGunsUrl, {
      frameWidth: 128,
      frameHeight: 128,
    });
    this.load.image(WEAPON_TEXTURE_KEYS.desertEagle, desertEagleUrl);

    // 玩家:576×48 的 12 帧等距行走表(单元 48×48)。
    this.load.spritesheet(GAME_ASSET_KEYS.player, playerPistoletUrl, {
      frameWidth: 48,
      frameHeight: 48,
    });

    // 僵尸:124×144 的 RPG-Maker 方向表。列距不均匀,先按整图加载,
    // 帧在 prepareGameAssets 里手动切(见 GameAssetManager)。
    this.load.image(GAME_ASSET_KEYS.zombieWalker, zombieWalkerUrl);
    this.load.image(GAME_ASSET_KEYS.zombieRunner, zombieRunnerUrl);
    this.load.image(GAME_ASSET_KEYS.zombieTank, zombieTankUrl);
    this.load.image(GAME_ASSET_KEYS.zombieBomber, zombieBomberUrl);
    this.load.image(GAME_ASSET_KEYS.zombieLurker, zombieLurkerUrl);
    this.load.image(GAME_ASSET_KEYS.zombieDrifter, zombieDrifterUrl);
    this.load.image(GAME_ASSET_KEYS.zombieFeral, zombieFeralUrl);
    this.load.image(GAME_ASSET_KEYS.zombieBloodied, zombieBloodiedUrl);
    this.load.image(GAME_ASSET_KEYS.zombieHeadless, zombieHeadlessUrl);
    this.load.image(GAME_ASSET_KEYS.zombieRotting, zombieRottingUrl);
    this.load.image(GAME_ASSET_KEYS.zombieBloater, zombieBloaterUrl);
    this.load.image(GAME_ASSET_KEYS.zombieCrawler, zombieCrawlerUrl);
    this.load.image(GAME_ASSET_KEYS.zombieStalker, zombieStalkerUrl);
    this.load.image(GAME_ASSET_KEYS.zombieOddity, zombieOddityUrl);
  }

  create(): void {
    configureHighResolutionScene(this);
    prepareGameAssets(this);
    this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x17171a);
    this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2, '军械资料装载完成', {
      fontFamily: '"Microsoft YaHei", sans-serif',
      fontSize: '20px',
      color: '#dddddd',
    }).setOrigin(0.5);

    this.time.delayedCall(80, () => {
      this.scene.start(SCENES.mainMenu);
    });
  }
}
