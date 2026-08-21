import Phaser from 'phaser';
import { AUDIO_ASSETS } from '../config/audio';
import playerWatcherUrl from '../assets/downloaded/characters/kenney-topdown-shooter/PNG/Survivor 1/survivor1_hold.png';
import playerWatcherGeneratedUrl from '../assets/processed/characters/sprite-watcher.png';
import playerEagleEyeUrl from '../assets/downloaded/characters/kenney-topdown-shooter/PNG/Hitman 1/hitman1_hold.png';
import playerBastionUrl from '../assets/downloaded/characters/kenney-topdown-shooter/PNG/Soldier 1/soldier1_hold.png';
import playerRunnerUrl from '../assets/downloaded/characters/kenney-topdown-shooter/PNG/Man Blue/manBlue_hold.png';
import playerBreacherUrl from '../assets/downloaded/characters/kenney-topdown-shooter/PNG/Man Brown/manBrown_hold.png';
import portraitWatcherUrl from '../assets/processed/characters/portrait-watcher.png';
import portraitEagleEyeUrl from '../assets/processed/characters/portrait-eagle-eye.svg';
import portraitBastionUrl from '../assets/processed/characters/portrait-bastion.svg';
import portraitRunnerUrl from '../assets/processed/characters/portrait-runner.svg';
import portraitBreacherUrl from '../assets/processed/characters/portrait-breacher.svg';
import zombieWalkerUrl from '../assets/downloaded/zombies/zombie-rpg-sprites/1ZombieSpriteSheet.png';
import zombieWalkerDirectionalUrl from '../assets/processed/zombies/walker-directional-custom.png';
import zombieWalkerPortraitUrl from '../assets/processed/zombies/walker-portrait.png';
import zombieRunnerDirectionalUrl from '../assets/processed/zombies/runner-directional-custom.png';
import zombieRunnerPortraitUrl from '../assets/processed/zombies/runner-portrait.png';
import zombieBomberDirectionalUrl from '../assets/processed/zombies/bomber-directional-custom.png';
import zombieBomberPortraitUrl from '../assets/processed/zombies/bomber-portrait.png';
import zombieLurkerDirectionalUrl from '../assets/processed/zombies/lurker-directional-custom.png';
import zombieLurkerPortraitUrl from '../assets/processed/zombies/lurker-portrait.png';
import zombieDrifterDirectionalUrl from '../assets/processed/zombies/drifter-directional-custom.png';
import zombieDrifterPortraitUrl from '../assets/processed/zombies/drifter-portrait.png';
import zombieFeralDirectionalUrl from '../assets/processed/zombies/feral-directional-custom.png';
import zombieFeralPortraitUrl from '../assets/processed/zombies/feral-portrait.png';
import zombieLurkerUrl from '../assets/downloaded/zombies/zombie-rpg-sprites/2ZombieSpriteSheet.png';
import zombieRunnerUrl from '../assets/downloaded/zombies/zombie-rpg-sprites/3ZombieSpriteSheet.png';
import zombieDrifterUrl from '../assets/downloaded/zombies/zombie-rpg-sprites/4ZombieSpriteSheet.png';
import zombieBomberUrl from '../assets/downloaded/zombies/zombie-rpg-sprites/6ZombieSpriteSheet.png';
import zombieFeralUrl from '../assets/zombie-1.1/PNG/48x64/zombie-NESW.png';
import zombieBloodiedUrl from '../assets/zombie-1.1/PNG/48x64/bloody_zombie-NESW.png';
import zombieHeadlessUrl from '../assets/zombie-1.1/PNG/48x64/headless_zombie-NESW.png';
import zombieBloodiedDirectionalUrl from '../assets/processed/zombies/bloodied-directional-custom.png';
import zombieBloodiedPortraitUrl from '../assets/processed/zombies/bloodied-portrait.png';
import zombieHeadlessDirectionalUrl from '../assets/processed/zombies/headless-directional-custom.png';
import zombieHeadlessPortraitUrl from '../assets/processed/zombies/headless-portrait.png';
// tank / rotting / bloater / stalker 与 tank_boss 于 2026-08-21 换为自生成素材。
// crawler、oddity 与其余三个 Boss 的自生成素材尚未齐全，仍用第三方素材，
// 待生成后按同一形态替换。执行记录见
// docs/execution/2026-08-21-remaining-infected-and-boss-art.md。
import zombieTankDirectionalUrl from '../assets/processed/zombies/tank-directional-custom.png';
import zombieTankPortraitUrl from '../assets/processed/zombies/tank-portrait.png';
import zombieRottingDirectionalUrl from '../assets/processed/zombies/rotting-directional-custom.png';
import zombieRottingPortraitUrl from '../assets/processed/zombies/rotting-portrait.png';
import zombieBloaterDirectionalUrl from '../assets/processed/zombies/bloater-directional-custom.png';
import zombieBloaterPortraitUrl from '../assets/processed/zombies/bloater-portrait.png';
import zombieStalkerDirectionalUrl from '../assets/processed/zombies/stalker-directional-custom.png';
import zombieStalkerPortraitUrl from '../assets/processed/zombies/stalker-portrait.png';
import zombieCrawlerDirectionalUrl from '../assets/processed/zombies/crawler-directional-custom.png';
import zombieCrawlerPortraitUrl from '../assets/processed/zombies/crawler-portrait.png';
import zombieOddityDirectionalUrl from '../assets/processed/zombies/oddity-directional-custom.png';
import zombieOddityPortraitUrl from '../assets/processed/zombies/oddity-portrait.png';
import zombieTankBossUrl from '../assets/processed/zombies/tank-boss-move-custom.png';
import zombieTankBossAttackUrl from '../assets/processed/zombies/tank-boss-attack-custom.png';
import zombieTankBossDeath0Url from '../assets/processed/zombies/tank-boss-death-0-custom.png';
import zombieTankBossDeath1Url from '../assets/processed/zombies/tank-boss-death-1-custom.png';
import zombieTankBossPortraitUrl from '../assets/processed/zombies/tank-boss-portrait.png';
import zombieBomberBossUrl from '../assets/processed/zombies/bomber-boss-move-custom.png';
import zombieBomberBossAttackUrl from '../assets/processed/zombies/bomber-boss-attack-custom.png';
import zombieBomberBossDeath0Url from '../assets/processed/zombies/bomber-boss-death-0-custom.png';
import zombieBomberBossDeath1Url from '../assets/processed/zombies/bomber-boss-death-1-custom.png';
import zombieBomberBossPortraitUrl from '../assets/processed/zombies/bomber-boss-portrait.png';
import zombieHunterBossUrl from '../assets/processed/zombies/hunter-boss-move-custom.png';
import zombieHunterBossAttackUrl from '../assets/processed/zombies/hunter-boss-attack-custom.png';
import zombieHunterBossDeath0Url from '../assets/processed/zombies/hunter-boss-death-0-custom.png';
import zombieHunterBossDeath1Url from '../assets/processed/zombies/hunter-boss-death-1-custom.png';
import zombieHunterBossPortraitUrl from '../assets/processed/zombies/hunter-boss-portrait.png';
import zombieMatriarchBossUrl from '../assets/processed/zombies/matriarch-boss-move-custom.png';
import zombieMatriarchBossAttackUrl from '../assets/processed/zombies/matriarch-boss-attack-custom.png';
import zombieMatriarchBossDeath0Url from '../assets/processed/zombies/matriarch-boss-death-0-custom.png';
import zombieMatriarchBossDeath1Url from '../assets/processed/zombies/matriarch-boss-death-1-custom.png';
import zombieMatriarchBossPortraitUrl from '../assets/processed/zombies/matriarch-boss-portrait.png';
import weaponPistolUrl from '../assets/processed/weapons/pistol.png';
import weaponSmgUrl from '../assets/processed/weapons/smg.png';
import weaponRifleUrl from '../assets/processed/weapons/rifle.png';
import weaponShotgunUrl from '../assets/processed/weapons/shotgun.png';
import weaponAk47Url from '../assets/processed/weapons/ak47.png';
import weaponBarrettUrl from '../assets/processed/weapons/barrett.png';
import weaponRpgUrl from '../assets/processed/weapons/rpg.png';
import weaponM79Url from '../assets/processed/weapons/m79.png';
import weaponGatlingUrl from '../assets/processed/weapons/gatling.png';
import weaponGoldenM249Url from '../assets/processed/weapons/golden_m249.png';
import weaponFlamethrowerUrl from '../assets/processed/weapons/flamethrower.png';
import obstacleContainerUrl from '../assets/processed/environment/obstacle-container.png';
import obstacleTruckUrl from '../assets/processed/environment/obstacle-truck.png';
import obstacleWallUrl from '../assets/processed/environment/obstacle-wall.png';
import propOilBarrelUrl from '../assets/processed/environment/prop-oil-barrel.png';
import propFlourBarrelUrl from '../assets/processed/environment/prop-flour-barrel.png';
import propMineUrl from '../assets/processed/environment/prop-mine.png';
import pickupAmmoUrl from '../assets/processed/environment/pickup-ammo.png';
import pickupHealthUrl from '../assets/processed/environment/pickup-health.png';
import pickupEnhancementUrl from '../assets/processed/environment/pickup-enhancement.png';
// 药品图标：Airos 的两个 CC0 包内本身就是 32×32 单图标，HUD 与掉落物都按 1:1 原生尺寸显示，
// 无需裁切或归一化画布，因此不经过 scripts/ 派生管线，直接加载原始文件（与 Kenney 角色同路子）。
import medicineBandageUrl from '../assets/downloaded/environment/airos-medical-items-32x32/bandage_32x32.png';
import medicineMedkitUrl from '../assets/downloaded/environment/airos-medical-items-32x32/first_aid_kit_32x32.png';
import medicineEnergyDrinkUrl from '../assets/downloaded/environment/airos-food-items-32x32/purple_drink_32x32.png';
import bulletFriendlyUrl from '../assets/processed/environment/bullet-friendly.png';
import bulletExplosiveUrl from '../assets/processed/environment/bullet-explosive.png';
import bulletEnemyUrl from '../assets/processed/environment/bullet-enemy.png';
import { GAME_HEIGHT, GAME_WIDTH, SCENES } from '../constants';
import { configureHighResolutionScene, DISPLAY_RENDER_SCALE } from '../systems/DisplayManager';
import { GAME_ASSET_KEYS, prepareGameAssets } from '../systems/GameAssetManager';
import { GAME_WEAPON_TEXTURE_KEYS } from '../systems/WeaponAssetManager';
import { ENVIRONMENT_TEXTURE_KEYS } from '../systems/EnvironmentAssetManager';
import { SoundManager } from '../systems/SoundManager';
import { UI_FONT_FAMILY } from '../ui/fonts';
import { CHARACTER_PORTRAIT_TEXTURE_KEYS, CHARACTER_TEXTURE_KEYS } from '../config/characters';

