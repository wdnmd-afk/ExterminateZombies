import { LEVELS } from '../src/config/levels.ts';
import { getWaveEnemyCount } from '../src/config/waveShape.ts';
import { EVENTS } from '../src/constants.ts';
import { CountershotProjectile } from '../src/entities/CountershotProjectile.ts';
import { EnemyProjectile } from '../src/entities/EnemyProjectile.ts';
import { Obstacle } from '../src/entities/Obstacle.ts';
import { Player } from '../src/entities/Player.ts';
import { Zombie } from '../src/entities/Zombie.ts';
import { SaveManager } from '../src/systems/SaveManager.ts';

export function mountWallFixture(game) {
  SaveManager.unlockWeapon('rpg');
  SaveManager.setWeaponLoadout(['pistol', 'rpg']);
  SaveManager.setPreferredStarterWeapon('rpg');
  SaveManager.setPreferredCharacterId('bastion');
  game.scene.getScenes(true).forEach(scene => game.scene.stop(scene.sys.settings.key));
  game.scene.start('GameScene', { mode: 'level', levelId: 'level_3', starterWeaponId: 'rpg', characterId: 'bastion' });
}

export function attachWallFixture(game, caseName) {
  const scene = game.scene.getScene('GameScene');
  const entities = () => scene.physics.world.bodies.entries.map(body => body.gameObject);
  const enemies = () => entities().filter(object => object instanceof Zombie && object.isCombatActive());
  const player = entities().find(object => object instanceof Player);
  const walls = scene.children.list.filter(object => object instanceof Obstacle && object.isBreakable);
  const records = [];
  const frames = [];
  const originalMoves = new Map();
  let witnesses = [];
  let activeWall = walls[0];
  let armed = false;
  let removedShells = 0;
  let boss = null;
  if (caseName === 'boss') {
    boss = enemies()[0];
    boss.spawn(1240, 70, 'bomber_boss');
    boss.hurt(boss.health - boss.maxHealth * 0.45);
    records.push({ name: 'boss-fixture', token: boss.getLifecycleToken(), health: boss.health, maxHealth: boss.maxHealth, phase: boss.getBossPhaseStatus() });
  }
  const control = () => {
    for (const object of entities()) {
      if (object.active && (object instanceof CountershotProjectile || object instanceof EnemyProjectile)) {
        if (object instanceof CountershotProjectile) removedShells++;
        object.despawn();
      }
    }
    for (const enemy of enemies()) {
      if (!originalMoves.has(enemy)) originalMoves.set(enemy, enemy.body.moves);
      enemy.body.moves = false;
      const witness = witnesses.find(entry => entry.enemy === enemy && entry.token === enemy.getLifecycleToken());
      if (enemy === boss) enemy.body.reset(armed ? activeWall.x + 230 : player.x < 640 ? 1240 : 40, armed ? activeWall.y : 70);
      else if (witness) enemy.body.reset(activeWall.x, activeWall.y + witness.offset);
      else enemy.body.reset(60, 670);
    }
  };
  const observe = () => {
    const diagnostics = scene.getCombatDiagnostics();
    frames.push({ frame: game.loop.frame, time: scene.time.now, walls: scene.getBreakableObstacleSnapshots(), player: diagnostics.player, kills: scene.getState().stats.kills, objects: diagnostics.objects, boss: scene.getBossStatus(), redCircles: scene.children.list.filter(object => object.type === 'Arc' && object.visible && object.fillColor === 0xe75b45 && object.radius === 100).map(object => ({ x: object.x, y: object.y, radius: object.radius })), witnesses: witnesses.map(entry => ({ token: entry.token, currentToken: entry.enemy.getLifecycleToken(), active: entry.enemy.isCombatActive() && entry.enemy.getLifecycleToken() === entry.token, health: entry.enemy.health, originalHealth: entry.health })) });
  };
  const alert = payload => records.push({ name: 'alert', payload, frame: game.loop.frame, time: scene.time.now });
  scene.events.on('preupdate', control); scene.events.on('postupdate', observe); scene.events.on(EVENTS.combatAlert, alert);
  scene.events.once('shutdown', () => {
    scene.events.off('preupdate', control); scene.events.off('postupdate', observe); scene.events.off(EVENTS.combatAlert, alert);
    for (const [enemy, moves] of originalMoves) if (enemy.body) enemy.body.moves = moves;
  });
  window.__WALL_FIXTURE__ = {
    prepare: index => {
      armed = false;
      activeWall = walls[index];
      const candidates = enemies().filter(enemy => enemy !== boss && enemy.def.id === 'walker').slice(0, 2);
      if (candidates.length !== 2) throw new Error('Need two natural walkers for collapse witnesses');
      witnesses = candidates.map((enemy, ordinal) => ({ enemy, token: enemy.getLifecycleToken(), health: enemy.health, offset: ordinal ? 92 : -92 }));
      player.teleportTo(activeWall.x - 80, activeWall.y);
      control();
      return { wall: activeWall.getBreakableSnapshot(), x: activeWall.x, y: activeWall.y, left: Math.min(...activeWall.collisionTiles.map(tile => tile.body.left)), right: Math.max(...activeWall.collisionTiles.map(tile => tile.body.right)), radius: player.body.radius, kills: scene.getState().stats.kills };
    },
    arm: () => { armed = true; player.teleportTo(activeWall.x - (caseName === 'boss' ? 64 : 240), activeWall.y); return { x: activeWall.x, y: activeWall.y }; },
    disarm: () => { armed = false; },
    crossing: () => player.teleportTo(activeWall.x - 80, activeWall.y),
    report: () => ({ caseName, records, frames, current: frames.at(-1), removedShells, level: LEVELS.find(level => level.id === 'level_3'), stageCounts: LEVELS.find(level => level.id === 'level_3').waves.map(getWaveEnemyCount) }),
  };
  control();
}
