import Phaser from 'phaser';
import type { ItemId } from '../config/items';
import { ITEMS } from '../config/items';
import { LEVELS } from '../config/levels';
import { WEAPONS, type WeaponId } from '../config/weapons';
import { ZOMBIES, isBossZombie, type ZombieId } from '../config/zombies';
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
import { SAVE_KEYS, SaveManager } from '../systems/SaveManager';
import { WaveManager } from '../systems/WaveManager';
import {
  WeaponManager,
  type WeaponFireFeedback,
  type WeaponReloadStatus,
} from '../systems/WeaponManager';
import { SoundManager } from '../systems/SoundManager';
import { EnemyAbilitySystem } from '../systems/EnemyAbilitySystem';
import { EnhancementManager } from '../systems/EnhancementManager';
import { CARD_SELECTED_EVENT } from './CardSelectionScene';
import { ENHANCEMENTS } from '../config/enhancements';
import { WEAPON_FIRE_EVENTS } from '../config/audio';
import { resolveDropChance } from '../config/testing';
import { ObjectPool } from '../utils/ObjectPool';
import { SpatialHash } from '../utils/SpatialHash';
import { distanceSq } from '../utils/math';
import type { DropDef } from '../config/types';
import type { Keybinds } from '../config/keybinds';
import {
  ENDLESS_PROP_MIN_DISTANCE,
  getOldestEndlessProp,
} from '../systems/EndlessModePolicy';

interface GameSceneData {
  mode?: GameMode;
  levelId?: string | null;
}

export interface BossStatus {
  name: string;
  health: number;
  maxHealth: number;
  phase: number | null;
  totalPhases: number | null;
  phaseLabel: string | null;
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
  private state!: GameState;

  private inputManager!: InputManager;
  private player!: Player;
  private bulletPool!: ObjectPool<Bullet>;
  private enemyProjectilePool!: ObjectPool<EnemyProjectile>;
  private zombiePool!: ObjectPool<Zombie>;
  private pickupPool!: ObjectPool<Pickup>;
  private weaponManager!: WeaponManager;
  private itemManager!: ItemManager;
  private areaEffects!: AreaEffectFactory;
  private enemyAbilitySystem!: EnemyAbilitySystem;
  private waveManager!: WaveManager;

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
  /** 暂停菜单键。固定 ESC，不走 InputManager，因此不受重绑定影响。 */
  private menuKey: Phaser.Input.Keyboard.Key | null = null;

  constructor() {
    super(SCENES.game);
  }

  init(data: GameSceneData): void {
    this.mode = data.mode ?? 'level';
    if (this.mode === 'endless') {
      this.levelId = null;
      return;
    }
    const requestedLevel = LEVELS.find((level) => level.id === data.levelId);
    this.levelId = requestedLevel?.id ?? LEVELS[0]?.id ?? 'level_1';
  }

  create(): void {
    configureHighResolutionScene(this);
    this.gameEnded = false;
    this.pauseReason = null;
    this.frozenAtLoopTime = 0;
    this.state = createInitialState(this.mode, this.levelId);
    this.props = [];
    this.enemySpatialHash.clear();
    SoundManager.setMusic('battle');
    SoundManager.pauseMusic(false);

    renderBattlefield(this, this.mode, this.levelId);
    this.physics.world.setBounds(0, 0, GAME_WIDTH, GAME_HEIGHT);
    this.cameras.main.setBounds(0, 0, GAME_WIDTH, GAME_HEIGHT);

    this.inputManager = new InputManager(this);
    this.menuKey = this.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.ESC, false) ?? null;
    this.player = new Player(this, GAME_WIDTH / 2, GAME_HEIGHT / 2);
    this.propGroup = this.add.group();
    this.obstacleGroup = this.physics.add.staticGroup();

    this.bulletPool = new ObjectPool(this, (scene) => new Bullet(scene), 36);
    this.enemyProjectilePool = new ObjectPool(this, (scene) => new EnemyProjectile(scene), 20);
    this.zombiePool = new ObjectPool(this, (scene) => new Zombie(scene), 32);
    this.pickupPool = new ObjectPool(this, (scene) => new Pickup(scene), 16);
    this.weaponManager = new WeaponManager(this, this.state, this.bulletPool);

    this.areaEffects = new AreaEffectFactory({
      scene: this,
      player: this.player,
      getZombies: () => this.getActiveZombies(),
      getProps: () => this.getActiveProps(),
      damageZombie: (zombie, amount) => this.damageZombie(zombie, amount),
      damagePlayer: (amount) => this.damagePlayer(amount),
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
      spawnDeployable: (itemId, x, y) => this.spawnProp(itemId, x, y),
      detonateProp: (prop) => this.triggerProp(prop),
      getProps: () => this.getActiveProps(),
      getZombies: () => this.getActiveZombies(),
    });

