import Phaser from 'phaser';
import { AUDIO_ASSETS } from '../config/audio';
import playerWatcherGeneratedUrl from '../assets/processed/characters/sprite-watcher.png';
import playerEagleEyeGeneratedUrl from '../assets/processed/characters/sprite-eagle-eye.png';
import playerBastionGeneratedUrl from '../assets/processed/characters/sprite-bastion.png';
import playerRunnerGeneratedUrl from '../assets/processed/characters/sprite-runner.png';
import playerBreacherGeneratedUrl from '../assets/processed/characters/sprite-breacher.png';
import portraitWatcherUrl from '../assets/processed/characters/portrait-watcher.png';
import portraitEagleEyeUrl from '../assets/processed/characters/portrait-eagle-eye.png';
import portraitBastionUrl from '../assets/processed/characters/portrait-bastion.png';
import portraitRunnerUrl from '../assets/processed/characters/portrait-runner.png';
import portraitBreacherUrl from '../assets/processed/characters/portrait-breacher.png';
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
import weaponTopdownPistolUrl from '../assets/processed/weapons/topdown/pistol.png';
import weaponTopdownSmgUrl from '../assets/processed/weapons/topdown/smg.png';
import weaponTopdownRifleUrl from '../assets/processed/weapons/topdown/rifle.png';
import weaponTopdownShotgunUrl from '../assets/processed/weapons/topdown/shotgun.png';
import weaponTopdownAk47Url from '../assets/processed/weapons/topdown/ak47.png';
import weaponTopdownBarrettUrl from '../assets/processed/weapons/topdown/barrett.png';
import weaponTopdownRpgUrl from '../assets/processed/weapons/topdown/rpg.png';
import weaponTopdownM79Url from '../assets/processed/weapons/topdown/m79.png';
import weaponTopdownGatlingUrl from '../assets/processed/weapons/topdown/gatling.png';
import weaponTopdownGoldenM249Url from '../assets/processed/weapons/topdown/golden_m249.png';
import weaponTopdownFlamethrowerUrl from '../assets/processed/weapons/topdown/flamethrower.png';
import weaponM16a4Url from '../assets/processed/weapons/m16a4.png';
import weaponAa12Url from '../assets/processed/weapons/aa12.png';
import weaponDualUziUrl from '../assets/processed/weapons/dual_uzi.png';
import weaponTeslaUrl from '../assets/processed/weapons/tesla.png';
import weaponRailgunUrl from '../assets/processed/weapons/railgun.png';
import weaponCryoSprayerUrl from '../assets/processed/weapons/cryo_sprayer.png';
import weaponTopdownM16a4Url from '../assets/processed/weapons/topdown/m16a4.png';
import weaponTopdownAa12Url from '../assets/processed/weapons/topdown/aa12.png';
import weaponTopdownDualUziUrl from '../assets/processed/weapons/topdown/dual_uzi.png';
import weaponTopdownTeslaUrl from '../assets/processed/weapons/topdown/tesla.png';
import weaponTopdownRailgunUrl from '../assets/processed/weapons/topdown/railgun.png';
import weaponTopdownCryoSprayerUrl from '../assets/processed/weapons/topdown/cryo_sprayer.png';
import obstacleContainerUrl from '../assets/processed/environment/obstacle-container.png';
import obstacleTruckUrl from '../assets/processed/environment/obstacle-truck.png';
import obstacleWallUrl from '../assets/processed/environment/obstacle-wall.png';
import propOilBarrelUrl from '../assets/processed/environment/prop-oil-barrel.png';
import propFlourBarrelUrl from '../assets/processed/environment/prop-flour-barrel.png';
import propMineUrl from '../assets/processed/environment/prop-mine.png';
// 四种战术道具的俯视图标，由 scripts/process_prop_item_assets.py 生成。
// 画幅与 prop-mine.png 同为 46×38，前提写在 entities/Prop.ts 的 PROP_VISUAL_METRICS。
import propFirebombUrl from '../assets/processed/environment/prop-firebomb.png';
import propDustCanisterUrl from '../assets/processed/environment/prop-dust-canister.png';
import propDemoChargeUrl from '../assets/processed/environment/prop-demo-charge.png';
import propCryoCanisterUrl from '../assets/processed/environment/prop-cryo-canister.png';
import pickupAmmoUrl from '../assets/processed/environment/pickup-ammo.png';
import pickupEnhancementUrl from '../assets/processed/environment/pickup-enhancement.png';
// 药品图标：Airos 的两个 CC0 包内本身就是 32×32 单图标，HUD 与掉落物都按 1:1 原生尺寸显示，
// 无需裁切或归一化画布，因此不经过 scripts/ 派生管线，直接加载原始文件（与 Kenney 角色同路子）。
import medicineBandageUrl from '../assets/downloaded/environment/airos-medical-items-32x32/bandage_32x32.png';
import medicineMedkitUrl from '../assets/downloaded/environment/airos-medical-items-32x32/first_aid_kit_32x32.png';
import medicineEnergyDrinkUrl from '../assets/downloaded/environment/airos-food-items-32x32/purple_drink_32x32.png';
import bulletFriendlyUrl from '../assets/processed/environment/bullet-friendly.png';
import bulletExplosiveUrl from '../assets/processed/environment/bullet-explosive.png';
import bulletEnemyUrl from '../assets/processed/environment/bullet-enemy.png';
// 武器攻击特效帧条：每张都是四帧横排，由 scripts/process_effect_assets.py 生成。
// 切帧与建动画在 prepareGameAssets 内完成，帧尺寸登记在 src/config/effectVisuals.ts。
import effectFlameJetUrl from '../assets/processed/effects/flame-jet.png';
import effectFlameBlobUrl from '../assets/processed/effects/flame-blob.png';
import effectFirePatchUrl from '../assets/processed/effects/fire-patch.png';
import effectMuzzleHeavyUrl from '../assets/processed/effects/muzzle-heavy.png';
import effectMuzzleRifleUrl from '../assets/processed/effects/muzzle-rifle.png';
import effectMuzzleShotgunUrl from '../assets/processed/effects/muzzle-shotgun.png';
import effectSmokePuffUrl from '../assets/processed/effects/smoke-puff.png';
import effectExplosionUrl from '../assets/processed/effects/explosion.png';
import effectDustCloudUrl from '../assets/processed/effects/dust-cloud.png';
import { GAME_HEIGHT, GAME_WIDTH, SCENES } from '../constants';
import { configureHighResolutionScene } from '../systems/DisplayManager';
import { GAME_ASSET_KEYS, prepareGameAssets } from '../systems/GameAssetManager';
import { GAME_WEAPON_TEXTURE_KEYS, GAME_WEAPON_TOPDOWN_TEXTURE_KEYS } from '../systems/WeaponAssetManager';
import { ENVIRONMENT_TEXTURE_KEYS } from '../systems/EnvironmentAssetManager';
import { EFFECT_ASSET_KEYS } from '../config/effectVisuals';
import { SoundManager } from '../systems/SoundManager';
import { UI_FONT_FAMILY } from '../ui/fonts';
import {
  CHARACTER_PORTRAIT_TEXTURE_KEYS,
  CHARACTER_TEXTURE_KEYS,
} from '../config/characters';

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
    this.load.image(ENVIRONMENT_TEXTURE_KEYS.propFirebomb, propFirebombUrl);
    this.load.image(ENVIRONMENT_TEXTURE_KEYS.propDustCanister, propDustCanisterUrl);
    this.load.image(ENVIRONMENT_TEXTURE_KEYS.propDemoCharge, propDemoChargeUrl);
    this.load.image(ENVIRONMENT_TEXTURE_KEYS.propCryoCanister, propCryoCanisterUrl);
    this.load.image(ENVIRONMENT_TEXTURE_KEYS.pickupAmmo, pickupAmmoUrl);
    this.load.image(ENVIRONMENT_TEXTURE_KEYS.pickupEnhancement, pickupEnhancementUrl);
    this.load.image(ENVIRONMENT_TEXTURE_KEYS.medicineBandage, medicineBandageUrl);
    this.load.image(ENVIRONMENT_TEXTURE_KEYS.medicineMedkit, medicineMedkitUrl);
    this.load.image(ENVIRONMENT_TEXTURE_KEYS.medicineEnergyDrink, medicineEnergyDrinkUrl);
    this.load.image(ENVIRONMENT_TEXTURE_KEYS.bulletFriendly, bulletFriendlyUrl);
    this.load.image(ENVIRONMENT_TEXTURE_KEYS.bulletExplosive, bulletExplosiveUrl);
    this.load.image(ENVIRONMENT_TEXTURE_KEYS.bulletEnemy, bulletEnemyUrl);

    // 武器攻击特效。用 load.image 而不是 load.spritesheet：切帧统一由 prepareGameAssets
    // 按 EFFECT_TEXTURE_LAYOUTS 做（与感染体方向表同一条路径），这样帧尺寸只有数据表
    // 一处来源，不会出现"预载按 A 切、动画按 B 播"的两套真相。
    this.load.image(EFFECT_ASSET_KEYS.flameJet, effectFlameJetUrl);
    this.load.image(EFFECT_ASSET_KEYS.flameBlob, effectFlameBlobUrl);
    this.load.image(EFFECT_ASSET_KEYS.firePatch, effectFirePatchUrl);
    this.load.image(EFFECT_ASSET_KEYS.muzzleHeavy, effectMuzzleHeavyUrl);
    this.load.image(EFFECT_ASSET_KEYS.muzzleRifle, effectMuzzleRifleUrl);
    this.load.image(EFFECT_ASSET_KEYS.muzzleShotgun, effectMuzzleShotgunUrl);
    this.load.image(EFFECT_ASSET_KEYS.smokePuff, effectSmokePuffUrl);
    this.load.image(EFFECT_ASSET_KEYS.explosion, effectExplosionUrl);
    this.load.image(EFFECT_ASSET_KEYS.dustCloud, effectDustCloudUrl);

    // 武器:图标一套侧视、实机一套俯视。侧视图供 HUD、战前整备、武器库与掉落物，
    // 俯视图只给玩家手上的武器层（理由见 WeaponAssetManager 的两组 key 注释）。
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
    this.load.image(GAME_WEAPON_TEXTURE_KEYS.m16a4, weaponM16a4Url);
    this.load.image(GAME_WEAPON_TEXTURE_KEYS.aa12, weaponAa12Url);
    this.load.image(GAME_WEAPON_TEXTURE_KEYS.dual_uzi, weaponDualUziUrl);
    this.load.image(GAME_WEAPON_TEXTURE_KEYS.tesla, weaponTeslaUrl);
    this.load.image(GAME_WEAPON_TEXTURE_KEYS.railgun, weaponRailgunUrl);
    this.load.image(GAME_WEAPON_TEXTURE_KEYS.cryo_sprayer, weaponCryoSprayerUrl);

    this.load.image(GAME_WEAPON_TOPDOWN_TEXTURE_KEYS.pistol, weaponTopdownPistolUrl);
    this.load.image(GAME_WEAPON_TOPDOWN_TEXTURE_KEYS.smg, weaponTopdownSmgUrl);
    this.load.image(GAME_WEAPON_TOPDOWN_TEXTURE_KEYS.rifle, weaponTopdownRifleUrl);
    this.load.image(GAME_WEAPON_TOPDOWN_TEXTURE_KEYS.shotgun, weaponTopdownShotgunUrl);
    this.load.image(GAME_WEAPON_TOPDOWN_TEXTURE_KEYS.ak47, weaponTopdownAk47Url);
    this.load.image(GAME_WEAPON_TOPDOWN_TEXTURE_KEYS.barrett, weaponTopdownBarrettUrl);
    this.load.image(GAME_WEAPON_TOPDOWN_TEXTURE_KEYS.rpg, weaponTopdownRpgUrl);
    this.load.image(GAME_WEAPON_TOPDOWN_TEXTURE_KEYS.m79, weaponTopdownM79Url);
    this.load.image(GAME_WEAPON_TOPDOWN_TEXTURE_KEYS.gatling, weaponTopdownGatlingUrl);
    this.load.image(GAME_WEAPON_TOPDOWN_TEXTURE_KEYS.golden_m249, weaponTopdownGoldenM249Url);
    this.load.image(GAME_WEAPON_TOPDOWN_TEXTURE_KEYS.flamethrower, weaponTopdownFlamethrowerUrl);
    this.load.image(GAME_WEAPON_TOPDOWN_TEXTURE_KEYS.m16a4, weaponTopdownM16a4Url);
    this.load.image(GAME_WEAPON_TOPDOWN_TEXTURE_KEYS.aa12, weaponTopdownAa12Url);
    this.load.image(GAME_WEAPON_TOPDOWN_TEXTURE_KEYS.dual_uzi, weaponTopdownDualUziUrl);
    this.load.image(GAME_WEAPON_TOPDOWN_TEXTURE_KEYS.tesla, weaponTopdownTeslaUrl);
    this.load.image(GAME_WEAPON_TOPDOWN_TEXTURE_KEYS.railgun, weaponTopdownRailgunUrl);
    this.load.image(GAME_WEAPON_TOPDOWN_TEXTURE_KEYS.cryo_sprayer, weaponTopdownCryoSprayerUrl);

    // 五名角色全部改用项目自生成的 48x48 正俯视精灵（图 B），不再用 Kenney 的 `*_stand.png`。
    // 这批图自带并拢的双拳，所以也不再需要压在武器之上的持枪手层
    // （`CharacterDef.handTextureKey` 五人均为 null，Kenney 时代的 hand-*.png 因此不再加载）。
    // 生成与验收管线见 scripts/generate_character_assets.mjs 与 inspect_character_candidates.py。
    this.load.image(CHARACTER_TEXTURE_KEYS.watcher, playerWatcherGeneratedUrl);
    this.load.image(CHARACTER_TEXTURE_KEYS.eagle_eye, playerEagleEyeGeneratedUrl);
    this.load.image(CHARACTER_TEXTURE_KEYS.bastion, playerBastionGeneratedUrl);
    this.load.image(CHARACTER_TEXTURE_KEYS.runner, playerRunnerGeneratedUrl);
    this.load.image(CHARACTER_TEXTURE_KEYS.breacher, playerBreacherGeneratedUrl);

    // 五名角色的战前档案立绘（图 A）全部改用项目自生成并处理后的 PNG。
    // 2026-08-23 补齐其余四人后 Kenney 矢量占位（portrait-*.svg）不再加载：那批切片取的是
    // 同一套素材的**俯视**姿态，当立绘用本就只是权宜之计，而且矢量栅格化后仍是俯视的人，
    // 与守望者的全身侧身 25° 立绘并排看根本不像一套。
    // 五张 PNG 均由 `process_character_assets.py portrait` 派生，画幅统一按高 480、
    // 四边留 6px（守望者沿用 portrait-downsample 分支，留 5px），因此在
    // PreparationScene 的 188x230 展示区里五人高度一致、只有宽度随体型变化。
    // 生成与验收管线见 scripts/generate_character_assets.mjs 与 inspect_character_candidates.py。
    this.load.image(CHARACTER_PORTRAIT_TEXTURE_KEYS.watcher, portraitWatcherUrl);
    this.load.image(CHARACTER_PORTRAIT_TEXTURE_KEYS.eagle_eye, portraitEagleEyeUrl);
    this.load.image(CHARACTER_PORTRAIT_TEXTURE_KEYS.bastion, portraitBastionUrl);
    this.load.image(CHARACTER_PORTRAIT_TEXTURE_KEYS.runner, portraitRunnerUrl);
    this.load.image(CHARACTER_PORTRAIT_TEXTURE_KEYS.breacher, portraitBreacherUrl);

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
