import { describe, it } from 'vitest';
import { appendFileSync, writeFileSync } from 'node:fs';
const OUT = 'G:/github/ExterminateZombies/tests/__tmp_out.txt';
writeFileSync(OUT, '');
const log = (s: string) => appendFileSync(OUT, s + '\n');
import { LEVELS } from '../src/config/levels';
import { ZOMBIES } from '../src/config/zombies';
import { getWaveEnemyEntries, getWaveEnemyCount, getWaveSpawnDurationMs, getLevelSpawnDurationMs, getWaveSegments } from '../src/config/waveShape';
import { createEndlessWave, getEndlessWaveMeta, getEndlessBossScaling } from '../src/config/endless';

describe('analysis', () => {
  it('per-level stats', () => {
    const rows: string[] = [];
    for (const lv of LEVELS) {
      const waves = lv.waves;
      let total = 0;
      let hpBudget = 0;
      let dmgBudget = 0;
      const typeCounts = new Map<string, number>();
      for (const w of waves) {
        for (const e of getWaveEnemyEntries(w)) {
          total += e.count;
          typeCounts.set(e.type, (typeCounts.get(e.type) ?? 0) + e.count);
          const def = (ZOMBIES as any)[e.type];
          hpBudget += def.health * e.count;
          dmgBudget += def.damage * e.count;
        }
      }
      const segCount = waves.reduce((s, w) => s + getWaveSegments(w).length, 0);
      const spawnMs = getLevelSpawnDurationMs(waves);
      const bossDef = lv.boss ? (ZOMBIES as any)[lv.boss.type] : null;
      rows.push([
        lv.id,
        lv.name,
        `waves=${waves.length}`,
        `segments=${segCount}`,
        `total=${total}`,
        `types=${typeCounts.size}`,
        `hp=${hpBudget}`,
        `dmg=${dmgBudget}`,
        `props=${lv.props.length}`,
        `obst=${(lv.obstacles ?? []).length}`,
        `spawnFloorSec=${(spawnMs / 1000).toFixed(1)}`,
        `boss=${lv.boss?.type ?? 'none'}${bossDef ? `(hp=${bossDef.health})` : ''}`,
      ].join(' | '));
      rows.push('   typeBreakdown: ' + [...typeCounts.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}:${v}`).join(', '));
      // per-wave
      waves.forEach((w, i) => {
        const c = getWaveEnemyCount(w);
        const segs = getWaveSegments(w);
        const rw = (w.rewards ?? []).map((r: any) => r.type === 'weapon' ? `weapon:${r.weaponId}(${r.ammo})` : r.type === 'medicine' ? `med:${r.medicineId}x${r.amount}` : r.type).join('+') || '-';
        rows.push(`   W${i + 1}: n=${c} segs=${segs.length} interval=${segs.map(s => s.spawnInterval).join('/')} startDelay=${w.startDelay} spawnFloor=${(getWaveSpawnDurationMs(w) / 1000).toFixed(1)}s rewards=${rw}`);
      });
      rows.push('');
    }
    log(rows.join('\n'));
  });

  it('endless waves 1-40', () => {
    const rows: string[] = [];
    for (let n = 1; n <= 40; n++) {
      const w = createEndlessWave(n);
      const meta = getEndlessWaveMeta(n);
      const segs = getWaveSegments(w);
      const total = getWaveEnemyCount(w);
      const types = getWaveEnemyEntries(w);
      const caps = segs.map(s => s.concurrentCap).join('/');
      const sc = getEndlessBossScaling(meta.chapter);
      rows.push(`W${String(n).padStart(2)} ch${meta.chapter}.${meta.chapterWave} ${meta.kind.padEnd(8)} n=${String(total).padStart(3)} segs=${segs.length} cap=${caps} int=${segs.map(s => s.spawnInterval).join('/')} floor=${(getWaveSpawnDurationMs(w) / 1000).toFixed(1)}s ${meta.bossId ? `BOSS=${meta.bossId} hpx${sc.healthMultiplier.toFixed(2)} dmgx${sc.damageMultiplier.toFixed(2)}` : ''} :: ${types.map(t => `${t.type}:${t.count}`).join(',')}`);
    }
    log(rows.join('\n'));
  });

  it('endless scaling far', () => {
    const rows: string[] = [];
    for (const n of [50, 60, 70, 80, 90, 100, 150, 200]) {
      const w = createEndlessWave(n);
      const meta = getEndlessWaveMeta(n);
      const sc = getEndlessBossScaling(meta.chapter);
      rows.push(`W${n} ch${meta.chapter}.${meta.chapterWave} ${meta.kind} n=${getWaveEnemyCount(w)} cap=${getWaveSegments(w).map(s => s.concurrentCap).join('/')} int=${getWaveSegments(w).map(s => s.spawnInterval).join('/')} bossHpX=${sc.healthMultiplier.toFixed(2)} dmgX=${sc.damageMultiplier.toFixed(2)}`);
    }
    log(rows.join('\n'));
  });
});