    this.waveManager = new WaveManager({
      scene: this,
      mode: this.mode,
      levelId: this.levelId,
      spawnZombie: (typeId) => this.spawnZombie(typeId),
      hasAliveEnemies: () => this.getActiveZombies().length > 0,
      onWaveStarted: (waveNumber) => {
        this.state.waveIndex = waveNumber;
        this.events.emit(EVENTS.waveChanged);
        this.announceWave(waveNumber);
        if (this.mode === 'endless') {
          this.spawnEndlessProps(waveNumber);
        }
      },
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
  }

  update(_time: number, delta: number): void {
    if (this.menuKey && Phaser.Input.Keyboard.JustDown(this.menuKey) && !this.gameEnded) {
      this.toggleMenu();
    }
    if (this.gameEnded) return;
    if (this.pauseReason !== null) return;

    this.player.update(this.inputManager);
    SoundManager.setListenerPosition(this.player.x, this.player.y);
    this.handleWeaponInput();
    this.player.setWeaponVisual(this.state.player.currentWeaponId);
    const fireFeedback = this.weaponManager.update(
      this.time.now,
      this.player,
      this.inputManager.isDown('fire'),
      this.inputManager.justPressed('fire'),
    );
    if (fireFeedback) {
      this.player.playFireFeedback(fireFeedback.color);
      this.spawnMuzzleFlash(fireFeedback);
    }

    this.itemManager.update();
    this.areaEffects.update(this.time.now);
    this.updateBullets();
    this.updateEnemyProjectiles();
    this.updatePickups();
    this.updateZombies(delta);
    this.waveManager.update(this.time.now);
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

  /** ESC 只负责菜单本身；抽卡这类其它暂停源占用时不介入，避免把卡片界面留在半冻结状态。 */
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
    this.scene.wake(SCENES.hud);
    this.scene.bringToTop(SCENES.hud);
    SoundManager.setMusic('battle');
    this.setPause(null);
    // 放在解除冻结之后：HUD 的换弹提示要读平移过的时间点才是准的。
    this.emitStateChanged();
  }

  isWeaponReloading(): boolean {
    return this.weaponManager.isReloading;
  }

  getWeaponReloadStatus(): WeaponReloadStatus | null {
    return this.weaponManager.getReloadStatus();
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
    };
  }

