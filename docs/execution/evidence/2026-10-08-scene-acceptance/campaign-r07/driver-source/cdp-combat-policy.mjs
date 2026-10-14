export const distanceBetween = (first, second) => Math.hypot(first.x - second.x, first.y - second.y);

export function segmentDistance(point, start, end) {
  const horizontal = end.x - start.x;
  const vertical = end.y - start.y;
  const lengthSquared = horizontal * horizontal + vertical * vertical;
  const fraction = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, ((point.x - start.x) * horizontal + (point.y - start.y) * vertical) / lengthSquared));
  return distanceBetween(point, { x: start.x + horizontal * fraction, y: start.y + vertical * fraction });
}

const blocked = (point, tiles, margin = 18) => tiles.some(tile => Math.abs(point.x - tile.x) < tile.width / 2 + margin && Math.abs(point.y - tile.y) < tile.height / 2 + margin);
export function lineIsClear(start, end, tiles, margin = 4) {
  const steps = Math.ceil(distanceBetween(start, end) / 10);
  for (let index = 1; index <= steps; index++) {
    const fraction = index / steps;
    if (blocked({ x: start.x + (end.x - start.x) * fraction, y: start.y + (end.y - start.y) * fraction }, tiles, margin)) return false;
  }
  return true;
}

export function projectilePressure(point, projectiles, horizon = 0.9) {
  let risk = 0;
  for (const projectile of projectiles) {
    const end = { x: projectile.x + projectile.vx * horizon, y: projectile.y + projectile.vy * horizon };
    const clearance = segmentDistance(point, projectile, end) - projectile.radius - 16;
    if (clearance < 42) risk += (42 - clearance) ** 2 * 5;
  }
  return risk;
}

export function selectCombatWeapon(data) {
  const player = data.state.player;
  const available = data.weaponStatuses.filter(status => status.usable && status.weaponId !== 'pistol');
  if (available.length === 0) return 'pistol';
  if (data.state.frenzy) return available[0].weaponId;
  const order = ['rifle', 'tesla', 'golden_m249', 'ak47', 'aa12', 'smg', 'shotgun', 'gatling', 'barrett', 'rpg', 'm79', 'flamethrower'];
  const threatened = data.enemies.some(enemy => distanceBetween(data.diagnostics.player, enemy) < 105);
  const score = status => {
    const rank = order.indexOf(status.weaponId);
    return (rank < 0 ? order.length : rank) * 12 + (status.ammoInMag === 0 ? (threatened ? 100 : 8) : 0);
  };
  available.sort((first, second) => score(first) - score(second));
  if (data.reloading && available.some(status => status.weaponId === player.weapon)) return player.weapon;
  return available[0].weaponId;
}

export function selectCombatTarget(data) {
  const player = data.diagnostics.player;
  const visible = data.enemies.filter(enemy => lineIsClear(player, enemy, data.tiles));
  const immediate = visible.filter(enemy => distanceBetween(player, enemy) < 95).sort((first, second) => distanceBetween(player, first) - distanceBetween(player, second))[0];
  const objective = data.frenzyTargets?.filter(target => target.status === 'alive' && target.enemy)
    .sort((first, second) => distanceBetween(player, first.enemy) - distanceBetween(player, second.enemy))[0]?.enemy;
  if (data.state.frenzy) return immediate ?? objective ?? [...data.enemies].sort((first, second) => distanceBetween(player, first) - distanceBetween(player, second))[0];
  if (immediate) return immediate;
  const score = enemy => distanceBetween(player, enemy) + (lineIsClear(player, enemy, data.tiles) ? 0 : 2000)
    - (enemy.abilityKind === 'ranged' ? 230 : 0) - (enemy.id.endsWith('_boss') ? 120 : 0);
  return [...data.enemies].sort((first, second) => score(first) - score(second))[0];
}

