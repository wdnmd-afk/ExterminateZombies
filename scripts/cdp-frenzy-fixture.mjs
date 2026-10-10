import { FRENZY_TARGETS } from '../src/config/frenzy.ts';
import { EVENTS } from '../src/constants.ts';
import { Bullet } from '../src/entities/Bullet.ts';
import { Player } from '../src/entities/Player.ts';
import { Zombie } from '../src/entities/Zombie.ts';

export function attachFrenzyFixture(game) {
  const scene = game.scene.getScene('GameScene');
  const entities = () => scene.physics.world.bodies.entries.map(body => body.gameObject);
  const enemies = () => entities().filter(object => object instanceof Zombie && object.isCombatActive());
  const player = entities().find(object => object instanceof Player);
  const targets = Object.fromEntries(FRENZY_TARGETS.map(definition => {
    const matches = enemies().filter(enemy => enemy.def.id === definition.zombieId && Math.hypot(enemy.x - definition.x, enemy.y - definition.y) < 80);
    if (matches.length !== 1) throw new Error(`Expected one natural ${definition.id} target, found ${matches.length}`);
    return [definition.id, { zombie: matches[0], token: matches[0].getLifecycleToken() }];
  }));
  scene.getState().frenzy.recordEligible = false;
  const records = [];
  const frames = [];
  const originalMoves = new Map();
  const bosses = new Map();
  let selected = null;
  const record = (name, data) => records.push({ name, data, frame: game.loop.frame, time: scene.time.now });
  const control = () => {
    for (const enemy of enemies()) {
      if (!originalMoves.has(enemy)) originalMoves.set(enemy, enemy.body.moves);
      enemy.body.moves = false;
      const chosen = selected?.zombie === enemy && selected.token === enemy.getLifecycleToken();
      enemy.body.reset(chosen ? 640 : 70, chosen ? 180 : 670);
      if (enemy.def.id === 'tank_boss' && bosses.get(enemy) !== enemy.getLifecycleToken()) {
        bosses.set(enemy, enemy.getLifecycleToken());
        record('boss-spawn', { token: enemy.getLifecycleToken(), health: enemy.health });
      }
    }
  };
  const observe = () => {
    const state = scene.getState();
    const bullets = entities().filter(object => object instanceof Bullet && object.active).map(object => ({ damage: object.damage, x: object.x, y: object.y }));
    frames.push({ frame: game.loop.frame, elapsedMs: state.frenzy.elapsedMs, phase: state.frenzy.phase, weapon: state.player.currentWeaponId, magazines: { ...state.player.ammoInMag }, reserve: { ...state.player.ammoReserve }, reloading: scene.isWeaponReloading(), bullets });
    if (frames.length > 7200) frames.shift();
  };
  const pickup = payload => record('pickup', payload);
  const announce = payload => record('announce', payload);
  scene.events.on('preupdate', control);
  scene.events.on('postupdate', observe);
  scene.events.on(EVENTS.pickupCollected, pickup);
  scene.events.on(EVENTS.waveAnnounced, announce);
  scene.events.once('shutdown', () => {
    scene.events.off('preupdate', control);
    scene.events.off('postupdate', observe);
    scene.events.off(EVENTS.pickupCollected, pickup);
    scene.events.off(EVENTS.waveAnnounced, announce);
    for (const [enemy, moves] of originalMoves) if (enemy.body) enemy.body.moves = moves;
  });
  const prepare = target => {
    if (!target || !target.zombie.isCombatActive() || target.zombie.getLifecycleToken() !== target.token) throw new Error('Target is no longer the original natural entity');
    selected = target;
    const enemy = target.zombie;
    const before = { id: enemy.def.id, token: enemy.getLifecycleToken(), health: enemy.health, x: enemy.x, y: enemy.y };
    if (enemy.health > 1) enemy.hurt(enemy.health - 1);
    enemy.body.reset(640, 180);
    player.teleportTo(640, 430);
    record('target-fixture', { before, after: { health: enemy.health, x: enemy.x, y: enemy.y }, bypass: '自然实体移位/固定且削至 1 HP；最后伤害必须来自真实玩家输入。' });
    return { x: enemy.x, y: enemy.y };
  };
  const fixture = {
    records, frames,
    prepareTarget: id => prepare(targets[id]),
    prepareBoss: () => {
      const boss = enemies().find(enemy => enemy.def.id === 'tank_boss');
      return prepare(boss ? { zombie: boss, token: boss.getLifecycleToken() } : null);
    },
    focusBossPhase: phase => {
      const boss = enemies().find(enemy => enemy.def.id === 'tank_boss');
      if (!boss || !Number.isInteger(phase) || phase < 1 || phase > boss.def.bossPhases.length + 1) throw new Error('Invalid boss phase fixture');
      selected = { zombie: boss, token: boss.getLifecycleToken() };
      const before = { health: boss.health, phase: boss.getBossPhaseStatus().phase };
      const health = phase === 1 ? boss.maxHealth : Math.floor(boss.maxHealth * (boss.def.bossPhases[phase - 2].healthRatio - 0.01));
      if (boss.health < health || health <= 0) throw new Error('Phase fixture cannot heal or kill the boss');
      if (boss.health > health) boss.hurt(boss.health - health);
      control();
      const after = { health: boss.health, phase: boss.getBossPhaseStatus().phase, token: boss.getLifecycleToken() };
      record('boss-phase-layout-fixture', { requestedPhase: phase, before, after, bypass: '仅设置自然生成首领的阶段血量用于HUD布局，不计自然通关或TTK。' });
      return after;
    },
    parkPlayer: (x, y) => { player.teleportTo(x, y); return { x: player.x, y: player.y }; },
    report: () => ({ records, frames, bosses: records.filter(entry => entry.name === 'boss-spawn'), targets: Object.fromEntries(Object.entries(targets).map(([id, target]) => [id, { token: target.token, currentToken: target.zombie.getLifecycleToken(), active: target.zombie.isCombatActive() }])) }),
  };
  window.__FRENZY_FIXTURE__ = fixture;
  control();
  return { targets: Object.keys(targets), recordEligible: scene.getState().frenzy.recordEligible };
}
