import { EVENTS } from '../src/constants.ts';
import { CountershotProjectile } from '../src/entities/CountershotProjectile.ts';
import { EnemyProjectile } from '../src/entities/EnemyProjectile.ts';
import { Player } from '../src/entities/Player.ts';
import { Zombie } from '../src/entities/Zombie.ts';

export function attachSummonFixture(game) {
  const scene = game.scene.getScene('GameScene');
  const entities = () => scene.physics.world.bodies.entries.map(body => body.gameObject);
  const enemies = () => entities().filter(object => object instanceof Zombie && object.isCombatActive());
  const original = new Set(enemies());
  const boss = enemies()[0];
  boss.spawn(640, 180, 'matriarch_boss');
  boss.hurt(boss.health - boss.maxHealth * 0.28);
  const player = entities().find(object => object instanceof Player);
  player.teleportTo(640, 500);
  const minions = new Map();
  const moves = new Map();
  const records = [];
  const frames = [];
  let selected = null;
  const living = () => [...minions].filter(([enemy, token]) => enemy.isCombatActive() && enemy.getLifecycleToken() === token);
  const control = () => {
    for (const entity of entities()) if (entity.active && (entity instanceof EnemyProjectile || entity instanceof CountershotProjectile)) entity.despawn();
    for (const enemy of enemies()) {
      if (!moves.has(enemy)) moves.set(enemy, enemy.body.moves);
      enemy.body.moves = false;
      if (enemy === boss) enemy.body.reset(640, 180);
      else if (selected?.enemy === enemy && selected.token === enemy.getLifecycleToken()) enemy.body.reset(640, 350);
      else enemy.body.reset(60, 670);
    }
  };
  const observe = () => {
    for (const enemy of enemies()) {
      if (original.has(enemy) || minions.get(enemy) === enemy.getLifecycleToken()) continue;
      minions.set(enemy, enemy.getLifecycleToken());
      records.push({ name: 'spawn', id: enemy.def.id, token: enemy.getLifecycleToken(), x: enemy.x, y: enemy.y, frame: game.loop.frame, time: scene.time.now });
    }
    frames.push({ frame: game.loop.frame, time: scene.time.now, alive: living().length, total: records.filter(entry => entry.name === 'spawn').length, kills: scene.getState().stats.kills, wave: scene.getCombatDiagnostics().wave, phase: boss.getBossPhaseStatus() });
  };
  const alert = payload => records.push({ name: 'alert', payload, frame: game.loop.frame, time: scene.time.now });
  scene.events.on('preupdate', control); scene.events.on('postupdate', observe); scene.events.on(EVENTS.combatAlert, alert);
  scene.events.once('shutdown', () => {
    scene.events.off('preupdate', control); scene.events.off('postupdate', observe); scene.events.off(EVENTS.combatAlert, alert);
    for (const [enemy, value] of moves) if (enemy.body) enemy.body.moves = value;
  });
  window.__SUMMON_FIXTURE__ = {
    prepareKill: () => {
      const entry = living()[0];
      if (!entry) throw new Error('No summoned minion remains');
      const [enemy, token] = entry;
      selected = { enemy, token };
      const before = { id: enemy.def.id, token, health: enemy.health };
      if (enemy.health > 1) enemy.hurt(enemy.health - 1);
      enemy.body.reset(640, 350);
      records.push({ name: 'weaken-for-real-shot', before, frame: game.loop.frame });
      return { x: enemy.x, y: enemy.y, kills: scene.getState().stats.kills };
    },
    report: () => ({ records, frames, current: frames.at(-1), phase: boss.getBossPhaseStatus(), bossToken: boss.getLifecycleToken(), summon: boss.def.bossPhases.flatMap(phase => phase.unlockAbilities).find(ability => ability.kind === 'summon') }),
  };
  control();
}