  getKeybinds(): Readonly<Keybinds> {
    return this.inputManager.getBinds();
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
        SoundManager.playAt('impact', zombie.x, zombie.y);
        this.spawnImpactBurst(zombie.x, zombie.y, 0xffffff, bullet.penetration > 0 ? 3 : 5);
        this.damageZombie(zombie, bullet.damage);
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
        this.damagePlayer(projectile.damage);
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
          this.damagePlayer(damage);
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
      (bulletObj) => {
        const bullet = bulletObj as Bullet;
        if (!bullet.active) return;
        SoundManager.playAt('metalImpact', bullet.x, bullet.y);
        this.spawnImpactBurst(bullet.x, bullet.y, 0xbbbbbb, 3);
        this.finishBullet(bullet, bullet.x, bullet.y);
      },
      undefined,
      this,
    );
  }

  private handleWeaponInput(): void {
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
  }

  private updateBullets(): void {
    this.bulletPool.forEachActive((bullet) => {
      if (bullet.tick()) this.finishBullet(bullet, bullet.x, bullet.y);
    });
  }

  private finishBullet(bullet: Bullet, x: number, y: number): void {
    if (!bullet.active) return;
    const impactEffect = bullet.consumeImpactEffect();
    bullet.despawn();
    if (impactEffect) this.areaEffects.explode(x, y, impactEffect);
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

  private spawnProp(itemId: ItemId, x: number, y: number): Prop {
    const prop = this.props.find((entry) => !entry.active) ?? this.createProp();
    prop.spawn(x, y, itemId);
    return prop;
  }

  private createProp(): Prop {
    const prop = new Prop(this);
    this.props.push(prop);
    this.propGroup.add(prop);
    return prop;
  }

  private spawnZombie(typeId: ZombieId): void {
    const zombie = this.zombiePool.acquire();
    const margin = 24;
    const side = Phaser.Math.Between(0, 3);
    let x = 0;
    let y = 0;

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

  private damageZombie(zombie: Zombie, amount: number): void {
    if (!zombie.active) return;
    const dead = zombie.hurt(amount);
    const phaseTransition = zombie.consumeBossPhaseTransition();
    if (phaseTransition) this.handleBossPhaseTransition(zombie, phaseTransition);
    if (dead) {
      this.handleZombieDeath(zombie);
    }
  }

  private handleZombieDeath(zombie: Zombie): void {
    if (!zombie.active) return;

    if (isBossZombie(zombie.def.id)) {
      const started = zombie.beginDeathAnimation(() => this.finalizeZombieDeath(zombie));
      if (!started) return;
      SoundManager.playAt('bossDeath', zombie.x, zombie.y);
      this.cameras.main.shake(420, 0.005);
      this.spawnBossDeathLeadIn(zombie.x, zombie.y, zombie.def.color);
      return;
    }

    this.finalizeZombieDeath(zombie);
  }

  private finalizeZombieDeath(zombie: Zombie): void {
    if (!zombie.active) return;

    const { x, y } = zombie;
    const explosion = zombie.def.explodeOnDeath;
    const isBoss = isBossZombie(zombie.def.id);
    this.state.score += zombie.def.scoreValue;
    this.spawnDrops(zombie.def.drops, x, y);
    this.spawnDeathBurst(x, y, zombie.def.color, isBoss);
    if (!isBoss) SoundManager.playAt('enemyDeath', x, y);
    zombie.despawn();
    this.events.emit(EVENTS.scoreChanged);

    if (explosion) {
      this.areaEffects.explode(x, y, explosion);
    }
  }

  private handleBossPhaseTransition(zombie: Zombie, transition: BossPhaseTransition): void {
    SoundManager.play('bossPhase');
    this.cameras.main.shake(280, 0.0042);
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
    for (const drop of drops) {
      if (Math.random() > resolveDropChance(drop)) continue;

      const pickup = this.pickupPool.acquire();
      const offsetX = Phaser.Math.Between(-18, 18);
      const offsetY = Phaser.Math.Between(-18, 18);
      pickup.spawn(x + offsetX, y + offsetY, drop);
    }
  }

  private applyPickup(pickup: Pickup): boolean {
    const drop = pickup.drop;

    if (drop.type === 'ammo') {
      if (!drop.ammoType) return false;
      this.weaponManager.addAmmo(drop.ammoType, drop.amount ?? 0);
      const ammoLabel = drop.ammoType === 'heavy'
        ? '重型弹药'
        : drop.ammoType === 'shell'
          ? '霰弹'
          : drop.ammoType === 'explosive'
            ? '爆炸弹药'
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
    this.weaponManager.pickupWeapon(drop.itemId as WeaponId, true);
    this.events.emit(EVENTS.pickupCollected, { title: `获得 ${WEAPONS[drop.itemId as WeaponId].name}`, accent: WEAPONS[drop.itemId as WeaponId].color });
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

    this.setPause('cardSelection');
    this.scene.launch(SCENES.cardSelection, {
      cards: drawnCards,
      // 卡面要按玩家当前的实际数值算涨幅，所以把已激活强化一起传过去。
      activeEnhancements: [...this.state.player.activeEnhancements],
    });
    this.scene.bringToTop(SCENES.cardSelection);
    return true;
  }

  private damagePlayer(amount: number): void {
    if (this.gameEnded) return;
    if (!this.player.takeDamage(amount, this.time.now)) return;

    this.state.player.health = Math.max(0, this.state.player.health - amount);
    SoundManager.play('hurt');
    this.events.emit(EVENTS.healthChanged);
    this.cameras.main.shake(Math.min(130, 50 + amount * 2), 0.0022);

    if (this.state.player.health <= 0) {
      this.handleGameOver();
    }
  }

  private triggerProp(prop: Prop, chainSet = new Set<Prop>()): void {
    if (!prop.markTriggered()) return;

    chainSet.add(prop);
    const { x, y } = prop;
    const effect = prop.def.effect;
    prop.despawn();
    this.areaEffects.explode(x, y, effect, chainSet);
  }

  private handleGameOver(): void {
    if (this.gameEnded) return;
    if (this.pauseReason !== null) this.setPause(null);
    this.gameEnded = true;
    SoundManager.play('gameOver');
    this.events.emit(EVENTS.gameOver);

    this.recordEndlessBest();

    this.scene.start(SCENES.gameOver, {
      mode: this.mode,
      levelId: this.levelId,
      score: this.state.score,
      wave: this.state.waveIndex,
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
    this.gameEnded = true;
    SoundManager.play('levelClear');

    const currentIndex = LEVELS.findIndex((entry) => entry.id === this.levelId);
    const nextLevelId = currentIndex >= 0 ? LEVELS[currentIndex + 1]?.id ?? null : null;
    const unlocked = SaveManager.load<string[]>(SAVE_KEYS.unlockedLevels, [LEVELS[0]?.id ?? 'level_1']);
    if (nextLevelId && !unlocked.includes(nextLevelId)) {
      unlocked.push(nextLevelId);
      SaveManager.save(SAVE_KEYS.unlockedLevels, unlocked);
    }

    this.events.emit(EVENTS.levelClear);
    this.scene.start(SCENES.levelClear, {
      levelId: this.levelId,
      nextLevelId,
      score: this.state.score,
      wave: this.state.waveIndex,
    });
  }

  private emitStateChanged(): void {
    this.events.emit(EVENTS.healthChanged);
    this.events.emit(EVENTS.ammoChanged);
    this.events.emit(EVENTS.weaponChanged);
    this.events.emit(EVENTS.itemChanged);
    this.events.emit(EVENTS.scoreChanged);
    this.events.emit(EVENTS.waveChanged);
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

  private setPause(reason: PauseReason | null): void {
    if (this.pauseReason === reason) return;
    const wasPaused = this.pauseReason !== null;
    this.pauseReason = reason;

    if (reason !== null && !wasPaused) {
      this.frozenAtLoopTime = this.game.loop.time;
      this.physics.world.pause();
      this.time.timeScale = 0;
      this.tweens.pauseAll();
      SoundManager.pauseMusic(true);
    } else if (reason === null) {
      this.physics.world.resume();
      this.time.timeScale = 1;
      this.tweens.resumeAll();
      SoundManager.pauseMusic(false);
      this.shiftBattleTimers(this.game.loop.time - this.frozenAtLoopTime);
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
    for (const zombie of this.getActiveZombies()) {
      zombie.shiftTimers(offset);
    }
    this.pickupPool.forEachActive((pickup) => pickup.shiftTimers(offset));
  }

  private announceWave(waveNumber: number): void {
    const level = this.getCurrentLevel();
    const total = this.getWaveTotal();
    const isBossWave = this.mode === 'level' && !!level?.boss && waveNumber === level.waves.length + 1;

    if (isBossWave && level?.boss) {
      SoundManager.play('bossWave');
      const bossName = ZOMBIES[level.boss.type]?.name ?? 'Boss';
      this.events.emit(EVENTS.waveAnnounced, {
        title: 'BOSS WAVE',
        subtitle: `${bossName} 已进入战场`,
        accent: 0xff6f4a,
      });
      return;
    }

    SoundManager.play('wave');
    this.events.emit(EVENTS.waveAnnounced, {
      title: `WAVE ${waveNumber}${total ? ` / ${total}` : ''}`,
      subtitle: this.mode === 'endless' ? '敌群正在继续逼近' : `${this.getLevelLabel()} 推进中`,
      accent: 0xfbc02d,
    });
  }

  private spawnMuzzleFlash(feedback: WeaponFireFeedback): void {
    SoundManager.play(WEAPON_FIRE_EVENTS[this.state.player.currentWeaponId]);
    const flash = this.add.circle(feedback.x, feedback.y, Math.max(8, 6 + feedback.pellets), feedback.color, 0.78);
    flash.setDepth(DEPTH.effect);
    const streak = this.add.rectangle(feedback.x, feedback.y, 22 + feedback.pellets * 3, 4, feedback.color, 0.92);
    streak.setDepth(DEPTH.effect);
    streak.setRotation(feedback.angle);
    this.tweens.add({
      targets: [flash, streak],
      alpha: 0,
      scaleX: 1.8,
      scaleY: 0.2,
      duration: 90,
      onComplete: () => {
        flash.destroy();
        streak.destroy();
      },
    });
  }

  private spawnImpactBurst(x: number, y: number, color: number, count: number): void {
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
    if (this.pauseReason !== null) {
      this.setPause(null);
    }
    this.events.off(Phaser.Scenes.Events.WAKE, this.handleWake, this);
    this.events.off(CARD_SELECTED_EVENT, this.handleCardSelected, this);
    // 挂起过的战局里 HUD 处于 sleeping，`isActive` 查不到，必须一并判断否则会漏关。
    if (this.scene.isActive(SCENES.hud) || this.scene.isSleeping(SCENES.hud)) {
      this.scene.stop(SCENES.hud);
    }
    this.weaponManager.destroy();
    this.enemySpatialHash.clear();
    SoundManager.pauseMusic(false);
    this.areaEffects.destroy();
  }
}
