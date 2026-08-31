import Phaser from 'phaser';
import type { ItemId } from '../config/items';
import { ITEMS } from '../config/items';
import { LEVELS } from '../config/levels';
import { WEAPONS, type WeaponId } from '../config/weapons';
import { BOSS_PHASE_TRANSITION_DROPS, ZOMBIES, isBossZombie, type ZombieId } from '../config/zombies';
import { getEndlessBossScaling } from '../config/endless';
import {
  buildMonsterReviewPlacements,
  type MonsterReviewPlacement,
} from '../config/monsterArtReview';
import { DEPTH, EVENTS, GAME_HEIGHT, GAME_WIDTH, SCENES } from '../constants';
import { Bullet } from '../entities/Bullet';
import { EnemyProjectile } from '../entities/EnemyProjectile';
import { Obstacle } from '../entities/Obstacle';
import { Player } from '../entities/Player';
import { Prop } from '../entities/Prop';
import { Zombie, type BossPhaseTransition } from '../entities/Zombie';
import { AreaEffectFactory } from '../systems/AreaEffectFactory';
import { EffectSpritePool } from '../systems/EffectSpritePool';
import { renderBattlefield } from '../systems/BattlefieldRenderer';
import { configureHighResolutionScene } from '../systems/DisplayManager';
import { createInitialState, type GameMode, type GameState } from '../systems/GameState';
import { InputManager } from '../systems/InputManager';
import { ItemManager } from '../systems/ItemManager';
import { MedicineManager } from '../systems/MedicineManager';
import { CharacterSkillManager } from '../systems/CharacterSkillManager';
import { DEFAULT_ACCESSIBILITY_SETTINGS, SAVE_KEYS, SaveManager } from '../systems/SaveManager';
import { WaveManager } from '../systems/WaveManager';
import {
  WeaponManager,
  type WeaponFireFeedback,
  type WeaponMobilityStatus,
  type WeaponReloadStatus,
  type WeaponStatus,
} from '../systems/WeaponManager';
import { SoundManager } from '../systems/SoundManager';
import { EnemyAbilitySystem } from '../systems/EnemyAbilitySystem';
import { FlameConeSystem } from '../systems/FlameConeSystem';
import type { AabbTile } from '../utils/geometry';
import { EnhancementManager } from '../systems/EnhancementManager';
import { CorpseLayer } from '../systems/CorpseLayer';
import { DamageNumberManager } from '../systems/DamageNumberManager';
import { ScriptedMomentSystem } from '../systems/ScriptedMomentSystem';
import { SlowMotionManager } from '../systems/SlowMotionManager';
import { accessibilityFactor, resolveShake, type DamageImpact, type DamageNumberKind, type FeedbackTier } from '../systems/FeedbackRules';
import { resolveKnockbackDistance, shouldExecute } from '../systems/WeaponCombatRules';
import {
  advanceKillStreak,
  resolveKillStreakMilestone,
  KILL_STREAK_WINDOW,
} from '../systems/KillStreakRules';
import { CARD_SELECTED_EVENT } from './CardSelectionScene';
import { ENHANCEMENTS } from '../config/enhancements';
import { WEAPON_FIRE_EVENTS, type MusicMode } from '../config/audio';
import {
  resolveDropChance,
  TESTING_AMMO_RESERVE,
} from '../config/testing';
import { ObjectPool } from '../utils/ObjectPool';
import { SpatialHash } from '../utils/SpatialHash';
import { distanceSq } from '../utils/math';
import { angleBetween as angleBetweenPoints } from '../utils/math';
import type { ChainLightningDef, DropDef, EndlessWaveMeta, MarkOnHitDef, SlowOnHitDef, WaveDef, ZombieScaling } from '../config/types';
import type { Keybinds } from '../config/keybinds';
import {
  ENDLESS_PROP_MIN_DISTANCE,
  getOldestEndlessProp,
  resolveEndlessOverdrive,
} from '../systems/EndlessModePolicy';
import { resolveAdaptiveAmmoOpportunity } from '../systems/AmmoSupplyRules';
import { resumePhysicsAfterPause } from '../systems/SceneLifecycleRules';
import {
  DamageEventBuffer,
  cloneCombatDiagnostics,
  createCombatDiagnostics,
  type CombatDiagnosticsSnapshot,
  type PlayerDamageSource,
} from '../systems/CombatDiagnostics';
import {
  createTargetMark,
  createImpactFragmentBlasts,
  resolveTargetMarkDamageFactor,
  type TargetMarkState,
} from '../systems/EnhancementCombatRules';
import { isDeveloperCheatEnabled } from '../systems/DeveloperCheats';
import { MAX_WEAPON_LOADOUT_SIZE } from '../config/loadout';
import {
  DEFAULT_CHARACTER_ID,
  getCharacterDef,
  isCharacterId,
  type CharacterId,
} from '../config/characters';
import {
  isLastMagazineWindow,
  resolveHeadshotDamage,
  resolveIncomingPlayerDamage,
  rollHeadshot,
  scalePlayerEffect,
} from '../systems/CharacterCombatRules';
import { MEDICINES, type MedicineId } from '../config/medicine';
import type { CharacterActiveDef } from '../config/characters';
import { skillMoveSpeedMultiplier } from '../systems/CharacterSkillRules';
import { resolveDashTarget } from '../systems/CharacterSkillGeometry';

interface GameSceneData {
  mode?: GameMode;
  levelId?: string | null;
  starterWeaponId?: WeaponId;
  characterId?: CharacterId;
}

export interface BossStatus {
  name: string;
  health: number;
  maxHealth: number;
  phase: number | null;
  totalPhases: number | null;
  phaseLabel: string | null;
  recovery: { active: boolean; remaining: number; damageMultiplier: number };
}

/**
 * 战场被冻结的原因。
 * 「暂停」不再是一个布尔量：ESC 菜单和抽卡界面都会冻结战场，但只有前者该显示暂停菜单，
 * 否则抽卡时会有一层可点击的菜单压在卡片下面。
 */
export type PauseReason = 'menu' | 'cardSelection';

/** 未开局或首帧之前的负重状态：完全不受影响。 */
const NO_ENCUMBRANCE: WeaponMobilityStatus = { multiplier: 1, braceRatio: 0, load: 0 };

/**
 * 抽卡场景允许缺席的宽限时长（毫秒，主循环时间）。
 * `scene.launch` 是入队执行，正常也要等一两帧才 active，所以不能一发现缺席就自愈。
 */
const CARD_SELECTION_LAUNCH_GRACE_MS = 1500;

export class GameScene extends Phaser.Scene {
  private mode: GameMode = 'level';
  private levelId: string | null = 'level_1';
  private starterWeaponId: WeaponId = 'pistol';
  private characterId: CharacterId = DEFAULT_CHARACTER_ID;
  private loadoutWeaponIds: WeaponId[] = ['pistol'];
  private state!: GameState;

  private inputManager!: InputManager;
  private player!: Player;
  private bulletPool!: ObjectPool<Bullet>;
  private enemyProjectilePool!: ObjectPool<EnemyProjectile>;
  private zombiePool!: ObjectPool<Zombie>;
  private weaponManager!: WeaponManager;
  private itemManager!: ItemManager;
  private medicineManager!: MedicineManager;
  private skillManager!: CharacterSkillManager;
  private areaEffects!: AreaEffectFactory;
  private effectSprites!: EffectSpritePool;
  private enemyAbilitySystem!: EnemyAbilitySystem;
  /** 喷火器的扇形火焰：自己负责表现与每秒伤害结算，不经过子弹池。 */
  private flameCone!: FlameConeSystem;
  private waveManager!: WaveManager;
  private corpseLayer!: CorpseLayer;
  private damageNumbers!: DamageNumberManager;
  private slowMotion!: SlowMotionManager;
  private scriptedMoments!: ScriptedMomentSystem;
  /**
   * 当帧负重状态。`update` 里算一次，移速、角色阴影和 HUD 共读同一份，
   * 避免 HUD 自己重算出一个和实际移速不一致的百分比。
   */
  private weaponMobility: WeaponMobilityStatus = NO_ENCUMBRANCE;

  /**
   * 美术检阅波已摆放的同类只数，用于把第 n 只对应到摆位表的第 n 格。
   * 只在 `TESTING_FLAGS.monsterArtReviewWave` 开启的无尽模式第 1 波使用。
   */
  private artReviewPlacedByType = new Map<ZombieId, number>();
  /** 摆位表按需构建一次并缓存：它是纯函数结果，144 次生成不必各算一遍。 */
  private artReviewPlacements: MonsterReviewPlacement[] | null = null;

  /** 连杀窗口状态。窗口判定见 `KillStreakRules.advanceKillStreak`。 */
  private killStreak = 0;
  private lastKillAt = -Infinity;
  private heartbeatEvent: Phaser.Time.TimerEvent | null = null;
  /** 连锁标记只活在当前战局；Zombie 回池前必须删除，避免复用到下一只感染体。 */
  private readonly targetMarks = new Map<Zombie, TargetMarkState>();

  private propGroup!: Phaser.GameObjects.Group;
  private props: Prop[] = [];
  private obstacleGroup!: Phaser.Physics.Arcade.StaticGroup;
  /** 掩体的视觉容器。碰撞砖在 `obstacleGroup` 里，这里留引用是为了重开一局时能销毁干净。 */
  private obstacles: Obstacle[] = [];
  /**
   * 掩体碰撞砖的纯几何快照，供扇形火焰做遮挡判定。
   * 掩体是静态的，进关时一次算好；每跳重新从 Obstacle 里拼会白白分配几百个对象。
   */
  private obstacleTiles: AabbTile[] = [];
  private readonly enemySpatialHash = new SpatialHash<Zombie>(96);
  private gameEnded = false;
  private pauseReason: PauseReason | null = null;
  /**
   * 进入冻结时的游戏主循环时间，解除冻结后据此把全部绝对时间点整体后移。
   * 这里读 `game.loop.time` 而不是 `time.now`：场景 sleep 期间 scene clock 完全不更新，
   * `time.now` 会停在入睡那一刻，唤醒回调里读到的是过期值，算出的冻结时长会短掉整段挂起时间。
   * `Clock.now` 每帧就是从 `loop.time` 赋值的，两者同源，可以直接相减。
   */
  private frozenAtLoopTime = 0;
  /** 进入抽卡冻结的主循环时间，供 `watchdogCardSelection` 判断界面是否迟迟不出现。 */
  private cardSelectionPausedAt = 0;
  private rewardContinuationPending = false;
  /**
   * 尚未弹出抽卡界面的强化包数量。
   *
   * 掉落改为即时生效后，一波怪同时死亡会在**同一帧**连续结算出多个强化包，而抽卡界面
   * 一次只能开一个。之前掉落物留在地上时天然形成排队（选完卡再去捡下一个），改成即时
   * 生效后这条承接机制消失，多余的强化包会静默蒸发。
   *
   * 这里改成显式排队：第一个立即开界面，其余入队，每次选卡结束后再取一个。
   */
  private pendingEnhancementPacks = 0;
  private bossDeathPendingUntil = 0;
  /** 挂起战局恢复时必须回到挂起前的战斗曲目，Boss 波不能退回普通 BGM。 */
  private battleMusicMode: Extract<MusicMode, 'battle' | 'boss'> = 'battle';
  /** 长局只保留最近 96 次实际扣血，既覆盖失败前窗口，也限制内存占用。 */
  private readonly damageEvents = new DamageEventBuffer(96);
  /** Game Over / shutdown 后返回冻结快照，避免探针读取已销毁的 Phaser 对象。 */
  private finalCombatDiagnostics: CombatDiagnosticsSnapshot | null = null;
  /** shutdown 事件触发时 Phaser Group 可能已销毁；关闭后禁止再构建实时快照。 */
  private diagnosticsRuntimeActive = false;
  private medicineUseProgressBg: Phaser.GameObjects.Rectangle | null = null;
  private medicineUseProgressFill: Phaser.GameObjects.Rectangle | null = null;

  constructor() {
    super(SCENES.game);
  }

  init(data: GameSceneData): void {
    this.mode = data.mode ?? 'level';
    const requestedCharacterId = data.characterId ?? SaveManager.getPreferredCharacterId();
    this.characterId = isCharacterId(requestedCharacterId) ? requestedCharacterId : DEFAULT_CHARACTER_ID;
    const unlockedWeapons = SaveManager.getUnlockedWeapons();
    this.loadoutWeaponIds = SaveManager.getWeaponLoadout();
    const requestedStarter = data.starterWeaponId ?? SaveManager.getPreferredStarterWeapon();
    this.starterWeaponId = unlockedWeapons.includes(requestedStarter)
      && this.loadoutWeaponIds.includes(requestedStarter)
      ? requestedStarter
      : this.loadoutWeaponIds.find((weaponId) => weaponId !== 'pistol') ?? 'pistol';
    if (this.mode === 'endless') {
      this.levelId = null;
      return;
    }
    const requestedLevel = LEVELS.find((level) => level.id === data.levelId);
    this.levelId = requestedLevel?.id ?? LEVELS[0]?.id ?? 'level_1';
    if (this.levelId === 'level_1') this.starterWeaponId = 'pistol';
  }

