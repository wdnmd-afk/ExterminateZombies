import Phaser from 'phaser';
import { CHARACTERS } from '../src/config/characters.ts';
import { ZOMBIES } from '../src/config/zombies.ts';
import { WEAPONS } from '../src/config/weapons.ts';
import { EVENTS, GAME_HEIGHT, GAME_WIDTH } from '../src/constants.ts';
import { Bullet } from '../src/entities/Bullet.ts';
import { CountershotProjectile } from '../src/entities/CountershotProjectile.ts';
import { Player } from '../src/entities/Player.ts';
import { Zombie } from '../src/entities/Zombie.ts';
import { AreaEffectFactory } from '../src/systems/AreaEffectFactory.ts';
import { CountershotSystem } from '../src/systems/CountershotSystem.ts';
import { configureHighResolutionScene } from '../src/systems/DisplayManager.ts';

export class BoundaryAcceptanceScene extends Phaser.Scene {
  constructor() { super('BoundaryAcceptanceScene'); }

  create({ caseName = 'range' } = {}) {
    configureHighResolutionScene(this);
    this.caseName = caseName;
    this.records = [];
    this.samples = [];
    this.expirations = [];
    this.health = 105;
    this.ready = true;
    this.fired = false;
    this.reflectedAt = null;
    this.shot = null;
    this.identity = 1;
    this.add.rectangle(640, 360, 1280, 720, 0x151d25);
    this.add.text(32, 28, `反打隔离验收 / ${caseName}`, { fontSize: '26px', color: '#fbc02d' });
    this.add.text(32, 68, '真实物理与生产实体；绕过自然刷怪、AI、配装及武器经济', { fontSize: '16px', color: '#f4eedd' });
    this.statusText = this.add.text(32, 650, '', { fontSize: '17px', color: '#b4f4ff' });
    this.bullets = this.add.group();
    this.zombies = this.add.group();
    this.obstacles = this.physics.add.staticGroup();
    this.player = new Player(this, 640, 540, CHARACTERS.watcher);
    this.source = new Zombie(this);
    this.source.spawn(['range', 'reuse'].includes(caseName) ? 1000 : caseName === 'bounds' ? 120 : 500, 360, 'bomber_boss');
    this.zombies.add(this.source);
    this.ability = ZOMBIES.bomber_boss.ability;
    this.area = new AreaEffectFactory({
      scene: this, player: this.player,
      getZombies: () => this.zombies.getChildren().filter(zombie => zombie.isCombatActive()),
      getProps: () => [],
      damageZombie: (zombie, amount, impact) => {
        const multiplier = zombie.getIncomingDamageMultiplier(this.time.now);
        this.record('zombie-damage', { token: zombie.getLifecycleToken(), amount, multiplier, impact });
        if (zombie.hurt(amount * multiplier)) zombie.despawn();
      },
      damagePlayer: (amount, source) => {
        this.record('player-damage', { amount, source });
        if (this.player.takeDamage(amount, this.time.now)) this.health -= amount;
      },
      detonateProp: () => {},
      damageObstacles: (x, y, radius, amount) => this.record('structure-blast', { x, y, radius, amount }),
    });
    this.system = new CountershotSystem({ scene: this, player: this.player, bullets: this.bullets, zombies: this.zombies, obstacles: this.obstacles, areaEffects: this.area, isRunning: () => true });
    const onCombatAlert = payload => {
      if (payload.key !== 'countershot-reflected') return;
      this.reflectedAt = { x: this.shot.x, y: this.shot.y };
      this.record('reflected', { payload, projectile: this.projectileSnapshot(), player: { x: this.player.x, y: this.player.y, health: this.health }, gap: Phaser.Math.Distance.Between(this.player.x, this.player.y, this.shot.x, this.shot.y) });
      if (['range', 'bounds', 'reuse'].includes(caseName)) {
        const token = this.source.getLifecycleToken();
        this.source.despawn();
        if (caseName === 'reuse') this.source.spawn(840, 360, 'bomber_boss');
        this.record('source-retired', { token, replacementToken: this.source.getLifecycleToken(), currentSource: this.shot.getCurrentSource() !== null });
      }
    };
    this.events.on(EVENTS.combatAlert, onCombatAlert);
    const onPointer = () => this.trigger();
    this.input.on('pointerdown', onPointer);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.ready = false;
      this.events.off(EVENTS.combatAlert, onCombatAlert);
      this.input.off('pointerdown', onPointer);
      this.system.destroy();
      this.area.destroy();
    });
    if (caseName === 'thin-wall') {
      const wall = this.add.rectangle(620, 360, 5, 260, 0x947659);
      this.obstacles.add(wall);
      this.record('wall', { width: wall.body.width, height: wall.body.height, center: { x: wall.body.center.x, y: wall.body.center.y } });
    }
    if (caseName === 'red-circle') {
      this.player.teleportTo(680, 360);
      this.area.scheduleEnemyBlast(680, 360, 82, 30, 2400, () => true);
    } else {
      this.system.fire(this.source, ['range', 'reuse'].includes(caseName) ? 0 : 1270, 360, this.ability);
      this.shot = this.physics.world.bodies.entries.map(body => body.gameObject).find(object => object instanceof CountershotProjectile && object.active);
      this.launchAt = { x: this.shot.x, y: this.shot.y };
      this.launchToken = this.source.getLifecycleToken();
      if (['close', 'pellets', 'coincident'].includes(caseName)) {
        this.player.teleportTo(535, 360);
        this.physics.pause();
      }
      this.record('launched', this.projectileSnapshot());
    }
    window.__BOUNDARY__ = this;
  }

  record(name, value) { this.records.push({ name, frame: this.game.loop.frame, at: this.time.now, value }); }

  projectileSnapshot() {
    if (!this.shot) return null;
    return { identity: this.identity, active: this.shot.active, x: this.shot.x, y: this.shot.y, side: this.shot.flight.side, expired: this.shot.hasExpired(), sourceCurrent: this.shot.getCurrentSource() !== null, velocity: { x: this.shot.body.velocity.x, y: this.shot.body.velocity.y } };
  }

  trigger() {
    if (this.fired) return;
    this.fired = true;
    this.record('pointer-trigger', { caseName: this.caseName });
    if (this.caseName === 'coincident') {
      this.record('coincident-before', { gap: Phaser.Math.Distance.Between(this.source.x, this.source.y, this.shot.x, this.shot.y), velocity: this.projectileSnapshot().velocity });
      const reflected = this.shot.reflect();
      this.reflectedAt = { x: this.shot.x, y: this.shot.y };
      this.record('coincident-after', { reflected, projectile: this.projectileSnapshot() });
      this.source.despawn();
      this.physics.resume();
      return;
    }
    const count = this.caseName === 'pellets' ? 8 : 1;
    const target = this.shot ?? { x: 680, y: 360 };
    const weapon = WEAPONS.rpg;
    for (let index = 0; index < count; index++) {
      const bullet = new Bullet(this);
      this.bullets.add(bullet);
      bullet.fire({ x: target.x + 24, y: target.y, angle: Math.PI, speed: 700, range: 1280, damage: 1, penetration: 0, radius: 5, color: 0xffd54f, headshotChance: 0, headshotMultiplier: 1, impactEffect: weapon.impactEffect });
    }
    this.record('bullet-fixture', { count, bypass: 'Directly spawn Bullet near shell; real overlap and explosive impact consumption, not muzzle/economy coverage' });
    this.physics.resume();
  }

  update(now) {
    if (!this.ready) return;
    const before = this.projectileSnapshot();
    if (before?.active && before.expired) {
      const origin = before.side === 'returned' ? this.reflectedAt : this.launchAt;
      const range = before.side === 'returned' ? this.ability.returnRange : this.ability.projectileRange;
      const traveled = Phaser.Math.Distance.Between(origin.x, origin.y, before.x, before.y);
      this.expirations.push({ frame: this.game.loop.frame, ...before, origin, traveled, range, rangeExceeded: traveled >= range, outside: before.x < -24 || before.x > GAME_WIDTH + 24 || before.y < -24 || before.y > GAME_HEIGHT + 24 });
    }
    this.system.update();
    this.area.update(now);
    const after = this.projectileSnapshot();
    this.samples.push({ frame: this.game.loop.frame, time: now, projectile: after, health: this.health, effects: this.area.getActiveCounts(), activeBullets: this.bullets.getChildren().filter(bullet => bullet.active).length });
    if (this.samples.length > 1500) this.samples.shift();
    this.statusText.setText(`HP ${this.health} / ${after?.side ?? '无弹体'} / 反打 ${this.records.filter(event => event.name === 'reflected').length}`);
  }

  report() {
    return { caseName: this.caseName, health: this.health, projectile: this.projectileSnapshot(), ability: this.ability, launchAt: this.launchAt, reflectedAt: this.reflectedAt, records: this.records, samples: this.samples, expirations: this.expirations, source: { active: this.source.isCombatActive(), token: this.source.getLifecycleToken(), health: this.source.health, multiplier: this.source.getIncomingDamageMultiplier(this.time.now) }, effects: this.area.getActiveCounts(), missingTextures: this.children.list.filter(object => object.visible && object.texture?.key === '__MISSING').length };
  }
}

export function mountBoundaryFixture(game, caseName) {
  game.scene.getScenes(true).forEach(scene => game.scene.stop(scene.sys.settings.key));
  if (!game.scene.keys.BoundaryAcceptanceScene) game.scene.add('BoundaryAcceptanceScene', BoundaryAcceptanceScene);
  game.scene.start('BoundaryAcceptanceScene', { caseName });
}