export function shouldUseCombatSkill(data) {
  if (!data.skill.ready) return false;
  const player = data.diagnostics.player;
  const nearest = Math.min(Infinity, ...data.enemies.map(enemy => distanceBetween(player, enemy)));
  if (data.state.player.characterId === 'watcher') return nearest < 175 || projectilePressure(player, data.projectiles, 0.45) > 7000;
  if (data.state.player.characterId === 'runner') return nearest < 115 || projectilePressure(player, data.projectiles, 0.45) > 3000;
  return nearest < 450;
}

export function chooseCombatMovement(data, target, hazards) {
  const player = data.diagnostics.player;
  const core = data.cores?.slice().sort((first, second) => distanceBetween(player, first) - distanceBetween(player, second))[0];
  const objective = data.frenzyTargets?.filter(entry => entry.status === 'alive' && entry.enemy)
    .sort((first, second) => distanceBetween(player, first.enemy) - distanceBetween(player, second.enemy))[0]?.enemy;
  const goal = core ?? objective ?? target;
  const ranges = { shotgun: 125, aa12: 150, tesla: 275, rpg: 350, flamethrower: 115 };
  let desiredDistance = ranges[data.weapon.id] ?? Math.min(380, data.weapon.range * 0.55);
  if (goal?.id === 'matriarch_boss' && goal.health < goal.maxHealth * 0.25) desiredDistance = Math.max(230, desiredDistance);
  if (core) desiredDistance = 0;
  const offsets = [];
  for (const horizontal of [-1, 0, 1]) for (const vertical of [-1, 0, 1]) if (horizontal || vertical) offsets.push({ x: horizontal * 40, y: vertical * 40 });
  const start = { x: player.x, y: player.y, cost: 0, first: null };
  const queue = [start];
  const pointKey = point => `${Math.round(point.x * 1000)},${Math.round(point.y * 1000)}`;
  const visited = new Set([pointKey(start)]);
  for (let cursor = 0; cursor < queue.length; cursor++) {
    const current = queue[cursor];
    for (const offset of offsets) {
      const next = { x: current.x + offset.x, y: current.y + offset.y, cost: current.cost + Math.hypot(offset.x, offset.y) };
      const key = pointKey(next);
      if (visited.has(key) || next.x < 35 || next.x > 1245 || next.y < 45 || next.y > 675 || blocked(next, data.tiles) || !lineIsClear(current, next, data.tiles, 16)) continue;
      next.first = current.first ?? next;
      visited.add(key); queue.push(next);
    }
  }
  let best = start;
  let bestScore = Infinity;
  for (const point of queue) {
    const first = point.first ?? point;
    let score = point.cost * 0.4 + projectilePressure(point, data.projectiles) * 0.5 + projectilePressure(first, data.projectiles, 0.6);
    for (const enemy of data.enemies) {
      const radius = enemy.radius + (enemy.id.endsWith('_boss') ? 90 : enemy.abilityKind === 'dash' ? 110 : 70);
      const clearance = distanceBetween(point, enemy);
      score += Math.max(0, radius - clearance) ** 2 * (core ? 0.55 : 1.4);
      score += Math.max(0, enemy.radius + 40 - distanceBetween(first, enemy)) ** 2 * 2.5;
    }
    for (const hazard of [...hazards, ...(data.blastWarnings ?? [])]) {
      score += Math.max(0, hazard.radius + 32 - distanceBetween(point, hazard)) ** 2 * 4;
      score += Math.max(0, hazard.radius + 22 - distanceBetween(first, hazard)) ** 2 * 2;
    }
    if (goal) {
      score += Math.abs(distanceBetween(point, goal) - desiredDistance) * (core ? 12 : objective ? 5 : 1.8);
      if (!core && !lineIsClear(point, goal, data.tiles)) score += 1800;
    } else score += distanceBetween(point, { x: 640, y: 360 });
    if (!core && (point.x < 100 || point.x > 1180 || point.y < 95 || point.y > 625)) score += 250;
    if (score < bestScore) { best = point; bestScore = score; }
  }
  return best.first ?? player;
}