/**
 * 档案立绘的矢量栅格化基准倍率。
 *
 * 立绘 SVG 逻辑画幅为 44 x 48，战前整备展示区约 188 x 230，1x 渲染档下按 5 倍
 * 栅格化即 220 x 240，已经覆盖展示所需像素；再乘当前渲染倍率，使 2x 渲染档得到
 * 440 x 480，两档都保持轻微降采样而不是放大，因此不会出现放大模糊。
 */
const PORTRAIT_BASE_SCALE = 5;

export class PreloadScene extends Phaser.Scene {
  constructor() {
    super(SCENES.preload);
  }

  preload(): void {
    for (const asset of AUDIO_ASSETS) {
      this.load.audio(asset.key, asset.url);
    }

    this.load.image(ENVIRONMENT_TEXTURE_KEYS.obstacleContainer, obstacleContainerUrl);
    this.load.image(ENVIRONMENT_TEXTURE_KEYS.obstacleTruck, obstacleTruckUrl);
    this.load.image(ENVIRONMENT_TEXTURE_KEYS.obstacleWall, obstacleWallUrl);
    this.load.image(ENVIRONMENT_TEXTURE_KEYS.propOilBarrel, propOilBarrelUrl);
    this.load.image(ENVIRONMENT_TEXTURE_KEYS.propFlourBarrel, propFlourBarrelUrl);
    this.load.image(ENVIRONMENT_TEXTURE_KEYS.propMine, propMineUrl);
    this.load.image(ENVIRONMENT_TEXTURE_KEYS.pickupAmmo, pickupAmmoUrl);
    this.load.image(ENVIRONMENT_TEXTURE_KEYS.pickupHealth, pickupHealthUrl);
    this.load.image(ENVIRONMENT_TEXTURE_KEYS.pickupEnhancement, pickupEnhancementUrl);
    this.load.image(ENVIRONMENT_TEXTURE_KEYS.medicineBandage, medicineBandageUrl);
    this.load.image(ENVIRONMENT_TEXTURE_KEYS.medicineMedkit, medicineMedkitUrl);
    this.load.image(ENVIRONMENT_TEXTURE_KEYS.medicineEnergyDrink, medicineEnergyDrinkUrl);
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
    this.load.image(GAME_WEAPON_TEXTURE_KEYS.gatling, weaponGatlingUrl);
    this.load.image(GAME_WEAPON_TEXTURE_KEYS.golden_m249, weaponGoldenM249Url);
    this.load.image(GAME_WEAPON_TEXTURE_KEYS.flamethrower, weaponFlamethrowerUrl);

    // 五名角色复用 Kenney 同套朝右持枪规格，人物层继续覆盖武器枪托与握把。
    this.load.image(GAME_ASSET_KEYS.player, playerWatcherUrl);
    this.load.image(CHARACTER_TEXTURE_KEYS.watcher, playerWatcherGeneratedUrl);
    this.load.image(CHARACTER_TEXTURE_KEYS.eagle_eye, playerEagleEyeUrl);
    this.load.image(CHARACTER_TEXTURE_KEYS.bastion, playerBastionUrl);
    this.load.image(CHARACTER_TEXTURE_KEYS.runner, playerRunnerUrl);
    this.load.image(CHARACTER_TEXTURE_KEYS.breacher, playerBreacherUrl);

    // 守望者已替换为项目生成并抠图处理后的高分辨率档案立绘；其它角色
    // 暂时继续使用同源矢量占位图，避免在素材未验收前混用未处理原图。
    const portraitScale = PORTRAIT_BASE_SCALE * DISPLAY_RENDER_SCALE;
    this.load.image(CHARACTER_PORTRAIT_TEXTURE_KEYS.watcher, portraitWatcherUrl);
    this.load.svg(CHARACTER_PORTRAIT_TEXTURE_KEYS.eagle_eye, portraitEagleEyeUrl, { scale: portraitScale });
    this.load.svg(CHARACTER_PORTRAIT_TEXTURE_KEYS.bastion, portraitBastionUrl, { scale: portraitScale });
    this.load.svg(CHARACTER_PORTRAIT_TEXTURE_KEYS.runner, portraitRunnerUrl, { scale: portraitScale });
    this.load.svg(CHARACTER_PORTRAIT_TEXTURE_KEYS.breacher, portraitBreacherUrl, { scale: portraitScale });

    // 僵尸:124×144 的 RPG-Maker 方向表。列距不均匀,先按整图加载,
    // 帧在 prepareGameAssets 里手动切(见 GameAssetManager)。
    this.load.image(GAME_ASSET_KEYS.zombieWalker, zombieWalkerUrl);
    this.load.image(GAME_ASSET_KEYS.zombieWalkerDirectional, zombieWalkerDirectionalUrl);
    this.load.image(GAME_ASSET_KEYS.zombieWalkerPortrait, zombieWalkerPortraitUrl);
    // Runner、Bomber 与 Lurker 已换成项目生成的方向表与独立立绘；
    // Curt 原表仍登记，drifter、tank 仍在用同一张图。
    this.load.image(GAME_ASSET_KEYS.zombieRunnerDirectional, zombieRunnerDirectionalUrl);
    this.load.image(GAME_ASSET_KEYS.zombieRunnerPortrait, zombieRunnerPortraitUrl);
    this.load.image(GAME_ASSET_KEYS.zombieRunner, zombieRunnerUrl);
    this.load.image(GAME_ASSET_KEYS.zombieBomberDirectional, zombieBomberDirectionalUrl);
    this.load.image(GAME_ASSET_KEYS.zombieBomberPortrait, zombieBomberPortraitUrl);
    this.load.image(GAME_ASSET_KEYS.zombieBomber, zombieBomberUrl);
    this.load.image(GAME_ASSET_KEYS.zombieLurkerDirectional, zombieLurkerDirectionalUrl);
    this.load.image(GAME_ASSET_KEYS.zombieLurkerPortrait, zombieLurkerPortraitUrl);
    this.load.image(GAME_ASSET_KEYS.zombieLurker, zombieLurkerUrl);
    this.load.image(GAME_ASSET_KEYS.zombieDrifterDirectional, zombieDrifterDirectionalUrl);
    this.load.image(GAME_ASSET_KEYS.zombieDrifterPortrait, zombieDrifterPortraitUrl);
    this.load.image(GAME_ASSET_KEYS.zombieDrifter, zombieDrifterUrl);
    this.load.image(GAME_ASSET_KEYS.zombieFeralDirectional, zombieFeralDirectionalUrl);
    this.load.image(GAME_ASSET_KEYS.zombieFeralPortrait, zombieFeralPortraitUrl);
    this.load.image(GAME_ASSET_KEYS.zombieFeral, zombieFeralUrl);
    this.load.image(GAME_ASSET_KEYS.zombieBloodied, zombieBloodiedUrl);
    this.load.image(GAME_ASSET_KEYS.zombieHeadless, zombieHeadlessUrl);
    this.load.image(GAME_ASSET_KEYS.zombieBloodiedDirectional, zombieBloodiedDirectionalUrl);
    this.load.image(GAME_ASSET_KEYS.zombieBloodiedPortrait, zombieBloodiedPortraitUrl);
    this.load.image(GAME_ASSET_KEYS.zombieHeadlessDirectional, zombieHeadlessDirectionalUrl);
    this.load.image(GAME_ASSET_KEYS.zombieHeadlessPortrait, zombieHeadlessPortraitUrl);
    this.load.image(GAME_ASSET_KEYS.zombieTankDirectional, zombieTankDirectionalUrl);
    this.load.image(GAME_ASSET_KEYS.zombieTankPortrait, zombieTankPortraitUrl);
    this.load.image(GAME_ASSET_KEYS.zombieRottingDirectional, zombieRottingDirectionalUrl);
    this.load.image(GAME_ASSET_KEYS.zombieRottingPortrait, zombieRottingPortraitUrl);
    this.load.image(GAME_ASSET_KEYS.zombieBloaterDirectional, zombieBloaterDirectionalUrl);
    this.load.image(GAME_ASSET_KEYS.zombieBloaterPortrait, zombieBloaterPortraitUrl);
    this.load.image(GAME_ASSET_KEYS.zombieStalkerDirectional, zombieStalkerDirectionalUrl);
    this.load.image(GAME_ASSET_KEYS.zombieStalkerPortrait, zombieStalkerPortraitUrl);
    this.load.image(GAME_ASSET_KEYS.zombieCrawlerDirectional, zombieCrawlerDirectionalUrl);
    this.load.image(GAME_ASSET_KEYS.zombieCrawlerPortrait, zombieCrawlerPortraitUrl);
    this.load.image(GAME_ASSET_KEYS.zombieOddityDirectional, zombieOddityDirectionalUrl);
    this.load.image(GAME_ASSET_KEYS.zombieOddityPortrait, zombieOddityPortraitUrl);
    this.load.image(GAME_ASSET_KEYS.zombieTankBoss, zombieTankBossUrl);
    this.load.image(GAME_ASSET_KEYS.zombieTankBossAttack, zombieTankBossAttackUrl);
    this.load.image(GAME_ASSET_KEYS.zombieTankBossDeath0, zombieTankBossDeath0Url);
    this.load.image(GAME_ASSET_KEYS.zombieTankBossDeath1, zombieTankBossDeath1Url);
    this.load.image(GAME_ASSET_KEYS.zombieTankBossPortrait, zombieTankBossPortraitUrl);
    this.load.image(GAME_ASSET_KEYS.zombieBomberBoss, zombieBomberBossUrl);
    this.load.image(GAME_ASSET_KEYS.zombieBomberBossAttack, zombieBomberBossAttackUrl);
    this.load.image(GAME_ASSET_KEYS.zombieBomberBossDeath0, zombieBomberBossDeath0Url);
    this.load.image(GAME_ASSET_KEYS.zombieBomberBossDeath1, zombieBomberBossDeath1Url);
    this.load.image(GAME_ASSET_KEYS.zombieBomberBossPortrait, zombieBomberBossPortraitUrl);
    this.load.image(GAME_ASSET_KEYS.zombieHunterBoss, zombieHunterBossUrl);
    this.load.image(GAME_ASSET_KEYS.zombieHunterBossAttack, zombieHunterBossAttackUrl);
    this.load.image(GAME_ASSET_KEYS.zombieHunterBossDeath0, zombieHunterBossDeath0Url);
    this.load.image(GAME_ASSET_KEYS.zombieHunterBossDeath1, zombieHunterBossDeath1Url);
    this.load.image(GAME_ASSET_KEYS.zombieHunterBossPortrait, zombieHunterBossPortraitUrl);
    this.load.image(GAME_ASSET_KEYS.zombieMatriarchBoss, zombieMatriarchBossUrl);
    this.load.image(GAME_ASSET_KEYS.zombieMatriarchBossAttack, zombieMatriarchBossAttackUrl);
    this.load.image(GAME_ASSET_KEYS.zombieMatriarchBossDeath0, zombieMatriarchBossDeath0Url);
    this.load.image(GAME_ASSET_KEYS.zombieMatriarchBossDeath1, zombieMatriarchBossDeath1Url);
    this.load.image(GAME_ASSET_KEYS.zombieMatriarchBossPortrait, zombieMatriarchBossPortraitUrl);
  }

  create(): void {
    configureHighResolutionScene(this);
    prepareGameAssets(this);
    SoundManager.assetsReady();
    this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x17171a);
    this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2, '军械资料装载完成', {
      fontFamily: UI_FONT_FAMILY,
      fontSize: '20px',
      color: '#dddddd',
    }).setOrigin(0.5);

    this.time.delayedCall(80, () => {
      this.scene.start(SCENES.mainMenu);
    });
  }
}
