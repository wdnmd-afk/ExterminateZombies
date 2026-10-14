import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { canShootCombatTarget, distanceBetween, COMBAT_POLICY_VERSION } from './cdp-combat-policy.mjs';

const input = resolve(process.argv[2]);
const output = resolve(process.argv[3]);
const bytes = readFileSync(input);
const samples = bytes.toString('utf8').trim().split('\n').map(line => JSON.parse(line));
const counts = {};
const bossSamples = [];
for (const sample of samples) {
  assert.equal(sample.state.frenzy.presetId, 'explosive');
  const key = `${sample.state.frenzy.phase}/${sample.state.player.weapon}`;
  counts[key] = (counts[key] ?? 0) + 1;
  if (!sample.boss) continue;
  const enemy = sample.tactical.enemies.find(entry => entry.id.endsWith('_boss'));
  if (!enemy) continue;
  const data = { ...sample, ...sample.tactical };
  bossSamples.push({ elapsedMs: sample.state.frenzy.elapsedMs, health: sample.boss.health, weapon: sample.state.player.weapon,
    distance: distanceBetween(sample.diagnostics.player, enemy), safe: canShootCombatTarget(data, enemy) });
}
const last = samples.at(-1);
const report = {
  createdAt: new Date().toISOString(), policyVersion: COMBAT_POLICY_VERSION, input, sha256: createHash('sha256').update(bytes).digest('hex'),
  sampleCount: samples.length, counts,
  boss: { samples: bossSamples.length, firstMs: bossSamples[0]?.elapsedMs, firstHealth: bossSamples[0]?.health,
    lastHealth: bossSamples.at(-1)?.health, rpgSamples: bossSamples.filter(sample => sample.weapon === 'rpg').length,
    rpgSafeSamples: bossSamples.filter(sample => sample.weapon === 'rpg' && sample.safe).length,
    damageSamples: bossSamples.filter((sample, index) => index === 0 || sample.health !== bossSamples[index - 1].health) },
  lastPlayer: last.state.player, weaponUsageMs: last.state.stats.weaponUsageMs,
  limits: '只分析既有离散采样；safe 是不含墙体的爆炸安全判据，不是逐帧命中记录，也不是自然成功证明。',
};
mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ output, sampleCount: report.sampleCount, counts, boss: report.boss }, null, 2));