  create(): void {
    configureHighResolutionScene(this);
    this.gameEnded = false;
    this.pauseReason = null;
    this.frozenAtLoopTime = 0;
    this.rewardContinuationPending = false;
    this.bossDeathPendingUntil = 0;
    this.battleMusicMode = 'battle';
    this.killStreak = 0;
    this.lastKillAt = -Infinity;
    this.targetMarks.clear();
    this.damageEvents.clear();
    // 重开一局必须清零，否则第二局的检阅波会从上一局的格号接着排，直接排到表外。
    this.artReviewPlacedByType.clear();
    this.finalCombatDiagnostics = null;
    this.diagnosticsRuntimeActive = true;
    this.medicineUseProgressBg = null;
    this.medicineUseProgressFill = null;
    // 场景走 sleep/wake 复用实例，重开一局必须清掉上一局最后一帧的负重。
    this.weaponMobility = NO_ENCUMBRANCE;
    this.state = createInitialState(
      this.mode,
      this.levelId,
      this.starterWeaponId,
      this.loadoutWeaponIds,
      this.characterId,
    );
    this.props = [];
    this.obstacles = [];
    this.obstacleTiles = [];
    this.enemySpatialHash.clear();
    SoundManager.setMusic(this.battleMusicMode);
    SoundManager.pauseMusic(false);

    renderBattlefield(this, this.mode, this.levelId);
    this.physics.world.setBounds(0, 0, GAME_WIDTH, GAME_HEIGHT);
    this.cameras.main.setBounds(0, 0, GAME_WIDTH, GAME_HEIGHT);

    this.inputManager = new InputManager(this);
    this.input.keyboard?.on('keydown-ESC', this.handleMenuKey, this);
    this.player = new Player(
      this,
      GAME_WIDTH / 2,
      GAME_HEIGHT / 2,
      getCharacterDef(this.characterId),
    );
    this.propGroup = this.add.group();
    this.obstacleGroup = this.physics.add.staticGroup();

    this.bulletPool = new ObjectPool(this, (scene) => new Bullet(scene), 36);
    this.enemyProjectilePool = new ObjectPool(this, (scene) => new EnemyProjectile(scene), 20);
    this.zombiePool = new ObjectPool(this, (scene) => new Zombie(scene), 32);
    this.weaponManager = new WeaponManager(this, this.state, this.bulletPool);
    this.corpseLayer = new CorpseLayer(this);
    this.damageNumbers = new DamageNumberManager(this);
    this.slowMotion = new SlowMotionManager(this);
    this.scriptedMoments = new ScriptedMomentSystem({
      levelId: this.mode === 'level' ? this.levelId : null,
      spawnZombieAt: (typeId, x, y) => this.spawnZombie(typeId, { x, y }),
      spawnProp: (itemId, x, y) => { this.spawnProp(itemId, x, y); },
      announce: (payload) => this.events.emit(EVENTS.waveAnnounced, payload),
      getPlayerPosition: () => ({ x: this.player.x, y: this.player.y }),
    });

    // 位图特效池。素材/动画缺失时 `spawn()` 返回 null，调用方各自回落到图元表现，
    // 所以这里不需要在建池前判断素材是否就绪。
    this.effectSprites = new EffectSpritePool(this);
    this.areaEffects = new AreaEffectFactory({
      scene: this,
      player: this.player,
      getZombies: () => this.getActiveZombies(),
      getProps: () => this.getActiveProps(),
      damageZombie: (zombie, amount, impact) => this.damageZombie(zombie, amount, impact),
      damagePlayer: (amount, source) => this.damagePlayer(amount, source),
      detonateProp: (prop, chainSet) => this.triggerProp(prop, chainSet),
      effectSprites: this.effectSprites,
    });
    this.enemyAbilitySystem = new EnemyAbilitySystem({
      scene: this,
      projectilePool: this.enemyProjectilePool,
      areaEffects: this.areaEffects,
      spawnZombieAt: (typeId, x, y) => this.spawnZombie(typeId, { x, y }),
    });
    this.flameCone = new FlameConeSystem({
      scene: this,
      getZombies: () => this.getActiveZombies(),
      getObstacleTiles: () => this.obstacleTiles,
      damageZombie: (zombie, amount) => this.damageZombie(zombie, amount),
      spawnLinger: (x, y, def) => this.areaEffects.linger(x, y, def),
    });

    this.itemManager = new ItemManager({
      scene: this,
      state: this.state,
      input: this.inputManager,
      player: this.player,
      spawnDeployable: (itemId, x, y) => this.spawnProp(
        itemId,
        x,
        y,
        this.state.player.damageMultiplier,
      ),
      detonateProp: (prop) => this.triggerProp(prop),
      getProps: () => this.getActiveProps(),
      getZombies: () => this.getActiveZombies(),
    });
    this.medicineManager = new MedicineManager({
      scene: this,
      state: this.state,
      input: this.inputManager,
    });
    this.skillManager = new CharacterSkillManager({
      scene: this,
      state: this.state,
      input: this.inputManager,
      hooks: {
        pulse: (radius, damage, knockback) => {
          this.areaEffects.playerPulse(
            this.player.x,
            this.player.y,
            radius,
            // 技能伤害同样吃角色伤害倍率，否则破阵者的 1.2 倍在技能上凭空消失。
            damage * this.state.player.damageMultiplier,
            knockback,
          );
        },
        grantInvulnerability: (durationMs) => {
          this.player.grantInvulnerability(this.time.now, durationMs);
        },
        dash: (distance) => {
          const fromX = this.player.x;
          const fromY = this.player.y;
          const target = resolveDashTarget(
            fromX,
            fromY,
            this.player.getAimAngle(),
            distance,
            this.obstacleTiles,
            { width: GAME_WIDTH, height: GAME_HEIGHT, radius: 16 },
          );
          this.spawnDashTrail(fromX, fromY, target.x, target.y);
          this.player.teleportTo(target.x, target.y);
          return { fromX, fromY };
        },
        spawnBlockingTrail: (x, y, radius, durationMs) => {
          this.areaEffects.linger(x, y, {
            kind: 'dust',
            duration: durationMs,
            radius,
            blocksEnemies: true,
            color: 0xd8e4ef,
          });
        },
        presentActivation: (active) => this.presentSkillActivation(active),
      },
    });

    this.waveManager = new WaveManager({
      scene: this,
      mode: this.mode,
      levelId: this.levelId,
      spawnZombie: (typeId) => this.spawnZombie(typeId),
      hasAliveEnemies: () => this.getActiveZombies().length > 0 || this.time.now < this.bossDeathPendingUntil,
      getActiveEnemyCount: () => this.getActiveZombies().length,
      onWaveStarted: (waveNumber, wave) => {
        this.state.waveIndex = waveNumber;
        this.events.emit(EVENTS.waveChanged);
        this.announceWave(waveNumber, wave);
        if (this.mode === 'endless') {
          this.spawnEndlessProps(waveNumber, wave.endless);
        }
      },
      onSegmentStarted: (waveIndex, segmentIndex) => {
        this.scriptedMoments.notifySegmentStarted(waveIndex, segmentIndex);
      },
      onWaveCleared: (_waveNumber, wave) => this.handleWaveRewards(wave),
      onComplete: () => this.handleLevelClear(),
    });

    this.loadObstacles();
    this.loadInitialProps();
    this.setupPhysics();
    this.waveManager.start();

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.handleShutdown, this);
    // 场景走 sleep/wake 挂起战局，create 每次重新注册，所以必须在 shutdown 时成对摘掉。
    this.events.on(Phaser.Scenes.Events.WAKE, this.handleWake, this);
    this.events.on(CARD_SELECTED_EVENT, this.handleCardSelected, this);

    if (this.scene.isActive(SCENES.hud) || this.scene.isSleeping(SCENES.hud)) {
      this.scene.stop(SCENES.hud);
    }
    this.scene.launch(SCENES.hud);
    this.scene.bringToTop(SCENES.hud);

