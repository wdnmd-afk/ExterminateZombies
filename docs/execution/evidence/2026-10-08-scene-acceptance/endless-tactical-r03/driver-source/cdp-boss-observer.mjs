const distance = (first, second) => Math.hypot(first.x - second.x, first.y - second.y);

export function requiredBossAbilities(definition, phase) {
  return phase === 1 ? [definition.ability] : definition.bossPhases[phase - 2].unlockAbilities;
}

export function bossObservationRange(ability) {
  if (ability.kind === 'shockwave') return Math.min(ability.maxRange - 5, ability.radius + 10);
  return Math.min(350, Math.max(ability.minRange + 25, ability.maxRange - 25));
}

export class BossAcceptanceTracker {
  encounters = [];
  captures = [];
  current = null;

  observe(data) {
    if (!data.state) return null;
    const elapsed = data.state.stats.elapsedMs;
    const boss = data.enemies?.find(enemy => enemy.id.endsWith('_boss'));
    if (!boss) {
      if (this.current && this.current.finishedAt === null) this.current.finishedAt = elapsed;
      this.current = null;
      return null;
    }
    if (!this.current || this.current.id !== boss.id || this.current.token !== boss.token) {
      this.current = { id: boss.id, token: boss.token, wave: data.state.wave, maxHealth: boss.maxHealth, startedAt: elapsed, finishedAt: null, phases: [] };
      this.encounters.push(this.current);
    }
    const encounter = this.current;
    const number = boss.phase.phase;
    let phase = encounter.phases.find(entry => entry.number === number);
    const newPhase = !phase;
    if (!phase) {
      phase = { number, health: boss.health, startedAt: elapsed, required: requiredBossAbilities(data.bossDefinition, number), windows: [], passed: {} };
      encounter.phases.push(phase);
    }
    for (const event of data.events ?? []) {
      if (event.type !== 'boss-ability' || event.boss.id !== boss.id || event.boss.token !== boss.token || event.boss.phase !== number) continue;
      const ability = phase.required.find(entry => event.payload.key === `boss-ability-${entry.kind}`);
      if (ability) phase.windows.push({ event, ability, warningPeak: 0, projectilePeak: 0, maxSpeed: 0, spawnIncrease: 0, executed: false });
    }
    for (const window of phase.windows) {
      if (phase.passed[window.ability.kind]) continue;
      const { ability, event } = window;
      const age = elapsed - event.combatAt;
      const center = ability.kind === 'shockwave' ? event.boss : event.player;
      const warnings = data.blastWarnings.filter(warning => warning.radius === ability.radius && distance(warning, center) < (ability.kind === 'barrage' ? ability.spread + 25 : 45));
      window.warningPeak = Math.max(window.warningPeak, warnings.length);
      if (ability.kind === 'shockwave' || ability.kind === 'bombard' || ability.kind === 'barrage') {
        const count = ability.kind === 'barrage' ? ability.blastCount : 1;
        const lastDelay = ability.kind === 'barrage' ? (count - 1) * ability.stagger : 0;
        window.executed = window.warningPeak >= count && age > ability.windup + lastDelay + 150 && warnings.length === 0;
      } else if (ability.kind === 'dash') {
        window.maxSpeed = Math.max(window.maxSpeed, Math.hypot(boss.vx, boss.vy));
        window.executed = age >= ability.windup && window.maxSpeed >= ability.dashSpeed * 0.8;
      } else if (ability.kind === 'countershot') {
        window.projectilePeak = Math.max(window.projectilePeak, data.projectiles.filter(projectile => projectile.kind === 'countershot' && projectile.sourceId === boss.id).length);
        window.executed = age >= ability.windup && window.projectilePeak > 0;
      } else if (ability.kind === 'ranged' || ability.kind === 'volley') {
        const seconds = Math.max(0, age - ability.windup) / 1000;
        const matches = data.projectiles.filter(projectile => projectile.kind === 'normal'
          && Math.abs(Math.hypot(projectile.vx, projectile.vy) - ability.projectileSpeed) < 1
          && distance({ x: projectile.x - projectile.vx * seconds, y: projectile.y - projectile.vy * seconds }, event.boss) < 90);
        window.projectilePeak = Math.max(window.projectilePeak, matches.length);
        window.executed = age >= ability.windup && window.projectilePeak >= (ability.kind === 'volley' ? ability.projectileCount : 1);
      } else if (ability.kind === 'summon') {
        window.spawnIncrease = Math.max(window.spawnIncrease, data.enemies.filter(enemy => !enemy.id.endsWith('_boss')).length - event.otherEnemyCount);
        window.executed = age >= ability.windup && window.spawnIncrease >= ability.count;
      }
      if (window.executed) {
        phase.passed[ability.kind] = { at: elapsed, event, warningPeak: window.warningPeak, projectilePeak: window.projectilePeak, maxSpeed: window.maxSpeed, spawnIncrease: window.spawnIncrease };
        this.captures.push({ boss: boss.id, phase: number, kind: ability.kind, proof: phase.passed[ability.kind], snapshot: structuredClone(data) });
      }
    }
    const missing = phase.required.find(ability => !phase.passed[ability.kind]);
    return { boss, newPhase, phase: number, holdFire: Boolean(missing), range: missing ? bossObservationRange(missing) : 330, expired: Boolean(missing) && elapsed - phase.startedAt > 45000 };
  }

  result() {
    return this.encounters.map(encounter => ({
      ...encounter,
      observedTtkMs: encounter.finishedAt === null ? null : encounter.finishedAt - encounter.startedAt,
      includesIntentionalHoldFire: true,
      allPhaseAbilitiesObserved: encounter.phases.length === 3 && encounter.phases.every(phase => phase.required.every(ability => phase.passed[ability.kind])),
    }));
  }
}
