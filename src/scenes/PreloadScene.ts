import Phaser from 'phaser';
import playerBaseUrl from '../assets/downloaded/characters/kenney-topdown-shooter/PNG/Survivor 1/survivor1_hold.png';
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
import weaponPistolUrl from '../assets/processed/weapons/pistol.png';
import weaponSmgUrl from '../assets/processed/weapons/smg.png';
import weaponRifleUrl from '../assets/processed/weapons/rifle.png';
import weaponShotgunUrl from '../assets/processed/weapons/shotgun.png';
import weaponAk47Url from '../assets/processed/weapons/ak47.png';
import weaponBarrettUrl from '../assets/processed/weapons/barrett.png';
import weaponRpgUrl from '../assets/processed/weapons/rpg.png';
import weaponM79Url from '../assets/processed/weapons/m79.png';
import obstacleContainerUrl from '../assets/processed/environment/obstacle-container.png';
import obstacleTruckUrl from '../assets/processed/environment/obstacle-truck.png';
import obstacleWallUrl from '../assets/processed/environment/obstacle-wall.png';
import propOilBarrelUrl from '../assets/processed/environment/prop-oil-barrel.png';
import propFlourBarrelUrl from '../assets/processed/environment/prop-flour-barrel.png';
import propMineUrl from '../assets/processed/environment/prop-mine.png';
import pickupAmmoUrl from '../assets/processed/environment/pickup-ammo.png';
import pickupHealthUrl from '../assets/processed/environment/pickup-health.png';
import pickupEnhancementUrl from '../assets/processed/environment/pickup-enhancement.png';
import bulletFriendlyUrl from '../assets/processed/environment/bullet-friendly.png';
import bulletExplosiveUrl from '../assets/processed/environment/bullet-explosive.png';
import bulletEnemyUrl from '../assets/processed/environment/bullet-enemy.png';
import { GAME_HEIGHT, GAME_WIDTH, SCENES } from '../constants';
import { configureHighResolutionScene } from '../systems/DisplayManager';
import { GAME_ASSET_KEYS, prepareGameAssets } from '../systems/GameAssetManager';
import { GAME_WEAPON_TEXTURE_KEYS } from '../systems/WeaponAssetManager';
import { ENVIRONMENT_TEXTURE_KEYS } from '../systems/EnvironmentAssetManager';

export class PreloadScene extends Phaser.Scene {
  constructor() {
    super(SCENES.preload);
  }

  preload(): void {
    this.load.image(ENVIRONMENT_TEXTURE_KEYS.obstacleContainer, obstacleContainerUrl);
    this.load.image(ENVIRONMENT_TEXTURE_KEYS.obstacleTruck, obstacleTruckUrl);
    this.load.image(ENVIRONMENT_TEXTURE_KEYS.obstacleWall, obstacleWallUrl);
    this.load.image(ENVIRONMENT_TEXTURE_KEYS.propOilBarrel, propOilBarrelUrl);
    this.load.image(ENVIRONMENT_TEXTURE_KEYS.propFlourBarrel, propFlourBarrelUrl);
    this.load.image(ENVIRONMENT_TEXTURE_KEYS.propMine, propMineUrl);
    this.load.image(ENVIRONMENT_TEXTURE_KEYS.pickupAmmo, pickupAmmoUrl);
    this.load.image(ENVIRONMENT_TEXTURE_KEYS.pickupHealth, pickupHealthUrl);
    this.load.image(ENVIRONMENT_TEXTURE_KEYS.pickupEnhancement, pickupEnhancementUrl);
    this.load.image(ENVIRONMENT_TEXTURE_KEYS.bulletFriendly, bulletFriendlyUrl);
    this.load.image(ENVIRONMENT_TEXTURE_KEYS.bulletExplosive, bulletExplosiveUrl);
    this.load.image(ENVIRONMENT_TEXTURE_KEYS.bulletEnemy, bulletEnemyUrl);

    // 武器:实机与图鉴共用同一套处理后的透明 PNG，不再加载带标签文字的原始素材表。
    this.load.image(GAME_WEAPON_TEXTURE_KEYS.pistol, weaponPistolUrl);
    this.load.image(GAME_WEAPON_TEXTURE_KEYS.smg, weaponSmgUrl);
    this.load.image(GAME_WEAPON_TEXTURE_KEYS.rifle, weaponRifleUrl);
    this.load.image(GAME_WEAPON_TEXTURE_KEYS.shotgun, weaponShotgunUrl);
    this.load.image(GAME_WEAPON_TEXTURE_KEYS.ak47, weaponAk47Url);
    this.load.image(GAME_WEAPON_TEXTURE_KEYS.barrett, weaponBarrettUrl);
    this.load.image(GAME_WEAPON_TEXTURE_KEYS.rpg, weaponRpgUrl);
    this.load.image(GAME_WEAPON_TEXTURE_KEYS.m79, weaponM79Url);

    // 玩家使用 Kenney 朝右的双手持枪姿态；运行时由人物层覆盖武器枪托与握把。
    this.load.image(GAME_ASSET_KEYS.player, playerBaseUrl);

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