    this.emitStateChanged();
    this.events.emit(EVENTS.pauseChanged, this.pauseReason);
  }

  private handleCardSelected(enhancementId: string | null): void {
    if (enhancementId) {
      this.state.player.activeEnhancements.add(enhancementId);
      const card = ENHANCEMENTS[enhancementId];
      if (card) {
        this.events.emit(EVENTS.pickupCollected, { title: `强化 · ${card.cardTitle}`, accent: 0x58c9dd });
      }
      // 强化会改写弹匣容量、射速和连发方式，必须让 HUD 重新读一次生效后的定义。
      this.events.emit(EVENTS.weaponChanged);
      this.events.emit(EVENTS.ammoChanged);
    }
    this.scene.stop(SCENES.cardSelection);
    this.setPause(null);
    if (this.rewardContinuationPending) {
      this.rewardContinuationPending = false;
      this.waveManager.continueAfterReward();
    }
    // 排队中的强化包在本次抽卡收尾后立刻续上，顺序与掉落顺序一致。
    // 放在 continueAfterReward 之后：波次奖励的解冻优先，避免两条暂停链互相压住。
    this.drainPendingEnhancementPacks();
  }

  /**
   * 弹出一个排队中的强化包。
   *
   * 只弹一个而不是循环弹完：`handleEnhancementPickup` 成功会重新进入
   * `pauseReason === 'cardSelection'`，剩下的必须等下一次 `handleCardSelected`。
   * 循环会在同一帧连续 launch 同一个场景，把前一次的卡面直接顶掉。
   */
  private drainPendingEnhancementPacks(): void {
    if (this.pendingEnhancementPacks <= 0) return;
    if (this.pauseReason !== null || this.gameEnded) return;

    this.pendingEnhancementPacks -= 1;
    if (!this.handleEnhancementPickup()) {
      // 没能弹出来（例如已经被其它原因暂停）就把这一份放回队列，不静默丢弃。
      this.pendingEnhancementPacks += 1;
    }
  }

  update(_time: number, delta: number): void {
    if (this.gameEnded) return;
    if (this.pauseReason !== null) {
      this.watchdogCardSelection();
      return;
    }

    this.state.stats.elapsedMs += delta;
    this.updateEndlessOverdrive(this.time.now);
    const weaponId = this.state.player.currentWeaponId;
    this.state.stats.weaponUsageMs[weaponId] = (this.state.stats.weaponUsageMs[weaponId] ?? 0) + delta;
    const weaponStatuses = this.weaponManager.getWeaponStatuses();
    const finiteStatuses = weaponStatuses.filter((status) => !status.infiniteAmmo);
    for (const status of finiteStatuses) {
      if (status.usable) {
        this.state.stats.weaponAvailableMs[status.weaponId]
          = (this.state.stats.weaponAvailableMs[status.weaponId] ?? 0) + delta;
      }
    }
    if (finiteStatuses.length > 0 && finiteStatuses.every((status) => !status.usable)) {
      this.state.stats.finiteWeaponsUnavailableMs += delta;
    }

    const wasMedicineChanneling = this.medicineManager.isChanneling();
    this.medicineManager.update(delta);
    const lowHealth = this.state.player.health / this.state.player.maxHealth < 0.2;
    const medicineChanneling = this.medicineManager.isChanneling();
    if (!wasMedicineChanneling && medicineChanneling) {
      this.weaponManager.interruptReload();
    }
    // 开火意图上提到移速计算之前：负重要当帧生效，而武器开火本身也复用同一个值，
    // 避免同一帧从输入里读两次得到不一致的结果。
    const fireHeld = !medicineChanneling && this.inputManager.isDown('fire');
    const fireJustPressed = !medicineChanneling && this.inputManager.justPressed('fire');
    // 技能在 player.update 之前处理：相位疾冲会直接改坐标，晚一步会被本帧的
    // 速度积分覆盖，表现为「按了 E 但只挪了一点」。
    this.skillManager.update(medicineChanneling);
    const skillActive = this.skillManager.isActive();
    const character = getCharacterDef(this.state.player.characterId);
    // 负重必须在 player.update 之前推进，否则移速会慢一帧（说明见 WeaponManager.updateMobility）。
    this.weaponMobility = this.weaponManager.updateMobility(delta, fireHeld);
    this.player.update(
      this.inputManager,
      this.state.player.moveSpeed
        * (lowHealth ? 1.2 : 1)
        * this.medicineManager.getMoveSpeedMultiplier()
        * this.weaponMobility.multiplier
        * skillMoveSpeedMultiplier(character.active, skillActive),
    );
    this.player.setSkillActive(skillActive, character.accentColor);
    this.player.setEncumbrance(this.weaponMobility.load);
    this.syncMedicineUseProgress();
    this.updateCharacterPassive(delta);
    this.syncLowHealthFeedback(lowHealth);
    SoundManager.setListenerPosition(this.player.x, this.player.y);
    this.handleWeaponInput();
    this.player.setWeaponVisual(this.state.player.currentWeaponId);
    const fireFeedback = this.weaponManager.update(
      this.time.now,
      this.player,
      fireHeld,
      fireJustPressed,
    );
    if (fireFeedback) {
      this.player.playFireFeedback(fireFeedback.color);
      this.spawnMuzzleFlash(fireFeedback);
    }
    // 必须在 player.update 之后：火焰跟着枪口画，早一步就会挂在上一帧的位置上。
    this.flameCone.update(this.time.now, this.weaponManager.getActiveCone(), this.player.getMuzzle());
    this.itemManager.update(!medicineChanneling);
    this.areaEffects.update(this.time.now);
    this.updateBullets();
    this.updateEnemyProjectiles();
    this.updateZombies(delta);
    this.waveManager.update(this.time.now);
    // 剧本时刻的条件触发（如濒死包夹）走每帧心跳；未配置时刻的模式内部直接短路。
    this.scriptedMoments.update(
      this.state.waveIndex,
      this.state.player.maxHealth > 0 ? this.state.player.health / this.state.player.maxHealth : 0,
    );
  }

  /**
   * 抽卡冻结看门狗。
   *
   * `pauseReason === 'cardSelection'` 是一个只有抽卡场景能解开的锁：解冻只发生在
   * `CARD_SELECTED_EVENT` 上，而只有 `CardSelectionScene` 会发这个事件。
   * 一旦抽卡场景没能真正跑起来（历史故障：`setPause` 的 pauseChanged 监听器抛异常，
   * 把已排队的 `scene.launch` 连带废掉），这把锁就永远解不开，整局彻底卡死。
   *
   * 这里不去猜为什么没起来，只守住「冻结必须有对应界面」这条不变量：
   * 宽限期内允许缺席（`scene.launch` 是入队执行，需要几帧才生效），
   * 超时则按「跳过本次强化」收场——宁可损失一张卡，也不能让玩家丢掉整局。
   * 详见 questions/2026-08-22-强化卡拾取卡死.md
   */
  private watchdogCardSelection(): void {
    if (this.pauseReason !== 'cardSelection') return;
    if (this.scene.isActive(SCENES.cardSelection) || this.scene.isSleeping(SCENES.cardSelection)) return;
    // 用主循环时间而不是场景时钟：冻结期间 timeScale 为 0，场景计时器不再累计。
    const stalledFor = this.game.loop.time - this.cardSelectionPausedAt;
    if (stalledFor < CARD_SELECTION_LAUNCH_GRACE_MS) return;

    console.error(
      `[GameScene] 抽卡界面在 ${Math.round(stalledFor)}ms 内没有启动，`
      + '按跳过本次强化自愈，避免整局卡死',
    );
    this.events.emit(EVENTS.pickupCollected, { title: '强化界面异常 · 已跳过', accent: 0xff7668 });
    this.handleCardSelected(null);
  }

  getState(): GameState {
    return this.state;
  }

  getModeLabel(): string {
    return this.mode === 'endless' ? '无尽模式' : '关卡模式';
  }

  getLevelLabel(): string {
    if (this.mode === 'endless') return '生存战场';
    return this.getCurrentLevel()?.name ?? this.levelId ?? '未知关卡';
  }

  getWaveTotal(): number | null {
    if (this.mode !== 'level') return null;
    const level = this.getCurrentLevel();
    if (!level) return null;
    return level.waves.length + (level.boss ? 1 : 0);
  }

  getEndlessWaveMeta(): EndlessWaveMeta | null {
    return this.mode === 'endless' ? this.waveManager.getEndlessWaveMeta() : null;
  }

  getEndlessOverdriveStatus(): {
    multiplier: number;
    remaining: number;
    milestone: number;
    label: string;
    color: number;
  } | null {
    if (this.mode !== 'endless') return null;
    const overdrive = this.state.player.endlessOverdrive;
    if (!overdrive) return null;
    const referenceTime = this.pauseReason !== null && this.frozenAtLoopTime > 0
      ? this.frozenAtLoopTime
      : this.time.now;
    if (referenceTime >= overdrive.expiresAt) return null;
    return {
      multiplier: overdrive.multiplier,
      remaining: Math.max(0, overdrive.expiresAt - referenceTime),
      milestone: overdrive.milestone,
      label: overdrive.label,
      color: overdrive.color,
    };
  }

  private updateCharacterPassive(delta: number): void {
    const character = getCharacterDef(this.state.player.characterId);
    const passive = character.passive;
    const runtime = this.state.player.characterPassive;

    if (passive.kind === 'stationaryCalibration') {
      const wasCalibrated = runtime.calibrated;
      runtime.stationaryMs = this.player.isMoving() ? 0 : runtime.stationaryMs + delta;
      runtime.calibrated = runtime.stationaryMs >= passive.durationMs;
      if (runtime.calibrated !== wasCalibrated) {
        this.events.emit(EVENTS.characterChanged);
      }
    }

    this.player.setPassiveActive(this.isPassiveContributing(), character.accentColor);
  }

  /**
   * 被动此刻是否真的在给收益。
   *
   * 这是指示环唯一的判据，也是「被动可见」这件事的定义：环亮起来的那一刻，
   * 玩家的下一枪或下一次受伤确实会因为被动而不同。因此每个 kind 都必须对应到
   * 它在战斗结算里真正生效的条件，不能图省事一律常亮——常亮等于没有信息。
   */
  private isPassiveContributing(): boolean {
    const passive = getCharacterDef(this.state.player.characterId).passive;
    switch (passive.kind) {
      // 还没用掉时亮着：它表达的是「你还有一次垫底的机会」，用掉后熄灭本身就是强反馈。
      case 'lastStand':
        return this.state.player.characterPassive.lastStandAvailable;
      case 'stationaryCalibration':
        return this.state.player.characterPassive.calibrated;
      // 减伤是无条件的，但只在真正会吃到伤害的场合才有意义；常亮会让它退化成装饰。
      // 取「附近有敌人」作为判据：这正是减伤即将生效的时刻。
      case 'armorPlate':
        return this.hasEnemyWithin(150);
      case 'movingFire':
        return this.player.isMoving();
      case 'lastMagazine': {
        const weaponId = this.state.player.currentWeaponId;
        const weapon = EnhancementManager.resolveWeaponDef(
          weaponId,
          this.state.player.activeEnhancements,
        );
        return isLastMagazineWindow(
          getCharacterDef(this.state.player.characterId),
          this.state.player.ammoInMag[weaponId] ?? 0,
          weapon.magazineSize,
        );
      }
      default:
        return false;
    }
  }

  private hasEnemyWithin(radius: number): boolean {
    const radiusSq = radius * radius;
    return this.getActiveZombies().some(
      (zombie) => distanceSq(this.player.x, this.player.y, zombie.x, zombie.y) <= radiusSq,
    );
  }

  /** 技能释放的画面反馈。瞬发与持续型共用，差异只在光环大小。 */
  private presentSkillActivation(active: CharacterActiveDef): void {
    const character = getCharacterDef(this.state.player.characterId);
    const isBurst = active.durationMs === 0;
    const ring = this.add.circle(
      this.player.x,
      this.player.y,
      isBurst ? 34 : 26,
      character.accentColor,
      0.18,
    ).setDepth(DEPTH.effect);
    ring.setStrokeStyle(4, character.accentColor, 0.95);
    this.tweens.add({
      targets: ring,
      scale: isBurst ? 3.4 : 2.2,
      alpha: 0,
      duration: isBurst ? 380 : 300,
      ease: 'Cubic.Out',
      onComplete: () => ring.destroy(),
    });
    this.applyFeedbackShake(isBurst ? 'A' : 'B');
  }

  /** 相位疾冲的位移残影：沿路径留下几段渐隐的角色色轨迹，让瞬移可被读成"冲过去了"。 */
  private spawnDashTrail(fromX: number, fromY: number, toX: number, toY: number): void {
    const accent = getCharacterDef(this.state.player.characterId).accentColor;
    const segments = 6;
    for (let index = 0; index <= segments; index += 1) {
      const t = index / segments;
      const ghost = this.add.circle(
        fromX + (toX - fromX) * t,
        fromY + (toY - fromY) * t,
        13,
        accent,
        0.32,
      ).setDepth(DEPTH.effect);
      this.tweens.add({
        targets: ghost,
        alpha: 0,
        scale: 0.5,
        duration: 240 + index * 26,
        onComplete: () => ghost.destroy(),
      });
    }
  }

  hasBossWave(): boolean {
    return this.mode === 'level' && Boolean(this.getCurrentLevel()?.boss);
  }

  getPauseReason(): PauseReason | null {
    return this.pauseReason;
  }

  /** HUD 暂停菜单的「继续游戏」。 */
  resumeFromMenu(): void {
    if (this.pauseReason !== 'menu') return;
    this.setPause(null);
  }

  /**
   * HUD 暂停菜单的「返回主页」：挂起本局并回到主菜单。
   *
   * 战斗场景走 `sleep` 而不是 `stop`——实体、对象池、波次进度和已激活强化都留在内存里，
   * 主菜单的「继续游戏」才能把同一局原样接回来。代价是这局会一直占用内存，
   * 直到玩家恢复它，或在主菜单开新局把它顶掉。
   */
  suspendToMainMenu(): void {
    if (this.gameEnded) return;
    // 挂起后玩家可能再也不回来，无尽纪录先落盘，避免这一局的波次白打。
    this.recordEndlessBest();
    // 场景操作全部按 FIFO 排队执行：必须先让自己进入 sleeping，
    // 主菜单的 create 才能查到挂起的战局并显示「继续游戏」。
    this.scene.sleep(SCENES.hud);
    this.scene.sleep();
    this.scene.run(SCENES.mainMenu);
  }

  /** GameScene 只处理暂停菜单；强化界面的 ESC 由 CardSelectionScene 自己消费。 */
  private handleMenuKey(event: KeyboardEvent): void {
    if (event.repeat || this.gameEnded) return;
    this.toggleMenu();
  }

  private toggleMenu(): void {
    if (this.pauseReason === 'menu') {
      this.setPause(null);
      return;
    }
    if (this.pauseReason !== null) return;
    this.setPause('menu');
  }

  /** 主菜单点「继续游戏」直接回到战斗，不再要求玩家在暂停菜单里确认第二次。 */
  private handleWake(): void {
    // 挂起期间玩家可能去设置页改过键位，恢复战局时重读一次。
    this.inputManager.reloadBinds();
    this.applyDeveloperCheatLoadout();
    this.scene.wake(SCENES.hud);
    this.scene.bringToTop(SCENES.hud);
    SoundManager.setMusic(this.battleMusicMode);
    this.setPause(null);
    // 放在解除冻结之后：HUD 的换弹提示要读平移过的时间点才是准的。
    this.emitStateChanged();
  }

  private applyDeveloperCheatLoadout(): void {
    if (!isDeveloperCheatEnabled()) return;

    const selectedLoadout = SaveManager.getWeaponLoadout();
    this.state.player.ownedWeapons = [...selectedLoadout];
    if (!selectedLoadout.includes(this.state.player.currentWeaponId)) {
      this.state.player.currentWeaponId = SaveManager.getPreferredStarterWeapon();
    }
    for (const weaponId of selectedLoadout) {
      this.state.player.ammoInMag[weaponId] ??= WEAPONS[weaponId].magazineSize;
    }
    for (const ammoType of Object.keys(TESTING_AMMO_RESERVE) as Array<keyof typeof TESTING_AMMO_RESERVE>) {
      this.state.player.ammoReserve[ammoType] = Math.max(
        this.state.player.ammoReserve[ammoType],
        TESTING_AMMO_RESERVE[ammoType],
      );
    }
  }

  isWeaponReloading(): boolean {
    return this.weaponManager.isReloading;
  }

  getWeaponReloadStatus(): WeaponReloadStatus | null {
    return this.weaponManager.getReloadStatus();
  }

  /** HUD 读当帧负重。缓存 `update` 的结果而不是重算，保证 HUD 与实际移速永远同一个数。 */
  getWeaponMobility(): WeaponMobilityStatus {
    return this.weaponMobility;
  }

  getWeaponStatuses(): WeaponStatus[] {
    return this.weaponManager.getWeaponStatuses();
  }

  getBossStatus(): BossStatus | null {
    const boss = this.getActiveZombies().find((zombie) => isBossZombie(zombie.def.id));
    if (!boss) return null;
    const phase = boss.getBossPhaseStatus();
    return {
      name: boss.def.name,
      health: Math.max(0, boss.health),
      // 无尽章节缩放后配置基线不再是本只的上限，血条必须按实例上限画。
      maxHealth: boss.maxHealth,
      phase: phase?.phase ?? null,
      totalPhases: phase?.totalPhases ?? null,
      phaseLabel: phase?.label ?? null,
      recovery: boss.getRecoveryStatus(this.time.now),
    };
  }

  getKeybinds(): Readonly<Keybinds> {
    return this.inputManager.getBinds();
  }

  /** HUD 读主动技能的冷却与窗口。场景尚未 create 完时返回 null。 */
  getSkillStatus(): ReturnType<CharacterSkillManager['getStatus']> | null {
    return this.skillManager?.getStatus() ?? null;
  }

  /**
   * CDP 长流程使用的只读快照。场景尚未创建时返回 null；场景结束后返回终局冻结副本，
   * 不再触碰已经销毁的物理世界、对象池或区域效果。
   */
  getCombatDiagnostics(): CombatDiagnosticsSnapshot | null {
    if (this.finalCombatDiagnostics) {
      return cloneCombatDiagnostics(this.finalCombatDiagnostics);
    }
    if (!this.diagnosticsRuntimeActive) return null;
    return this.buildCombatDiagnostics();
  }

  /**
   * 活跃对象与帧率快照。
   *
   * 性能压测（`PROJECT_MASTER_PLAN` §5.15 的 50/100/150 活跃敌人档位）需要把 FPS
   * 与「当时场上有多少实体、处在哪个段落、同屏上限是多少」对应起来，
   * 否则拿到的只是一个无法归因的孤立数字。做成显式访问器而不是临时探针，
   * 是为了让不同轮次的测量口径一致、结果可比。
   */
  getPerformanceStats(): {
    fps: number;
    zombies: number;
    bullets: number;
    enemyProjectiles: number;
    props: number;
    damageNumbers: number;
    corpses: number;
    wave: ReturnType<WaveManager['getProgressSnapshot']>;
  } {
    return {
      fps: Math.round(this.game.loop.actualFps),
      zombies: this.getActiveZombies().length,
      bullets: this.bulletPool.getActive().length,
      enemyProjectiles: this.enemyProjectilePool.getActive().length,
      props: this.getActiveProps().length,
      damageNumbers: this.damageNumbers.activeCount,
      corpses: this.corpseLayer.activeCount,
      wave: this.waveManager.getProgressSnapshot(),
    };
  }

  private setupPhysics(): void {
    this.physics.add.overlap(
      this.bulletPool.phaserGroup,
      this.zombiePool.phaserGroup,
      (bulletObj, zombieObj) => {
        const bullet = bulletObj as Bullet;
        const zombie = zombieObj as Zombie;
        if (!bullet.active || !zombie.active || bullet.hitSet.has(zombie)) return;

        bullet.hitSet.add(zombie);
        this.resolveBulletHit(bullet, zombie);
        if (bullet.penetration <= 0) {
          this.finishBullet(bullet, zombie.x, zombie.y);
        } else {
          bullet.penetration -= 1;
        }
      },
      undefined,
      this,
    );

    this.physics.add.overlap(
      this.enemyProjectilePool.phaserGroup,
      this.player,
      (projectileObj) => {
        const projectile = projectileObj as EnemyProjectile;
        if (!projectile.active) return;
        this.damagePlayer(projectile.damage, 'projectile');
        projectile.despawn();
      },
      undefined,
      this,
    );

    this.physics.add.overlap(
      this.bulletPool.phaserGroup,
      this.propGroup,
      (bulletObj, propObj) => {
        const bullet = bulletObj as Bullet;
        const prop = propObj as Prop;
        if (!bullet.active || !prop.active || bullet.hitSet.has(prop)) return;

        bullet.hitSet.add(prop);
        SoundManager.playAt('metalImpact', prop.x, prop.y);
        this.spawnImpactBurst(prop.x, prop.y, prop.def.color, 4);
        const shouldTrigger = prop.applyDamage(bullet.damage);
        if (shouldTrigger) {
          this.triggerProp(prop);
        }
        this.finishBullet(bullet, prop.x, prop.y);
      },
      undefined,
      this,
    );

    this.physics.add.overlap(
      this.enemyProjectilePool.phaserGroup,
      this.obstacleGroup,
      (projectileObj) => {
        const projectile = projectileObj as EnemyProjectile;
        if (projectile.active) projectile.despawn();
      },
      undefined,
      this,
    );

    this.physics.add.overlap(
      this.player,
      this.zombiePool.phaserGroup,
      (_playerObj, zombieObj) => {
        const zombie = zombieObj as Zombie;
        if (!zombie.active) return;
        const damage = zombie.tryAttack(this.time.now);
        if (damage > 0) {
          SoundManager.playAt('enemyAttack', zombie.x, zombie.y);
          this.damagePlayer(damage, 'melee');
        }
      },
      undefined,
      this,
    );

    // —— 障碍物:挡玩家/僵尸移动(撞墙滑行),挡子弹(命中即回收,不摧毁墙) ——
    this.physics.add.collider(this.player, this.obstacleGroup);
    this.physics.add.collider(this.zombiePool.phaserGroup, this.obstacleGroup);
    this.physics.add.overlap(
      this.bulletPool.phaserGroup,
      this.obstacleGroup,
      (bulletObj, obstacleObj) => {
        const bullet = bulletObj as Bullet;
        // 组里装的是碰撞砖，不是 Obstacle 容器。反弹按被命中那块砖的边界算：
        // 斜放掩体由多块砖拼成，砖的边界比整体包围盒贴近真实墙面。
        const tile = obstacleObj as Phaser.GameObjects.Rectangle & {
          body: Phaser.Physics.Arcade.StaticBody;
        };
        if (!bullet.active) return;
        SoundManager.playAt('metalImpact', bullet.x, bullet.y);
        this.spawnImpactBurst(bullet.x, bullet.y, 0xbbbbbb, 3);
        if (bullet.tryBounceFromObstacle({
          left: tile.body.left,
          right: tile.body.right,
          top: tile.body.top,
          bottom: tile.body.bottom,
        })) return;
        this.finishBullet(bullet, bullet.x, bullet.y);
      },
      undefined,
      this,
    );
  }

  private handleWeaponInput(): void {
    if (this.medicineManager.isChanneling()) return;
    if (this.inputManager.justPressed('reload')) {
      this.weaponManager.reload();
    }
    if (this.inputManager.justPressed('nextWeapon')) {
      this.weaponManager.cycle(1);
    }
    if (this.inputManager.justPressed('prevWeapon')) {
      this.weaponManager.cycle(-1);
    }
    if (this.inputManager.justPressed('weapon1')) this.weaponManager.switchByIndex(0);
    if (this.inputManager.justPressed('weapon2')) this.weaponManager.switchByIndex(1);
    if (this.inputManager.justPressed('weapon3')) this.weaponManager.switchByIndex(2);
    if (this.inputManager.justPressed('weapon4')) this.weaponManager.switchByIndex(3);
    if (this.inputManager.justPressed('weapon5')) this.weaponManager.switchByIndex(4);
    if (this.inputManager.justPressed('weapon6')) this.weaponManager.switchByIndex(5);
  }

  private updateBullets(): void {
    this.bulletPool.forEachActive((bullet) => {
      if (bullet.tick()) this.finishBullet(bullet, bullet.x, bullet.y);
    });
  }

  private finishBullet(bullet: Bullet, x: number, y: number): void {
    if (!bullet.active) return;
    const impactEffect = bullet.consumeImpactEffect();
    const impactLinger = bullet.impactLinger ? { ...bullet.impactLinger } : null;
    const impactFragments = bullet.impactFragments ? { ...bullet.impactFragments } : null;
    bullet.despawn();
    if (impactLinger) this.areaEffects.linger(x, y, impactLinger);
    if (!impactEffect) return;
    this.areaEffects.explode(x, y, impactEffect);
    if (impactFragments) {
      for (const fragment of createImpactFragmentBlasts(x, y, impactEffect, impactFragments)) {
        this.areaEffects.explode(fragment.x, fragment.y, fragment.effect);
      }
    }
  }

  private updateEnemyProjectiles(): void {
    this.enemyProjectilePool.forEachActive((projectile) => projectile.tick());
  }

  private updateZombies(_delta: number): void {
    const zombies = this.getActiveZombies();
    this.enemySpatialHash.rebuild(zombies);
    const maxRadius = zombies.reduce((largest, zombie) => Math.max(largest, zombie.def.radius), 0);
    const queryRadius = maxRadius * 2 + 12;
    for (const zombie of zombies) {
      zombie.blocked = this.areaEffects.isEnemyBlocked(zombie.x, zombie.y);
    }

    for (const zombie of zombies) {
      let separationX = 0;
      let separationY = 0;
      for (const other of this.enemySpatialHash.queryRadius(zombie.x, zombie.y, queryRadius)) {
        if (other === zombie) continue;
        const dx = zombie.x - other.x;
        const dy = zombie.y - other.y;
        const minDistance = zombie.def.radius + other.def.radius + 12;
        const dist2 = dx * dx + dy * dy;
        if (dist2 <= 0 || dist2 > minDistance * minDistance) continue;

        const dist = Math.sqrt(dist2);
        const force = (minDistance - dist) / minDistance * 60;
        separationX += (dx / dist) * force;
        separationY += (dy / dist) * force;
      }
      const abilityEvent = zombie.updateAbility(this.time.now, this.player.x, this.player.y);
      if (abilityEvent) this.enemyAbilitySystem.handle(zombie, abilityEvent);
      zombie.seek(this.time.now, this.player.x, this.player.y, separationX, separationY);
    }
  }

  private loadInitialProps(): void {
    if (this.mode !== 'level') return;

    const level = LEVELS.find((entry) => entry.id === this.levelId) ?? LEVELS[0];
    if (!level) return;

    for (const propPlacement of level.props) {
      this.spawnProp(propPlacement.type as ItemId, propPlacement.x, propPlacement.y);
    }
  }

  private loadObstacles(): void {
    if (this.mode !== 'level') return;

    const level = LEVELS.find((entry) => entry.id === this.levelId) ?? LEVELS[0];
    if (!level?.obstacles) return;

    for (const placement of level.obstacles) {
      const obstacle = new Obstacle(this, placement);
      this.obstacles.push(obstacle);
      // 进碰撞组的是碰撞砖而不是掩体本身：Arcade 静态刚体不能旋转，斜放掩体必须靠
      // 多块轴对齐砖才能贴合贴图（理由见 Obstacle 的类文档串）。
      for (const tile of obstacle.collisionTiles) {
        this.obstacleGroup.add(tile);
        this.obstacleTiles.push({
          x: tile.x,
          y: tile.y,
          width: tile.width,
          height: tile.height,
        });
      }
    }
  }

  private spawnEndlessProps(waveNumber: number, meta?: EndlessWaveMeta): void {
    if (meta?.kind === 'tactical') {
      this.spawnEndlessTacticalLine();
      return;
    }
    const spawnCount = Math.min(3, 1 + Math.floor(waveNumber / 3));
    const choices: ItemId[] = ['barrel_oil', 'barrel_flour'];

    for (let i = 0; i < spawnCount; i++) {
      this.trimEndlessProps();
      const itemId = choices[Phaser.Math.Between(0, choices.length - 1)];
      let x = 0;
      let y = 0;
      let attempts = 0;
      do {
        x = Phaser.Math.Between(120, GAME_WIDTH - 120);
        y = Phaser.Math.Between(120, GAME_HEIGHT - 120);
        attempts += 1;
      } while (attempts < 12 && (
        distanceSq(x, y, this.player.x, this.player.y) < 180 * 180
        || this.getActiveProps().some((prop) => distanceSq(x, y, prop.x, prop.y) < ENDLESS_PROP_MIN_DISTANCE ** 2)
      ));
      if (attempts >= 12 && this.getActiveProps().some((prop) => distanceSq(x, y, prop.x, prop.y) < ENDLESS_PROP_MIN_DISTANCE ** 2)) {
        continue;
      }
      this.spawnProp(itemId, x, y);
    }
  }

  /**
   * 爆破事件波在玩家对侧铺一条可读的油桶链，确保环境高光不是完全依赖随机落点。
   * 纵向位置始终选在玩家所在半场的对面，避免波次开始时直接把玩家夹在爆炸链里。
   */
  private spawnEndlessTacticalLine(): void {
    const y = this.player.y < GAME_HEIGHT / 2 ? GAME_HEIGHT - 150 : 150;
    for (let index = 0; index < 5; index += 1) {
      this.trimEndlessProps();
      this.spawnProp('barrel_oil', 430 + index * 105, y);
    }
  }

  private trimEndlessProps(): void {
    const activeProps = this.getActiveProps();
    getOldestEndlessProp(activeProps)?.despawn();
  }

  private spawnProp(itemId: ItemId, x: number, y: number, playerDamageMultiplier = 1): Prop {
    const prop = this.props.find((entry) => !entry.active) ?? this.createProp();
    prop.spawn(x, y, itemId, playerDamageMultiplier);
    return prop;
  }

  private createProp(): Prop {
    const prop = new Prop(this);
    this.props.push(prop);
    this.propGroup.add(prop);
    return prop;
  }

  /**
   * 生成一只感染体。
   * 默认从画布外随机一边进场；`at` 用于剧本时刻的列队与包夹阵型，直接落在指定坐标。
   * 返回生成出的实体，供召唤技能记账它自己的存活上限。
   */
  private spawnZombie(typeId: ZombieId, at?: { x: number; y: number }): Zombie {
    const zombie = this.zombiePool.acquire();
    this.targetMarks.delete(zombie);
    const margin = 24;
    let x = at?.x ?? 0;
    let y = at?.y ?? 0;
    const scaling = this.resolveSpawnScaling(typeId);

    // 美术检阅波：按摆位表落到网格里并钉死朝向，不走随机边生成。
    const review = at ? null : this.resolveArtReviewPlacement(typeId);
    if (review) {
      zombie.spawn(review.x, review.y, typeId, scaling);
      zombie.applyPoseLock(review.facing);
      return zombie;
    }

    if (!at) {
      const side = Phaser.Math.Between(0, 3);
      switch (side) {
        case 0:
          x = Phaser.Math.Between(margin, GAME_WIDTH - margin);
          y = -margin;
          break;
        case 1:
          x = GAME_WIDTH + margin;
          y = Phaser.Math.Between(margin, GAME_HEIGHT - margin);
          break;
        case 2:
          x = Phaser.Math.Between(margin, GAME_WIDTH - margin);
          y = GAME_HEIGHT + margin;
          break;
        default:
          x = -margin;
          y = Phaser.Math.Between(margin, GAME_HEIGHT - margin);
          break;
      }
    }

    zombie.spawn(x, y, typeId, scaling);
    const isBoss = isBossZombie(typeId);
    const marker = this.add.circle(x, y, isBoss ? 40 : 22, 0x000000, 0).setDepth(DEPTH.effect);
    marker.setStrokeStyle(isBoss ? 5 : 3, isBoss ? 0xff825c : 0xffdd8a, 0.75);
    this.tweens.add({
      targets: marker,
      scale: 0.45,
      alpha: 0,
      duration: isBoss ? 420 : 260,
      onComplete: () => marker.destroy(),
    });
    return zombie;
  }

  /**
   * 取本次生成要套用的实例缩放。
   *
   * 只缩放无尽模式的 Boss：
   * - 关卡模式是一条设计好的十关曲线，缩放会把它变成两套难度来源。
   * - 杂兵不缩放是刻意的。无尽模式已经用「同屏上限 + 总量 + 精英占比」表达章节压力，
   *   再给每只杂兵加血只会让清场变慢，而清场速度直接决定弹药收入，等于双重惩罚。
   *   章节强度集中在 Boss 上，玩家因此能看出"这一章的坎在哪"。
   */
  private resolveSpawnScaling(typeId: ZombieId): ZombieScaling | undefined {
    if (this.mode !== 'endless' || !isBossZombie(typeId)) return undefined;
    const chapter = this.waveManager.getEndlessWaveMeta()?.chapter ?? 1;
    return getEndlessBossScaling(chapter);
  }

  /**
   * 取本只在检阅摆位表里的格子。非检阅波返回 null。
   *
   * 按类型各自计数而不是用全局序号：`WaveManager` 的生成队列虽然在检阅波不打乱，
   * 但按类型计数对顺序不敏感，日后若改动队列构造方式也不会错位。
   */
  private resolveArtReviewPlacement(typeId: ZombieId): MonsterReviewPlacement | null {
    if (!this.waveManager?.isArtReviewWave()) return null;

    const placed = this.artReviewPlacedByType.get(typeId) ?? 0;
    this.artReviewPlacedByType.set(typeId, placed + 1);
    this.artReviewPlacements ??= buildMonsterReviewPlacements();
    return this.artReviewPlacements.find(
      (entry) => entry.typeId === typeId && entry.indexInType === placed,
    ) ?? null;
  }

  /**
   * 子弹命中感染体的完整结算：距离衰减、穿透加成、处决、击退与分级反馈。
   *
   * 击退方向取子弹速度方向而不是「子弹指向感染体」：重叠瞬间两者位置极近，
   * 用位置差算出的角度会在贴脸命中时剧烈抖动。
   */
  private resolveBulletHit(bullet: Bullet, zombie: Zombie): void {
    const impactAngle = bullet.body.velocity.length() > 0 ? bullet.body.velocity.angle() : null;
    // 顺序不能颠倒：`resolveHitDamage` 用「本次命中之前」的命中数算穿透加成，
    // 先 registerHit 会让第一个目标就吃到加成。
    const markDamageFactor = this.resolveTargetMarkDamageFactor(zombie);
    const baseDamage = bullet.resolveHitDamage() * markDamageFactor;
    const hitCount = bullet.registerHit();
    // 处决对 Boss 无效：否则残血 Boss 会被一发霰弹跳过整个第二阶段。
    const isBoss = isBossZombie(zombie.def.id);
    const executed = !isBoss
      && shouldExecute(bullet.executeThreshold, zombie.health, zombie.def.health);
    const isHeadshot = !executed && rollHeadshot(bullet.headshotChance, Math.random());
    const rawDamage = isHeadshot
      ? resolveHeadshotDamage(baseDamage, bullet.headshotMultiplier)
      : baseDamage;
    const damage = executed
      ? zombie.health
      : rawDamage * (this.state.player.health / this.state.player.maxHealth < 0.2 ? 1.5 : 1);
    // 穿透播报只属于以穿透为签名的武器，霰弹弹丸的顺带穿透不占强调额度。
    const isSignaturePierce = bullet.hasChainBonus && hitCount >= 2;
    const kind: DamageNumberKind = executed
      ? 'execute'
      : isHeadshot
        ? 'critical'
        : isSignaturePierce
          ? 'pierce'
          : 'normal';

    if (isHeadshot) this.state.stats.headshots += 1;
    if (executed) this.state.stats.executions += 1;
    if (isSignaturePierce) this.state.stats.pierceHits += 1;
    if (executed) SoundManager.playAt('execute', zombie.x, zombie.y);
    else if (isHeadshot) SoundManager.playAt('critical', zombie.x, zombie.y);
    else if (isSignaturePierce) SoundManager.playAt('pierce', zombie.x, zombie.y);

    SoundManager.playAt('impact', zombie.x, zombie.y);
    this.spawnImpactBurst(
      zombie.x,
      zombie.y,
      executed || isHeadshot ? 0xffd54a : 0xffffff,
      bullet.penetration > 0 ? 3 : 5,
    );

    if (impactAngle !== null && !isBoss) {
      zombie.applyKnockback(
        impactAngle,
        resolveKnockbackDistance(bullet.knockback, zombie.def.radius),
      );
    }

    if (isSignaturePierce) {
      this.damageNumbers.showLabel(
        zombie.x,
        zombie.y - zombie.def.radius - 26,
        `×${hitCount} PIERCE!`,
        'pierce',
      );
      if (hitCount >= 4) {
        this.applyFeedbackShake('A');
        this.slowMotion.requestByTier('A', this.time.now);
      }
    }
    if (executed) {
      this.applyFeedbackShake('A');
    }
    // Barrett 等显式配置该字段的武器，只在普通感染体的致死命中上触发。
    // Boss 已有独立 S 级死亡慢动作，同一枪不能重复请求两套反馈。
    if (!isBoss && damage >= zombie.health && bullet.killSlowMotionTier) {
      this.slowMotion.requestByTier(bullet.killSlowMotionTier, this.time.now);
    }

    if (bullet.markOnHit && damage < zombie.health) {
      this.applyTargetMark(zombie, bullet.markOnHit);
    }

    const killExplosion = !isBoss && damage >= zombie.health && bullet.killExplosion
      ? {
          x: zombie.x,
          y: zombie.y,
          effect: {
            ...bullet.killExplosion,
            lingering: bullet.killExplosion.lingering ? { ...bullet.killExplosion.lingering } : undefined,
          },
        }
      : null;
    this.damageZombie(zombie, damage, { angle: impactAngle, kind });
    if (bullet.slowOnHit) {
      zombie.applySlow(bullet.slowOnHit.speedMultiplier, bullet.slowOnHit.duration);
    }
    // 链式闪电放在主命中结算之后：首个目标必须先按正常规则吃到伤害（含爆头与处决），
    // 跳跃只是额外的传导。放在之前会让"第一跳"变成不受爆头判定影响的另一套结算。
    if (bullet.chainLightning) {
      this.resolveChainLightning(zombie, baseDamage, bullet.chainLightning, bullet.slowOnHit);
    }
    if (killExplosion) {
      this.areaEffects.explode(killExplosion.x, killExplosion.y, killExplosion.effect);
    }
  }

  /**
   * 链式闪电的逐跳传导。
   *
   * 每跳取半径内**最近的未命中目标**而不是随机目标：最近优先让电弧的折线读起来
   * 像是在"就近传导"，随机会画出交叉的乱线，玩家看不出跳跃顺序。
   *
   * 起跳伤害用首个目标的 `baseDamage`（未经爆头/处决放大的值）：否则一次幸运爆头
   * 会把整条链的每一跳都乘上爆头倍率，单发上限失控。
   *
   * Boss 参与传导但不被排除在链外——它血厚，被电到几跳是合理回报；
   * 排除它反而会让"打 Boss 时这把枪突然变弱"这种玩家无法归因的落差。
   */
  private resolveChainLightning(
    origin: Zombie,
    baseDamage: number,
    chain: ChainLightningDef,
    slow: SlowOnHitDef | null,
  ): void {
    const visited = new Set<Zombie>([origin]);
    let current = origin;
    let damage = baseDamage;

    for (let jump = 0; jump < chain.jumps; jump += 1) {
      damage *= chain.damageFactor;
      if (damage < 1) break;

      let nearest: Zombie | null = null;
      let nearestDistSq = chain.radius * chain.radius;
      for (const candidate of this.enemySpatialHash.queryRadius(current.x, current.y, chain.radius)) {
        if (!candidate.active || visited.has(candidate)) continue;
        const distSq = distanceSq(current.x, current.y, candidate.x, candidate.y);
        if (distSq > nearestDistSq) continue;
        nearest = candidate;
        nearestDistSq = distSq;
      }
      if (!nearest) break;

      this.spawnLightningArc(current.x, current.y, nearest.x, nearest.y, chain.color);
      visited.add(nearest);
      // 先取坐标：`damageZombie` 可能致死并回池，回池后读到的是下一只的坐标。
      const nextX = nearest.x;
      const nextY = nearest.y;
      const target = nearest;
      if (slow) target.applySlow(slow.speedMultiplier, slow.duration);
      this.damageZombie(target, damage, {
        angle: angleBetweenPoints(current.x, current.y, nextX, nextY),
        kind: 'normal',
      });
      current = target;
    }
  }

  /** 两点之间的一道折线电弧。中点抖动让它读成放电而不是一条直线。 */
  private spawnLightningArc(
    fromX: number,
    fromY: number,
    toX: number,
    toY: number,
    color: number,
  ): void {
    const settings = SaveManager.load(SAVE_KEYS.accessibilitySettings, DEFAULT_ACCESSIBILITY_SETTINGS);
    if (accessibilityFactor(settings.flash) <= 0) return;

    const graphics = this.add.graphics().setDepth(DEPTH.effect);
    graphics.lineStyle(2, color, 0.95);
    graphics.beginPath();
    graphics.moveTo(fromX, fromY);
    // 三段折线：段数再多在 150px 的跳距上分辨不出来，只是多画几笔。
    const segments = 3;
    for (let index = 1; index < segments; index += 1) {
      const t = index / segments;
      const jitter = 10;
      graphics.lineTo(
        fromX + (toX - fromX) * t + Phaser.Math.Between(-jitter, jitter),
        fromY + (toY - fromY) * t + Phaser.Math.Between(-jitter, jitter),
      );
    }
    graphics.lineTo(toX, toY);
    graphics.strokePath();
    this.tweens.add({
      targets: graphics,
      alpha: 0,
      duration: 150,
      onComplete: () => graphics.destroy(),
    });
  }

  private resolveTargetMarkDamageFactor(zombie: Zombie): number {
    const mark = this.targetMarks.get(zombie);
    const factor = resolveTargetMarkDamageFactor(mark, this.time.now);
    if (mark && factor === 1 && this.time.now >= mark.expiresAt) {
      this.targetMarks.delete(zombie);
    }
    return factor;
  }

  private applyTargetMark(zombie: Zombie, effect: MarkOnHitDef): void {
    const previous = this.targetMarks.get(zombie);
    const isNewMark = !previous || this.time.now >= previous.expiresAt;
    this.targetMarks.set(zombie, createTargetMark(effect, this.time.now));
    if (isNewMark) {
      this.damageNumbers.showLabel(
        zombie.x,
        zombie.y - zombie.def.radius - 24,
        'MARKED',
        'pierce',
      );
    }
  }

  private damageZombie(zombie: Zombie, amount: number, impact?: DamageImpact): void {
    if (!zombie.active) return;
    const resolvedAmount = amount * zombie.getIncomingDamageMultiplier(this.time.now);
    const dead = zombie.hurt(resolvedAmount);
    // 致死那一击的数字也要显示：玩家需要看到「最后一发打了多少」。
    this.damageNumbers.show(zombie.x, zombie.y - zombie.def.radius, resolvedAmount, impact?.kind ?? 'normal');
    const phaseTransition = zombie.consumeBossPhaseTransition();
    if (phaseTransition) this.handleBossPhaseTransition(zombie, phaseTransition);
    if (dead) {
      this.handleZombieDeath(zombie, impact);
    }
  }

  private handleZombieDeath(zombie: Zombie, impact?: DamageImpact): void {
    if (!zombie.active) return;

    if (isBossZombie(zombie.def.id)) {
      const started = zombie.beginDeathAnimation(() => this.finalizeZombieDeath(zombie, impact));
      if (!started) return;
      SoundManager.playAt('bossDeath', zombie.x, zombie.y);
      this.applyFeedbackShake('S');
      this.slowMotion.requestByTier('S', this.time.now);
      this.spawnBossDeathLeadIn(zombie.x, zombie.y, zombie.def.color);
      return;
    }

    this.finalizeZombieDeath(zombie, impact);
  }

  private finalizeZombieDeath(zombie: Zombie, impact?: DamageImpact): void {
    if (!zombie.active) return;

    const { x, y } = zombie;
    this.targetMarks.delete(zombie);
    const explosion = zombie.def.explodeOnDeath;
    const isBoss = isBossZombie(zombie.def.id);
    // 快照必须在 despawn 之前取：回池后 sprite 会被下一只感染体覆写。
    const corpse = zombie.getCorpseSnapshot();
    this.state.stats.kills += 1;
    if (isBoss) {
      this.state.stats.bossDefeated = true;
      // 给 Boss 死亡音画留出完整收束时间，避免击杀后一帧就切走结算场景。
      this.bossDeathPendingUntil = this.time.now + 900;
    }
    this.state.score += zombie.def.scoreValue;
    // 击杀不再回血：治疗是药品的唯一职责。原先每杀一只普通感染体回 10 点，
    // 等于把「清场」和「回血」绑成同一个动作，药品只在血量骤降时才有意义。
    // 去掉之后血量只能靠绷带/急救/饮料恢复，掉落表里的药品才真正是资源。
    // 无尽 Boss 已由章节节点保证一次强化，过滤 Boss 自带的 100% 强化包，
    // 否则同一场 Boss 会固定给两次强化，十波章节的成长预算会失控。
    const drops = isBoss && this.mode === 'endless'
      ? zombie.def.drops.filter((drop) => drop.type !== 'enhancement_pack')
      : zombie.def.drops;
    this.spawnDrops(drops);
    this.spawnDeathBurst(x, y, zombie.def.color, isBoss);
    this.spawnBloodBurst(x, y, isBoss ? 14 : 8);
    // Boss 已经播完自己的死亡动画，再让残影滑出去会和刚定格的倒地帧打架。
    this.corpseLayer.spawn(
      x,
      y,
      corpse,
      isBoss ? null : impact?.angle ?? null,
      isBoss ? 0 : Phaser.Math.Between(38, 64),
    );
    if (!isBoss) SoundManager.playAt('enemyDeath', x, y);
    zombie.despawn();
    this.events.emit(EVENTS.scoreChanged);
    this.registerKill(isBoss);

    if (explosion) {
      this.areaEffects.explode(x, y, explosion);
    }
  }

  /**
   * 连杀累计与里程碑播报。
   * 窗口判定放在 `KillStreakRules`，这里只负责状态推进、事件广播与反馈编排。
   */
  private registerKill(isBoss: boolean): void {
    const now = this.time.now;
    if (this.state.stats.kills === 1) this.scriptedMoments.notifyFirstKill();
    this.killStreak = advanceKillStreak(this.killStreak, this.lastKillAt, now, KILL_STREAK_WINDOW);
    this.lastKillAt = now;
    this.state.stats.bestKillStreak = Math.max(this.state.stats.bestKillStreak, this.killStreak);
    this.events.emit(EVENTS.killStreakChanged, this.killStreak);

    const milestone = resolveKillStreakMilestone(this.killStreak);
    if (!milestone) {
      // Boss 击杀的震屏已在 handleZombieDeath 按 S 级处理过，不再叠加一层。
      if (!isBoss) this.applyFeedbackShake('B');
      return;
    }

    this.events.emit(EVENTS.killStreakMilestone, {
      label: milestone.label,
      count: milestone.count,
      color: milestone.color,
    });
    SoundManager.play('streak');
    this.applyFeedbackShake(milestone.tier);
    this.slowMotion.requestByTier(milestone.tier, now);
    this.activateEndlessOverdrive(now);
  }

  private activateEndlessOverdrive(now: number): void {
    if (this.mode !== 'endless') return;
    const spec = resolveEndlessOverdrive(this.killStreak);
    if (!spec) return;
    const current = this.state.player.endlessOverdrive;
    if (current && now < current.expiresAt && current.multiplier > spec.multiplier) return;

    this.state.player.endlessOverdrive = {
      multiplier: spec.multiplier,
      expiresAt: now + spec.durationMs,
      milestone: spec.streak,
      label: spec.label,
      color: spec.color,
    };
    this.events.emit(EVENTS.endlessOverdriveChanged);
    this.events.emit(EVENTS.pickupCollected, {
      title: `${spec.label} · ×${spec.multiplier.toFixed(2)} · ${spec.durationMs / 1000}s`,
      accent: spec.color,
    });
  }

  private updateEndlessOverdrive(now: number): void {
    const overdrive = this.state.player.endlessOverdrive;
    if (!overdrive || now < overdrive.expiresAt) return;
    this.state.player.endlessOverdrive = null;
    this.events.emit(EVENTS.endlessOverdriveChanged);
  }

  /** 统一走分级震屏，避免各处散落魔法数字导致高密度战斗晕眩。 */
  private applyFeedbackShake(tier: FeedbackTier): void {
    const shake = resolveShake(tier);
    if (!shake) return;
    const settings = SaveManager.load(SAVE_KEYS.accessibilitySettings, DEFAULT_ACCESSIBILITY_SETTINGS);
    const factor = accessibilityFactor(settings.shake);
    if (factor <= 0) return;
    this.cameras.main.shake(shake.duration, shake.intensity * factor);
  }

  private syncLowHealthFeedback(lowHealth: boolean): void {
    if (lowHealth && !this.heartbeatEvent) {
      SoundManager.play('heartbeat');
      this.heartbeatEvent = this.time.addEvent({ delay: 900, loop: true, callback: () => SoundManager.play('heartbeat') });
      return;
    }
    if (!lowHealth && this.heartbeatEvent) {
      this.heartbeatEvent.remove(false);
      this.heartbeatEvent = null;
    }
  }

  private handleBossPhaseTransition(zombie: Zombie, transition: BossPhaseTransition): void {
    SoundManager.play('bossPhase');
    this.applyFeedbackShake('A');
    const pulse = this.add.circle(zombie.x, zombie.y, zombie.def.radius, 0xf5bd3d, 0.18).setDepth(DEPTH.effect);
    pulse.setStrokeStyle(5, 0xffe69a, 0.95);
    this.tweens.add({
      targets: pulse,
      scale: 3.2,
      alpha: 0,
      duration: 520,
      ease: 'Cubic.Out',
      onComplete: () => pulse.destroy(),
    });
    this.events.emit(EVENTS.waveAnnounced, {
      title: `PHASE ${transition.phase} / ${transition.totalPhases}`,
      subtitle: `${zombie.def.name} · ${transition.label}`,
      accent: 0xff6f4a,
    });
    // 拉长后的 Boss 战靠这一份补给维持火力，理由见 BOSS_PHASE_TRANSITION_DROPS 的注释。
    this.spawnDrops(BOSS_PHASE_TRANSITION_DROPS);
  }

  /**
   * 结算一组掉落定义。
   *
   * 不再接收坐标：掉落改为即时生效后没有落地实体，`applyDrop` 全程只写库存与事件，
   * 位置不再有任何消费者。保留一个用不到的坐标参数只会让调用方误以为掉落还有落点。
   */
  private spawnDrops(drops: DropDef[]): void {
    let adaptiveAmmoResolved = false;
    for (const drop of drops) {
      // P2 正式切片的强化由阶段节点保证，随机掉落不能绕过冻结内容或改变节奏。
      // 武器已不在掉落表内（`DropDef` 层面就不再有 weapon 变体），因此这里只需拦强化包。
      if (this.levelId === 'level_2' && drop.type === 'enhancement_pack') continue;

      let resolvedDrop = drop;
      let adaptiveAmmo = false;
      if (drop.type === 'ammo' && drop.ammoMode === 'adaptive') {
        // 一个感染体即使误配了多条自适应弹药，也只能解析一次补给机会。
        if (adaptiveAmmoResolved) continue;
        adaptiveAmmoResolved = true;
        const decision = resolveAdaptiveAmmoOpportunity(
          this.state.player,
          resolveDropChance(drop),
          this.state.ammoSupply.lowAmmoMisses,
        );
        this.state.ammoSupply.lowAmmoMisses = decision.nextLowAmmoMisses;
        if (decision.highStockSuppressed) this.state.stats.highStockSuppressions += 1;
        if (!decision.ammoType || decision.amount <= 0) continue;
        adaptiveAmmo = true;
        if (decision.forced) this.state.stats.ammoPityTriggers += 1;
        resolvedDrop = {
          type: 'ammo',
          ammoMode: 'fixed',
          ammoType: decision.ammoType,
          amount: decision.amount,
          chance: 1,
        };
      } else if (Math.random() > resolveDropChance(drop)) {
        continue;
      }

      if (resolvedDrop.type === 'ammo') {
        if (resolvedDrop.ammoMode !== 'fixed') continue;
        this.state.stats.ammoDropsByType[resolvedDrop.ammoType] += 1;
        this.state.stats.ammoAmountsByType[resolvedDrop.ammoType] += resolvedDrop.amount;
        if (adaptiveAmmo) this.state.stats.adaptiveAmmoDrops += 1;
      }

      this.applyDrop(resolvedDrop);
    }
  }

  /**
   * 掉落即时结算。不再生成落地实体，感染体死亡的同一帧就把补给写进库存。
   *
   * 返回值语义已经变了：过去 `false` 表示「没吃下，掉落物留在地上等下次」，
   * 现在没有「下次」，`false` 只表示「这一份没有进库存」（满仓或卡池空）。
   * 满仓那一份由 `notifyDropWasted` 显式告知玩家，而不是静默蒸发。
   */
  private applyDrop(drop: DropDef): boolean {
    if (drop.type === 'ammo') {
      if (drop.ammoMode !== 'fixed') return false;
      this.weaponManager.addAmmo(drop.ammoType, drop.amount ?? 0);
      const ammoLabel = drop.ammoType === 'heavy'
        ? '重型弹药'
        : drop.ammoType === 'shell'
          ? '霰弹'
          : drop.ammoType === 'explosive'
            ? '爆炸弹药'
            : drop.ammoType === 'belt'
              ? '机枪弹链'
              : drop.ammoType === 'fuel'
                ? '燃料'
                : '轻型弹药';
      this.events.emit(EVENTS.pickupCollected, { title: `${ammoLabel} +${drop.amount ?? 0}`, accent: 0xfbc02d });
      SoundManager.play('pickup');
      return true;
    }

    if (drop.type === 'medicine') {
      const medicineId = drop.medicineId as MedicineId;
      const medicine = MEDICINES[medicineId];
      const added = this.medicineManager.addMedicine(medicineId, drop.amount);
      if (added > 0) {
        this.events.emit(EVENTS.pickupCollected, {
          title: `${medicine.name} +${added}`,
          accent: medicine.color,
        });
        SoundManager.play('pickup');
        return true;
      }
      this.notifyDropWasted(`${medicine.name} · 已满`, medicine.color);
      return false;
    }

    if (drop.type === 'item') {
      if (!drop.itemId || !(drop.itemId in ITEMS)) return false;
      const itemDef = ITEMS[drop.itemId as ItemId];
      const added = this.itemManager.addItem(drop.itemId as ItemId, drop.amount ?? 1);
      if (added > 0) {
        this.events.emit(EVENTS.pickupCollected, { title: `${itemDef.name} +${added}`, accent: itemDef.color });
        SoundManager.play('pickup');
        return true;
      }
      this.notifyDropWasted(`${itemDef.name} · 已满`, itemDef.color);
      return false;
    }

    // 强化包必须排队：一波怪同帧死亡时会掉出多个，而抽卡界面一次只能开一个。
    // 第一个立即弹出，其余入队，等玩家选完卡在 handleCardSelected 里逐个弹。
    if (drop.type === 'enhancement_pack') {
      if (this.pauseReason !== null) {
        this.pendingEnhancementPacks += 1;
        return true;
      }
      return this.handleEnhancementPickup();
    }

    // 武器不再作为敌人掉落发放，改走关卡阶段奖励（见 handleWaveRewards 的 weapon 分支）。
    // 掉落随机，玩家可能整局拿不到某把枪；阶段奖励是确定节点，同时由 SaveManager 记许可。
    // 掉落表里已经没有 weapon 条目（由 tests/weapon-loadout.test.ts 断言守住），
    // 走到这里说明配置有残留，按未处理返回。
    return false;
  }

  /**
   * 满仓导致这一份补给作废时的提示。
   *
   * 掉落改成即时结算后没有「留在地上等下次」这条退路，不给提示的话玩家会
   * 完全看不出自己漏掉了什么。用与正常拾取相同的吐司通道，但文案标明「已满」，
   * 且不播 `pickup` 音效——避免听起来像成功入库。
   */
  private notifyDropWasted(title: string, accent: number): void {
    this.events.emit(EVENTS.pickupCollected, { title, accent });
  }

  private handleEnhancementPickup(): boolean {
    if (this.pauseReason !== null) return false;

    const drawnCards = EnhancementManager.drawEnhancements(
      this.state.player.ownedWeapons,
      this.state.player.activeEnhancements,
    );

    // 卡池被拿空时不再弹出空白抽卡界面：那样只会强行暂停一次战斗，
    // 还把强化包白白消耗掉。这里直接消耗掉并给出提示。
    if (drawnCards.length === 0) {
      this.events.emit(EVENTS.pickupCollected, { title: '暂无可用增强', accent: 0x58c9dd });
      SoundManager.play('pickup');
      return true;
    }

    const cardSelectionData = {
      cards: drawnCards,
      // 卡面要按玩家当前的实际数值算涨幅，所以把已激活强化一起传过去。
      activeEnhancements: [...this.state.player.activeEnhancements],
    };
    const cardSelectionScene = this.scene.get(SCENES.cardSelection);
    if (this.scene.isActive(SCENES.cardSelection) || this.scene.isSleeping(SCENES.cardSelection)) {
      cardSelectionScene.scene.restart(cardSelectionData);
    } else {
      this.scene.launch(SCENES.cardSelection, cardSelectionData);
    }
    this.scene.setVisible(true, SCENES.cardSelection);
    this.scene.bringToTop(SCENES.cardSelection);
    this.setPause('cardSelection');
    this.scene.bringToTop(SCENES.cardSelection);
    return true;
  }

  private handleWaveRewards(wave: WaveDef): boolean {
    const rewards = wave.rewards ?? [];
    if (rewards.length === 0) return false;

    const rewardLabels: string[] = [];

    for (const reward of rewards) {
      if (reward.type === 'weapon') {
        if (!(reward.weaponId in WEAPONS)) continue;
        const weaponId = reward.weaponId as WeaponId;
        const alreadyOwned = this.state.player.ownedWeapons.includes(weaponId);
        const addedToRun = this.weaponManager.pickupWeapon(weaponId, true, reward.ammo);
        const licenseUnlocked = SaveManager.unlockWeapon(weaponId);
        this.events.emit(EVENTS.pickupCollected, {
          title: !alreadyOwned && !addedToRun && this.state.player.ownedWeapons.length >= MAX_WEAPON_LOADOUT_SIZE
            ? licenseUnlocked
              ? `${WEAPONS[weaponId].name} · 许可解锁，可在武器库编入`
              : `${WEAPONS[weaponId].name} · 编队已满，可在武器库调整`
            : licenseUnlocked
              ? `阶段补给 · ${WEAPONS[weaponId].name} · 许可解锁`
              : `阶段补给 · ${WEAPONS[weaponId].name}`,
          accent: WEAPONS[weaponId].color,
        });
        SoundManager.play('pickup');
        continue;
      }
      if (reward.type === 'resupply') {
        const amount = this.weaponManager.resupplyOwnedWeapons(reward.magazines);
        if (amount > 0) rewardLabels.push(`弹药 +${amount}`);
        continue;
      }
      if (reward.type === 'medicine') {
        const added = this.medicineManager.addMedicine(reward.medicineId, reward.amount);
        if (added > 0) rewardLabels.push(`${MEDICINES[reward.medicineId].name}×${added}`);
        continue;
      }
      if (reward.type === 'item') {
        if (!(reward.itemId in ITEMS)) continue;
        const itemId = reward.itemId as ItemId;
        const added = this.itemManager.addItem(itemId, reward.amount);
        if (added > 0) rewardLabels.push(`${ITEMS[itemId].name}×${added}`);
      }
    }

    if (rewardLabels.length > 0) {
      this.events.emit(EVENTS.pickupCollected, {
        title: `${wave.endless?.kind === 'boss' ? '章节战利品' : '阶段补给'} · ${rewardLabels.join(' / ')}`,
        accent: wave.endless?.accent ?? 0x58c9dd,
      });
      SoundManager.play('pickup');
    }

    if (!rewards.some((reward) => reward.type === 'enhancement')) return false;
    this.rewardContinuationPending = true;
    const opened = this.handleEnhancementPickup();
    if (!opened || this.pauseReason !== 'cardSelection') {
      this.rewardContinuationPending = false;
      return false;
    }
    return true;
  }

  private damagePlayer(amount: number, source: PlayerDamageSource): void {
    if (this.gameEnded) return;
    const now = this.time.now;
    const incomingAmount = amount;
    const character = getCharacterDef(this.state.player.characterId);
    const resolvedAmount = resolveIncomingPlayerDamage(
      character,
      amount,
      source,
      this.skillManager.isActive(),
    );
    if (resolvedAmount <= 0 || !this.player.takeDamage(resolvedAmount, now)) return;

    const healthBefore = this.state.player.health;
    let healthAfter = Math.max(0, healthBefore - resolvedAmount);
    const runtime = this.state.player.characterPassive;
    if (healthAfter <= 0 && character.passive.kind === 'lastStand' && runtime.lastStandAvailable) {
      healthAfter = 1;
      runtime.lastStandAvailable = false;
      this.player.grantInvulnerability(now, character.passive.invulnerabilityMs);
      this.events.emit(EVENTS.characterChanged);
      this.events.emit(EVENTS.waveAnnounced, {
        title: 'LAST STAND',
        subtitle: `${character.codename} · ${character.passive.name}`,
        accent: character.accentColor,
      });
    }
    this.state.player.health = healthAfter;
    this.damageEvents.push({
      at: now,
      wave: this.state.waveIndex,
      source,
      incomingAmount,
      amount: healthBefore - healthAfter,
      healthBefore,
      healthAfter,
      x: this.player.x,
      y: this.player.y,
    });
    SoundManager.play('hurt');
    this.events.emit(EVENTS.healthChanged);
    this.cameras.main.shake(Math.min(130, 50 + resolvedAmount * 2), 0.0022);
    // 玩家受伤会打断连杀节奏，计数立即归零，避免"边挨打边刷连杀"。
    this.killStreak = 0;
    this.events.emit(EVENTS.killStreakChanged, this.killStreak);

    if (this.state.player.health <= 0) {
      this.handleGameOver();
    }
  }

  private triggerProp(prop: Prop, chainSet = new Set<Prop>()): void {
    if (!prop.markTriggered()) return;

    chainSet.add(prop);
    const { x, y } = prop;
    const effect = scalePlayerEffect(prop.def.effect, prop.playerDamageMultiplier) ?? prop.def.effect;
    if (prop.def.id === 'barrel_oil') this.state.stats.oilBarrelsTriggered += 1;
    else if (prop.def.id === 'barrel_flour') this.state.stats.flourBarrelsTriggered += 1;
    else if (prop.def.id === 'mine') this.state.stats.minesTriggered += 1;
    prop.despawn();
    this.areaEffects.explode(x, y, effect, chainSet);
  }

  private handleGameOver(): void {
    if (this.gameEnded) return;
    if (this.pauseReason !== null) this.setPause(null);
    this.medicineManager.clearOnDeath();
    this.destroyMedicineUseProgress();
    this.gameEnded = true;
    // 必须在 scene.start 触发 shutdown 前冻结，否则 CDP 只能读到已销毁对象。
    this.finalCombatDiagnostics = this.buildCombatDiagnostics();
    SoundManager.play('gameOver');
    this.events.emit(EVENTS.gameOver);

    this.recordEndlessBest();

    this.scene.start(SCENES.gameOver, {
      mode: this.mode,
      levelId: this.levelId,
      score: this.state.score,
      wave: this.state.waveIndex,
      elapsedMs: this.state.stats.elapsedMs,
      kills: this.state.stats.kills,
      bossDefeated: this.state.stats.bossDefeated,
      enhancements: this.state.player.activeEnhancements.size,
      bestKillStreak: this.state.stats.bestKillStreak,
      characterId: this.state.player.characterId,
      starterWeaponId: this.starterWeaponId,
      headshots: this.state.stats.headshots,
      executions: this.state.stats.executions,
      pierceHits: this.state.stats.pierceHits,
      oilBarrelsTriggered: this.state.stats.oilBarrelsTriggered,
      flourBarrelsTriggered: this.state.stats.flourBarrelsTriggered,
      minesTriggered: this.state.stats.minesTriggered,
      weaponUsageMs: this.state.stats.weaponUsageMs,
      weaponEmptyEvents: this.state.stats.weaponEmptyEvents,
      ammoAmountsByType: this.state.stats.ammoAmountsByType,
      ammoPityTriggers: this.state.stats.ammoPityTriggers,
      finiteWeaponsUnavailableMs: this.state.stats.finiteWeaponsUnavailableMs,
    });
  }

  /** 无尽纪录只在波次超过历史最好成绩时写盘；结算与主动挂起共用同一处逻辑。 */
  private recordEndlessBest(): void {
    if (this.mode !== 'endless') return;
    const best = SaveManager.load<number>(SAVE_KEYS.endlessBestWave, 0);
    if (this.state.waveIndex > best) {
      SaveManager.save(SAVE_KEYS.endlessBestWave, this.state.waveIndex);
    }
  }

  private handleLevelClear(): void {
    if (this.mode !== 'level' || this.gameEnded) return;
    if (this.pauseReason !== null) this.setPause(null);
    this.medicineManager.clearOnDeath();
    this.destroyMedicineUseProgress();
    this.gameEnded = true;
    this.finalCombatDiagnostics = this.buildCombatDiagnostics();
    SoundManager.play('levelClear');

    const currentIndex = LEVELS.findIndex((entry) => entry.id === this.levelId);
    const nextLevelId = currentIndex >= 0 ? LEVELS[currentIndex + 1]?.id ?? null : null;
    const unlocked = SaveManager.load<string[]>(SAVE_KEYS.unlockedLevels, [LEVELS[0]?.id ?? 'level_1']);
    const newlyUnlockedLevelId = nextLevelId && !unlocked.includes(nextLevelId) ? nextLevelId : null;
    if (newlyUnlockedLevelId) {
      unlocked.push(newlyUnlockedLevelId);
      SaveManager.save(SAVE_KEYS.unlockedLevels, unlocked);
    }

    this.events.emit(EVENTS.levelClear);
    this.scene.start(SCENES.levelClear, {
      levelId: this.levelId,
      nextLevelId,
      score: this.state.score,
      wave: this.state.waveIndex,
      elapsedMs: this.state.stats.elapsedMs,
      kills: this.state.stats.kills,
      bossDefeated: this.state.stats.bossDefeated,
      enhancements: this.state.player.activeEnhancements.size,
      bestKillStreak: this.state.stats.bestKillStreak,
      characterId: this.state.player.characterId,
      starterWeaponId: this.starterWeaponId,
      headshots: this.state.stats.headshots,
      executions: this.state.stats.executions,
      pierceHits: this.state.stats.pierceHits,
      oilBarrelsTriggered: this.state.stats.oilBarrelsTriggered,
      flourBarrelsTriggered: this.state.stats.flourBarrelsTriggered,
      minesTriggered: this.state.stats.minesTriggered,
      weaponUsageMs: this.state.stats.weaponUsageMs,
      weaponEmptyEvents: this.state.stats.weaponEmptyEvents,
      ammoAmountsByType: this.state.stats.ammoAmountsByType,
      ammoPityTriggers: this.state.stats.ammoPityTriggers,
      finiteWeaponsUnavailableMs: this.state.stats.finiteWeaponsUnavailableMs,
      unlockedLevelId: newlyUnlockedLevelId,
    });
  }

  private emitStateChanged(): void {
    this.events.emit(EVENTS.characterChanged);
    this.events.emit(EVENTS.healthChanged);
    this.events.emit(EVENTS.ammoChanged);
    this.events.emit(EVENTS.weaponChanged);
    this.events.emit(EVENTS.itemChanged);
    this.events.emit(EVENTS.medicineChanged);
    this.events.emit(EVENTS.scoreChanged);
    this.events.emit(EVENTS.waveChanged);
    this.events.emit(EVENTS.killStreakChanged, this.killStreak);
    this.events.emit(EVENTS.endlessOverdriveChanged);
  }

  private getActiveZombies(): Zombie[] {
    return this.zombiePool.getActive();
  }

  private getActiveProps(): Prop[] {
    return this.props.filter((prop) => prop.active);
  }

  private getCurrentLevel() {
    return LEVELS.find((entry) => entry.id === this.levelId) ?? null;
  }

  private buildCombatDiagnostics(): CombatDiagnosticsSnapshot | null {
    // GameScene 实例可在 create 前被 SceneManager 取得，此时所有运行时对象都尚不存在。
    if (!this.diagnosticsRuntimeActive || !this.state || !this.player || !this.waveManager) return null;

    const zombies = this.zombiePool?.getActive() ?? [];
    const activeEnemies: Record<string, number> = {};
    for (const zombie of zombies) {
      activeEnemies[zombie.def.id] = (activeEnemies[zombie.def.id] ?? 0) + 1;
    }
    const areaCounts = this.areaEffects?.getActiveCounts() ?? { lingerZones: 0, enemyBlasts: 0 };
    const currentWeaponId = this.state.player.currentWeaponId;
    const overdrive = this.getEndlessOverdriveStatus();

    return createCombatDiagnostics(this.damageEvents, {
      capturedAt: this.time?.now ?? 0,
      mode: this.mode,
      waveNumber: this.state.waveIndex,
      gameEnded: this.gameEnded,
      pauseReason: this.pauseReason,
      player: {
        characterId: this.state.player.characterId,
        health: this.state.player.health,
        maxHealth: this.state.player.maxHealth,
        x: this.player.x,
        y: this.player.y,
        currentWeaponId,
        ownedWeapons: [...this.state.player.ownedWeapons],
        ammoInMag: this.state.player.ammoInMag[currentWeaponId] ?? 0,
        ammoReserve: { ...this.state.player.ammoReserve },
      },
      wave: this.waveManager.getProgressSnapshot(),
      overdrive: overdrive
        ? {
            multiplier: overdrive.multiplier,
            remaining: overdrive.remaining,
            milestone: overdrive.milestone,
            label: overdrive.label,
          }
        : null,
      objects: {
        zombies: zombies.length,
        bullets: this.bulletPool?.getActive().length ?? 0,
        enemyProjectiles: this.enemyProjectilePool?.getActive().length ?? 0,
        props: this.getActiveProps().length,
        damageNumbers: this.damageNumbers?.activeCount ?? 0,
        corpses: this.corpseLayer?.activeCount ?? 0,
        lingerZones: areaCounts.lingerZones,
        enemyBlasts: areaCounts.enemyBlasts,
      },
      activeEnemies,
    });
  }

  private setPause(reason: PauseReason | null): void {
    if (this.pauseReason === reason) return;
    const wasPaused = this.pauseReason !== null;
    this.pauseReason = reason;
    if (reason === 'cardSelection') this.cardSelectionPausedAt = this.game.loop.time;
    // Phaser 在 shutdown 期间可能已经销毁 Arcade World；正常唤醒与销毁清理
    // 必须允许处于不同的生命周期阶段，不能把恢复物理当成清理的前置条件。
    const world = this.physics?.world;

    if (reason !== null && !wasPaused) {
      this.frozenAtLoopTime = this.game.loop.time;
      // 冻结期间 update 不再跑，火焰会定格在画面上；先收火，解冻后按住扳机自然重开。
      this.flameCone?.stop();
      world?.pause();
      this.time.timeScale = 0;
      this.tweens.pauseAll();
      SoundManager.pauseMusic(true);
    } else if (reason === null) {
      this.time.timeScale = 1;
      this.tweens.resumeAll();
      SoundManager.pauseMusic(false);
      // world 不存在只可能发生在 shutdown 等清理阶段；此时战斗不会继续，
      // 不应再平移已经准备销毁的武器、波次和实体计时器。
      resumePhysicsAfterPause(
        world,
        this.game.loop.time,
        this.frozenAtLoopTime,
        (offset) => this.shiftBattleTimers(offset),
      );
    }

    // HUD 只是表现层，但它订阅了这个事件。监听器抛异常时绝不能把冻结状态机带塌：
    // 曾经 HUD 在这里对已销毁的补间调用 pause() 抛出 TypeError，异常沿着
    // 物理碰撞回调一路上抛，导致 `handleEnhancementPickup` 里已经排队的
    // `scene.launch(CardSelectionScene)` 永远没被处理——战场冻结、抽卡界面不存在，
    // 而只有抽卡界面能解冻，整局永久卡死。
    // 这里隔离的是「表现层没画好」，换回的是「核心状态机始终自洽」；
    // 异常仍然打到 console.error，不会被静默吞掉。
    // 详见 questions/2026-08-22-强化卡拾取卡死.md
    try {
      this.events.emit(EVENTS.pauseChanged, this.pauseReason);
    } catch (error) {
      console.error('[GameScene] pauseChanged 监听器抛出异常，已隔离以保住冻结状态机', error);
    }
  }

  /**
   * 把战场里所有基于 `time.now` 的绝对时间点整体后移冻结时长。
   *
   * Phaser 的场景时钟在冻结期间仍然跟随真实时间前进——`timeScale = 0` 只冻结 TimerEvent
   * 的累计 elapsed，`time.now` 照常推进。不做这次平移的话：暂停半分钟再继续，
   * 本波剩余敌人会在几帧内全部刷出、残留区直接过期、已经读条的敌方轰炸和已经进入前摇的
   * 技能会立刻结算成无法躲避的命中。
   *
   * 平移量是精确的冻结时长，因此恢复后的战场与冻结瞬间完全一致。
   */
  private shiftBattleTimers(offset: number): void {
    if (offset <= 0) return;
    this.waveManager.shiftTimers(offset);
    this.weaponManager.shiftTimers(offset);
    this.flameCone.shiftTimers(offset);
    this.areaEffects.shiftTimers(offset);
    this.player.shiftTimers(offset);
    // 技能冷却与持续窗口都是绝对时间点：不平移的话暂停 30 秒回来，冷却会凭空走完，
    // 已经开着的过载窗口会立刻过期。
    this.skillManager.shiftTimers(offset);
    // 连杀窗口同样基于 time.now：抽卡冻结不该把玩家攒起来的连杀白清掉。
    this.lastKillAt += offset;
    if (this.state.player.endlessOverdrive) {
      this.state.player.endlessOverdrive.expiresAt += offset;
    }
    for (const zombie of this.getActiveZombies()) {
      zombie.shiftTimers(offset);
    }
    for (const mark of this.targetMarks.values()) {
      mark.expiresAt += offset;
    }
  }

  private announceWave(waveNumber: number, wave: WaveDef): void {
    const level = this.getCurrentLevel();
    const total = this.getWaveTotal();
    const isBossWave = this.mode === 'level' && !!level?.boss && waveNumber === level.waves.length + 1;
    const endlessMeta = wave.endless;

    if ((isBossWave && level?.boss) || endlessMeta?.kind === 'boss') {
      this.battleMusicMode = 'boss';
      SoundManager.setMusic(this.battleMusicMode);
      SoundManager.play('bossWave');
      const bossId = endlessMeta?.bossId ?? level?.boss?.type;
      const bossName = bossId ? ZOMBIES[bossId]?.name ?? 'Boss' : 'Boss';
      this.events.emit(EVENTS.waveAnnounced, {
        title: endlessMeta ? `CHAPTER ${endlessMeta.chapter} · BOSS` : 'BOSS WAVE',
        subtitle: `${bossName} 已进入战场`,
        accent: 0xff6f4a,
      });
      return;
    }

    this.battleMusicMode = 'battle';
    SoundManager.setMusic(this.battleMusicMode);
    SoundManager.play('wave');
    this.events.emit(EVENTS.waveAnnounced, {
      title: endlessMeta?.title ?? `WAVE ${waveNumber}${total ? ` / ${total}` : ''}`,
      subtitle: endlessMeta
        ? `W${waveNumber} · ${endlessMeta.subtitle}`
        : `${this.getLevelLabel()} 推进中`,
      accent: endlessMeta?.accent ?? 0xfbc02d,
    });
  }

  private spawnMuzzleFlash(feedback: WeaponFireFeedback): void {
    SoundManager.play(WEAPON_FIRE_EVENTS[this.state.player.currentWeaponId]);
    // 扇形武器的表现完全由 FlameConeSystem 承担：再叠枪口闪光和弹道拖尾，
    // 火焰根部会出现一圈跟火色打架的白点，而且拖尾在“没有弹丸”的武器上是错的。
    if (feedback.coneAttack) return;
    // 弹链用青色、齐射用亮金色，和普通开火形成不同的枪口轮廓；爆头只在命中点反馈。
    const accent = feedback.ammoChainTriggered
      ? (this.state.player.currentWeaponId === 'golden_m249' ? feedback.color : 0x0acbe6)
      : feedback.burstCount > 1
        ? 0xffd54a
        : feedback.color;
    const sizeBoost = feedback.ammoChainTriggered
      ? 1.7
      : feedback.burstCount > 1
        ? 1.5
        : 1;
    const flash = this.add.circle(feedback.x, feedback.y, Math.max(8, 6 + feedback.pellets) * sizeBoost, accent, 0.78);
    flash.setDepth(DEPTH.effect);
    const streaks = Array.from({ length: feedback.burstCount }, (_, index) => {
      const streak = this.add.rectangle(
        feedback.x,
        feedback.y,
        (22 + feedback.pellets * 2) * sizeBoost,
        4 * sizeBoost,
        accent,
        0.92,
      );
      streak.setDepth(DEPTH.effect);
      streak.setRotation(feedback.angle + (index - (feedback.burstCount - 1) / 2) * 0.045);
      return streak;
    });
    this.tweens.add({
      targets: [flash, ...streaks],
      alpha: 0,
      scaleX: 1.8,
      scaleY: 0.2,
      duration: 90,
      onComplete: () => {
        flash.destroy();
        streaks.forEach((streak) => streak.destroy());
      },
    });
  }

  /** 战场内短读条跟随角色，侧栏之外也能看清当前药品进度。 */
  private syncMedicineUseProgress(): void {
    const activeUse = this.state.player.medicineUse;
    if (!activeUse) {
      this.destroyMedicineUseProgress();
      return;
    }

    const def = MEDICINES[activeUse.medicineId];
    const left = this.player.x - 20;
    const top = this.player.y + 22;
    if (!this.medicineUseProgressBg || !this.medicineUseProgressFill) {
      this.medicineUseProgressBg = this.add.rectangle(left, top, 40, 4, 0x0f0e13, 0.9)
        .setOrigin(0, 0.5)
        .setDepth(DEPTH.effect)
        .setStrokeStyle(1, def.color, 0.8);
      this.medicineUseProgressFill = this.add.rectangle(left, top, 40, 4, def.color, 0.96)
        .setOrigin(0, 0.5)
        .setDepth(DEPTH.effect);
    }

    const progress = activeUse.durationMs > 0
      ? Phaser.Math.Clamp(activeUse.elapsedMs / activeUse.durationMs, 0, 1)
      : 1;
    this.medicineUseProgressBg.setPosition(left, top).setStrokeStyle(1, def.color, 0.8);
    this.medicineUseProgressFill
      .setPosition(left, top)
      .setFillStyle(def.color, 0.96);
    this.medicineUseProgressFill.width = 40 * progress;
  }

  private destroyMedicineUseProgress(): void {
    this.medicineUseProgressBg?.destroy();
    this.medicineUseProgressFill?.destroy();
    this.medicineUseProgressBg = null;
    this.medicineUseProgressFill = null;
  }

  private spawnImpactBurst(x: number, y: number, color: number, count: number): void {
    const settings = SaveManager.load(SAVE_KEYS.accessibilitySettings, DEFAULT_ACCESSIBILITY_SETTINGS);
    const factor = accessibilityFactor(settings.flash);
    if (factor <= 0) return;
    count = Math.max(1, Math.round(count * factor));
    for (let i = 0; i < count; i++) {
      const angle = Phaser.Math.FloatBetween(0, Math.PI * 2);
      const distance = Phaser.Math.Between(10, 24);
      const spark = this.add.circle(x, y, Phaser.Math.Between(2, 3), color, 0.95);
      spark.setDepth(DEPTH.effect);
      this.tweens.add({
        targets: spark,
        x: x + Math.cos(angle) * distance,
        y: y + Math.sin(angle) * distance,
        alpha: 0,
        scale: 0.4,
        duration: Phaser.Math.Between(120, 180),
        onComplete: () => spark.destroy(),
      });
    }
  }

  private spawnDeathBurst(x: number, y: number, color: number, isBoss: boolean): void {
    const ring = this.add.circle(x, y, isBoss ? 26 : 18, color, 0.16).setDepth(DEPTH.effect);
    ring.setStrokeStyle(isBoss ? 4 : 3, color, 0.9);
    this.tweens.add({
      targets: ring,
      scale: isBoss ? 2.4 : 1.8,
      alpha: 0,
      duration: isBoss ? 320 : 220,
      onComplete: () => ring.destroy(),
    });
  }

  /**
   * 击杀血液粒子。
   * 暗红小圆点加重击杀的分量，与命中火花（白色）在颜色上分开，
   * 玩家扫一眼就能区分「打中了」和「打死了」。位图粒子替换属于 G5-3。
   */
  private spawnBloodBurst(x: number, y: number, count: number): void {
    const settings = SaveManager.load(SAVE_KEYS.accessibilitySettings, DEFAULT_ACCESSIBILITY_SETTINGS);
    if (!settings.blood) return;
    for (let i = 0; i < count; i++) {
      const angle = Phaser.Math.FloatBetween(0, Math.PI * 2);
      const distance = Phaser.Math.Between(14, 46);
      const drop = this.add.circle(x, y, Phaser.Math.Between(2, 4), 0x8e1b18, 0.9);
      drop.setDepth(DEPTH.effect);
      this.tweens.add({
        targets: drop,
        x: x + Math.cos(angle) * distance,
        y: y + Math.sin(angle) * distance,
        alpha: 0,
        scale: 0.3,
        duration: Phaser.Math.Between(220, 380),
        ease: 'Cubic.Out',
        onComplete: () => drop.destroy(),
      });
    }
  }

  private spawnBossDeathLeadIn(x: number, y: number, color: number): void {
    const core = this.add.circle(x, y, 22, color, 0.32).setDepth(DEPTH.effect);
    core.setStrokeStyle(4, 0xffd7a3, 0.9);
    this.tweens.add({
      targets: core,
      scale: 2.8,
      alpha: 0,
      duration: 720,
      yoyo: true,
      onComplete: () => core.destroy(),
    });
  }

  private handleShutdown(): void {
    // Phaser 的 shutdown 事件可能晚于 Group 销毁；此后只允许读取切场景前已冻结的快照。
    this.diagnosticsRuntimeActive = false;
    if (this.pauseReason !== null) {
      // shutdown 不是一次可继续的“恢复”：场景及其物理世界即将销毁，
      // 只复位场景时钟和补间，避免触碰已释放的 Arcade World。
      this.pauseReason = null;
      this.time.timeScale = 1;
      this.tweens.resumeAll();
    }
    this.events.off(Phaser.Scenes.Events.WAKE, this.handleWake, this);
    this.events.off(CARD_SELECTED_EVENT, this.handleCardSelected, this);
    this.input.keyboard?.off('keydown-ESC', this.handleMenuKey, this);
    // 挂起过的战局里 HUD 处于 sleeping，`isActive` 查不到，必须一并判断否则会漏关。
    if (this.scene.isActive(SCENES.hud) || this.scene.isSleeping(SCENES.hud)) {
      this.scene.stop(SCENES.hud);
    }
    this.weaponManager.destroy();
    this.flameCone?.destroy();
    this.medicineManager.clearOnDeath();
    this.destroyMedicineUseProgress();
    this.targetMarks.clear();
    this.enemySpatialHash.clear();
    SoundManager.pauseMusic(false);
    this.heartbeatEvent?.remove(false);
    this.heartbeatEvent = null;
    // 顺序要紧：areaEffects 先归还它持有的循环精灵，再销毁池子本身。
    // 反过来会对已销毁的 Phaser 组调 release，抛 "Cannot read properties of null"。
    this.areaEffects.destroy();
    this.effectSprites.destroy();
    // 慢动作缩放挂在 physics/anims 上，不复位会被下一局继承。
    this.slowMotion.reset();
    this.damageNumbers.destroy();
    this.corpseLayer.destroy();
  }
}
