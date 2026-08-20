import Phaser from 'phaser';
import type { ItemId } from '../config/items';
import { ITEMS } from '../config/items';
import { LEVELS } from '../config/levels';
import { WEAPONS, type WeaponId } from '../config/weapons';
import { ZOMBIES, isBossZombie, type ZombieId } from '../config/zombies';
import {
  buildMonsterReviewPlacements,
  type MonsterReviewPlacement,
} from '../config/monsterArtReview';
import { DEPTH, EVENTS, GAME_HEIGHT, GAME_WIDTH, SCENES } from '../constants';
import { Bullet } from '../entities/Bullet';
import { EnemyProjectile } from '../entities/EnemyProjectile';
import { Obstacle } from '../entities/Obstacle';
import { Player } from '../entities/Player';
import { Pickup } from '../entities/Pickup';
import { Prop } from '../entities/Prop';
import { Zombie, type BossPhaseTransition } from '../entities/Zombie';
import { AreaEffectFactory } from '../systems/AreaEffectFactory';
import { renderBattlefield } from '../systems/BattlefieldRenderer';
import { configureHighResolutionScene } from '../systems/DisplayManager';
import { createInitialState, type GameMode, type GameState } from '../systems/GameState';
import { InputManager } from '../systems/InputManager';
import { ItemManager } from '../systems/ItemManager';
import { MedicineManager } from '../systems/MedicineManager';
import { DEFAULT_ACCESSIBILITY_SETTINGS, SAVE_KEYS, SaveManager } from '../systems/SaveManager';
import { WaveManager } from '../systems/WaveManager';
import {
  WeaponManager,
  type WeaponFireFeedback,
  type WeaponReloadStatus,
  type WeaponStatus,
} from '../systems/WeaponManager';
import { SoundManager } from '../systems/SoundManager';
import { EnemyAbilitySystem } from '../systems/EnemyAbilitySystem';
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
import type { DropDef, MarkOnHitDef, WaveDef } from '../config/types';
import type { Keybinds } from '../config/keybinds';
import {
  ENDLESS_PROP_MIN_DISTANCE,
  getOldestEndlessProp,
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
  resolveHeadshotDamage,
  resolveIncomingPlayerDamage,
  rollHeadshot,
  scalePlayerEffect,
} from '../systems/CharacterCombatRules';
import { MEDICINES, type MedicineId } from '../config/medicine';

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
  private pickupPool!: ObjectPool<Pickup>;
  private weaponManager!: WeaponManager;
  private itemManager!: ItemManager;
  private medicineManager!: MedicineManager;
  private areaEffects!: AreaEffectFactory;
  private enemyAbilitySystem!: EnemyAbilitySystem;
  private waveManager!: WaveManager;
  private corpseLayer!: CorpseLayer;
  private damageNumbers!: DamageNumberManager;
  private slowMotion!: SlowMotionManager;
  private scriptedMoments!: ScriptedMomentSystem;

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
  private rewardContinuationPending = false;
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
    this.state = createInitialState(
      this.mode,
      this.levelId,
      this.starterWeaponId,
      this.loadoutWeaponIds,
      this.characterId,
    );
    this.props = [];
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
      getCharacterDef(this.characterId).textureKey,
    );
    this.propGroup = this.add.group();
    this.obstacleGroup = this.physics.add.staticGroup();

    this.bulletPool = new ObjectPool(this, (scene) => new Bullet(scene), 36);
    this.enemyProjectilePool = new ObjectPool(this, (scene) => new EnemyProjectile(scene), 20);
    this.zombiePool = new ObjectPool(this, (scene) => new Zombie(scene), 32);
    this.pickupPool = new ObjectPool(this, (scene) => new Pickup(scene), 16);
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

    this.areaEffects = new AreaEffectFactory({
      scene: this,
      player: this.player,
      getZombies: () => this.getActiveZombies(),
      getProps: () => this.getActiveProps(),
      damageZombie: (zombie, amount, impact) => this.damageZombie(zombie, amount, impact),
      damagePlayer: (amount, source) => this.damagePlayer(amount, source),
      detonateProp: (prop, chainSet) => this.triggerProp(prop, chainSet),
    });
    this.enemyAbilitySystem = new EnemyAbilitySystem({
      scene: this,
      projectilePool: this.enemyProjectilePool,
      areaEffects: this.areaEffects,
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

    this.waveManager = new WaveManager({
      scene: this,
      mode: this.mode,
      levelId: this.levelId,
      spawnZombie: (typeId) => this.spawnZombie(typeId),
      hasAliveEnemies: () => this.getActiveZombies().length > 0 || this.time.now < this.bossDeathPendingUntil,
      getActiveEnemyCount: () => this.getActiveZombies().length,
      onWaveStarted: (waveNumber) => {
        this.state.waveIndex = waveNumber;
        this.events.emit(EVENTS.waveChanged);
        this.announceWave(waveNumber);
        if (this.mode === 'endless') {
          this.spawnEndlessProps(waveNumber);
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
  }

  update(_time: number, delta: number): void {
    if (this.gameEnded) return;
    if (this.pauseReason !== null) return;

    this.state.stats.elapsedMs += delta;
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
    this.player.update(
      this.inputManager,
      this.state.player.moveSpeed
        * (lowHealth ? 1.2 : 1)
        * this.medicineManager.getMoveSpeedMultiplier(),
    );
    this.syncMedicineUseProgress();
    this.updateCharacterPassive(delta);
    this.syncLowHealthFeedback(lowHealth);
    SoundManager.setListenerPosition(this.player.x, this.player.y);
    this.handleWeaponInput();
    this.player.setWeaponVisual(this.state.player.currentWeaponId);
    const fireFeedback = this.weaponManager.update(
      this.time.now,
      this.player,
      !medicineChanneling && this.inputManager.isDown('fire'),
      !medicineChanneling && this.inputManager.justPressed('fire'),
    );
    if (fireFeedback) {
      this.player.playFireFeedback(fireFeedback.color);
      this.spawnMuzzleFlash(fireFeedback);
    }
    this.itemManager.update(!medicineChanneling);
    this.areaEffects.update(this.time.now);
    this.updateBullets();
    this.updateEnemyProjectiles();
    this.updatePickups();
    this.updateZombies(delta);
    this.waveManager.update(this.time.now);
    // 剧本时刻的条件触发（如濒死包夹）走每帧心跳；未配置时刻的模式内部直接短路。
    this.scriptedMoments.update(
      this.state.waveIndex,
      this.state.player.maxHealth > 0 ? this.state.player.health / this.state.player.maxHealth : 0,
    );
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

  private updateCharacterPassive(delta: number): void {
    const passive = getCharacterDef(this.state.player.characterId).passive;
    if (passive.kind !== 'stationaryCalibration') return;

    const runtime = this.state.player.characterPassive;
    const wasCalibrated = runtime.calibrated;
    runtime.stationaryMs = this.player.isMoving() ? 0 : runtime.stationaryMs + delta;
    runtime.calibrated = runtime.stationaryMs >= passive.durationMs;
    if (runtime.calibrated !== wasCalibrated) {
      this.events.emit(EVENTS.characterChanged);
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
      maxHealth: boss.def.health,
      phase: phase?.phase ?? null,
      totalPhases: phase?.totalPhases ?? null,
      phaseLabel: phase?.label ?? null,
      recovery: boss.getRecoveryStatus(this.time.now),
    };
  }

  getKeybinds(): Readonly<Keybinds> {
    return this.inputManager.getBinds();
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
    pickups: number;
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
      pickups: this.pickupPool.getActive().length,
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

    this.physics.add.overlap(
      this.player,
      this.pickupPool.phaserGroup,
      (_playerObj, pickupObj) => {
        const pickup = pickupObj as Pickup;
        if (!pickup.active) return;
        if (this.applyPickup(pickup)) {
          pickup.despawn();
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
        const obstacle = obstacleObj as Obstacle;
        if (!bullet.active) return;
        SoundManager.playAt('metalImpact', bullet.x, bullet.y);
        this.spawnImpactBurst(bullet.x, bullet.y, 0xbbbbbb, 3);
        if (bullet.tryBounceFromObstacle({
          left: obstacle.body.left,
          right: obstacle.body.right,
          top: obstacle.body.top,
          bottom: obstacle.body.bottom,
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

  private updatePickups(): void {
    this.pickupPool.forEachActive((pickup) => {
      pickup.tick(this.time.now);
    });
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
      this.obstacleGroup.add(obstacle);
    }
  }

  private spawnEndlessProps(waveNumber: number): void {
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
   */
  private spawnZombie(typeId: ZombieId, at?: { x: number; y: number }): void {
    const zombie = this.zombiePool.acquire();
    this.targetMarks.delete(zombie);
    const margin = 24;
    let x = at?.x ?? 0;
    let y = at?.y ?? 0;

    // 美术检阅波：按摆位表落到网格里并钉死朝向，不走随机边生成。
    const review = at ? null : this.resolveArtReviewPlacement(typeId);
    if (review) {
      zombie.spawn(review.x, review.y, typeId);
      zombie.applyPoseLock(review.facing);
      return;
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

    zombie.spawn(x, y, typeId);
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
    if (killExplosion) {
      this.areaEffects.explode(killExplosion.x, killExplosion.y, killExplosion.effect);
    }
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
    if (!isBoss && this.state.player.health < this.state.player.maxHealth) {
      this.state.player.health = Math.min(this.state.player.maxHealth, this.state.player.health + 10);
      this.events.emit(EVENTS.healthChanged);
    }
    this.spawnDrops(zombie.def.drops, x, y);
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
  }

  private spawnDrops(drops: DropDef[], x: number, y: number): void {
    let adaptiveAmmoResolved = false;
    for (const drop of drops) {
      // P2 正式切片的武器与强化由阶段节点保证，随机掉落不能绕过冻结内容或改变节奏。
      if (this.levelId === 'level_2' && (drop.type === 'weapon' || drop.type === 'enhancement_pack')) continue;

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

      const pickup = this.pickupPool.acquire();
      const offsetX = Phaser.Math.Between(-18, 18);
      const offsetY = Phaser.Math.Between(-18, 18);
      pickup.spawn(x + offsetX, y + offsetY, resolvedDrop);
    }
  }

  private applyPickup(pickup: Pickup): boolean {
    const drop = pickup.drop;

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

    if (drop.type === 'health') {
      if (this.state.player.health >= this.state.player.maxHealth) return false;
      this.state.player.health = Math.min(this.state.player.maxHealth, this.state.player.health + (drop.amount ?? 15));
      this.events.emit(EVENTS.healthChanged);
      this.events.emit(EVENTS.pickupCollected, { title: `生命 +${drop.amount ?? 15}`, accent: 0xff7482 });
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
      }
      return added > 0;
    }

    if (drop.type === 'item') {
      if (!drop.itemId || !(drop.itemId in ITEMS)) return false;
      const added = this.itemManager.addItem(drop.itemId as ItemId, drop.amount ?? 1);
      if (added > 0) {
        this.events.emit(EVENTS.pickupCollected, { title: `${ITEMS[drop.itemId as ItemId].name} +${added}`, accent: ITEMS[drop.itemId as ItemId].color });
        SoundManager.play('pickup');
      }
      return added > 0;
    }

    if (drop.type === 'enhancement_pack') {
      return this.handleEnhancementPickup();
    }

    if (!drop.itemId || !(drop.itemId in WEAPONS)) return false;
    const weaponId = drop.itemId as WeaponId;
    const alreadyOwned = this.state.player.ownedWeapons.includes(weaponId);
    const addedToRun = this.weaponManager.pickupWeapon(weaponId, true);
    const licenseUnlocked = SaveManager.unlockWeapon(weaponId);
    this.events.emit(EVENTS.pickupCollected, {
      title: !alreadyOwned && !addedToRun && this.state.player.ownedWeapons.length >= MAX_WEAPON_LOADOUT_SIZE
        ? licenseUnlocked
          ? `${WEAPONS[weaponId].name} · 许可解锁，可在武器库编入`
          : `${WEAPONS[weaponId].name} · 编队已满，可在武器库调整`
        : licenseUnlocked
          ? `获得 ${WEAPONS[weaponId].name} · 许可解锁`
          : `获得 ${WEAPONS[weaponId].name}`,
      accent: WEAPONS[weaponId].color,
    });
    SoundManager.play('pickup');
    return true;
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

    for (const reward of rewards) {
      if (reward.type !== 'weapon' || !(reward.weaponId in WEAPONS)) continue;
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
    const resolvedAmount = resolveIncomingPlayerDamage(character, amount, source);
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
      objects: {
        zombies: zombies.length,
        bullets: this.bulletPool?.getActive().length ?? 0,
        enemyProjectiles: this.enemyProjectilePool?.getActive().length ?? 0,
        pickups: this.pickupPool?.getActive().length ?? 0,
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
    // Phaser 在 shutdown 期间可能已经销毁 Arcade World；正常唤醒与销毁清理
    // 必须允许处于不同的生命周期阶段，不能把恢复物理当成清理的前置条件。
    const world = this.physics?.world;

    if (reason !== null && !wasPaused) {
      this.frozenAtLoopTime = this.game.loop.time;
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

    this.events.emit(EVENTS.pauseChanged, this.pauseReason);
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
    this.areaEffects.shiftTimers(offset);
    this.player.shiftTimers(offset);
    // 连杀窗口同样基于 time.now：抽卡冻结不该把玩家攒起来的连杀白清掉。
    this.lastKillAt += offset;
    for (const zombie of this.getActiveZombies()) {
      zombie.shiftTimers(offset);
    }
    for (const mark of this.targetMarks.values()) {
      mark.expiresAt += offset;
    }
    this.pickupPool.forEachActive((pickup) => pickup.shiftTimers(offset));
  }

  private announceWave(waveNumber: number): void {
    const level = this.getCurrentLevel();
    const total = this.getWaveTotal();
    const isBossWave = this.mode === 'level' && !!level?.boss && waveNumber === level.waves.length + 1;

    if (isBossWave && level?.boss) {
      this.battleMusicMode = 'boss';
      SoundManager.setMusic(this.battleMusicMode);
      SoundManager.play('bossWave');
      const bossName = ZOMBIES[level.boss.type]?.name ?? 'Boss';
      this.events.emit(EVENTS.waveAnnounced, {
        title: 'BOSS WAVE',
        subtitle: `${bossName} 已进入战场`,
        accent: 0xff6f4a,
      });
      return;
    }

    this.battleMusicMode = 'battle';
    SoundManager.setMusic(this.battleMusicMode);
    SoundManager.play('wave');
    this.events.emit(EVENTS.waveAnnounced, {
      title: `WAVE ${waveNumber}${total ? ` / ${total}` : ''}`,
      subtitle: this.mode === 'endless' ? '敌群正在继续逼近' : `${this.getLevelLabel()} 推进中`,
      accent: 0xfbc02d,
    });
  }

  private spawnMuzzleFlash(feedback: WeaponFireFeedback): void {
    SoundManager.play(WEAPON_FIRE_EVENTS[this.state.player.currentWeaponId]);
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
    this.medicineManager.clearOnDeath();
    this.destroyMedicineUseProgress();
    this.targetMarks.clear();
    this.enemySpatialHash.clear();
    SoundManager.pauseMusic(false);
    this.heartbeatEvent?.remove(false);
    this.heartbeatEvent = null;
    this.areaEffects.destroy();
    // 慢动作缩放挂在 physics/anims 上，不复位会被下一局继承。
    this.slowMotion.reset();
    this.damageNumbers.destroy();
    this.corpseLayer.destroy();
  }
}
