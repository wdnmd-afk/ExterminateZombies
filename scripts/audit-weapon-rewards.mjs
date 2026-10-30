import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { copyFile, mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

/**
 * 武器关卡奖励节点只读审计。
 *
 * 不跑新浏览器：`campaign-r01`～`r09` 已用同一存档自然通关 1—30，奖励挂在阶段清空上，
 * 那条链本身已经走过全部节点。这里把配置台账与那批结算交叉核对，用两种独立信号判定交付：
 *
 * 1. **许可增量**：该关结算存档里新出现了这把武器的许可。首次整备自选的 6 把属于整备许可，
 *    不是关卡奖励，必须先扣除，否则会把整备当成奖励。
 * 2. **奖励提示**：游戏实际派发的 `pickupCollected` 文本。已拥有该武器时提示是裸武器名
 *    （`formatWeaponRewardLabel` 不加「许可解锁」），所以匹配不能只认带许可字样的那种。
 *
 * 已拥有的武器节点（转补给）不会产生许可增量，只能靠信号 2；`campaign-r01` 那批没有
 * `pickup-events.jsonl`，其完整提示流已不可得，相应节点按「证据缺口」记录，不记作失败。
 *
 * 只读：不改任何原始证据，只在新目录写审计结果。
 */
const root = 'docs/execution/evidence/2026-10-08-scene-acceptance';
const runId = process.argv[2] ?? 'weapon-reward-audit-r01';
assert.match(runId, /^[a-z0-9-]+$/);
const outDir = join('docs/execution/evidence/2026-10-29-weapon-rewards', runId);
if (existsSync(outDir)) throw new Error('审计目录已存在，请换新 runId，不覆盖旧结果');

const read = file => JSON.parse(readFileSync(file, 'utf8'));
const fingerprint = file => createHash('sha256').update(readFileSync(file)).digest('hex');

// —— 配置台账：从源码解析，避免手抄（2026-10-29 已发现文档把 18 处写成 17 处）——
const weaponSource = readFileSync('src/config/weapons.ts', 'utf8');
const weaponNames = Object.fromEntries([...weaponSource.matchAll(/id:'(\w+)',\s*name:'([^']+)'/g)].map(match => [match[1], match[2]]));
const templateSource = readFileSync('src/config/levelTemplates.ts', 'utf8');
const ledger = [];
for (const block of templateSource.split(/\n\s*\{\s*\n\s*id: '/).slice(1)) {
  const levelId = block.match(/^(level_\d+)'/)?.[1];
  const stages = block.slice(block.indexOf('stages:')).split('{ mix:').slice(1);
  stages.forEach((stage, index) => {
    for (const match of stage.matchAll(/type: 'weapon', weaponId: '(\w+)', ammo: (\d+)/g)) {
      ledger.push({ levelId, level: Number(levelId.replace('level_', '')), stage: index + 1, weaponId: match[1], name: weaponNames[match[1]], ammo: Number(match[2]) });
    }
  });
}
assert.equal(ledger.length, 18, `台账应为 18 处，实际 ${ledger.length}`);
for (const node of ledger) assert.ok(node.name, `${node.weaponId} 缺武器名`);

// —— 收集 campaign 批次的全部关卡结算，按关卡号排序 ——
const runs = readdirSync(root).filter(name => /^campaign-r\d+$/.test(name)).sort();
const attempts = [];
for (const run of runs) {
  const jsonlPath = join(root, run, 'pickup-events.jsonl');
  const stream = existsSync(jsonlPath)
    ? readFileSync(jsonlPath, 'utf8').trim().split('\n').flatMap(line => { try { return [JSON.parse(line)]; } catch { return []; } })
    : null;
  for (const file of readdirSync(join(root, run)).filter(name => /^level-\d+-attempt-\d+-result\.json$/.test(name))) {
    const path = join(root, run, file);
    const record = read(path);
    attempts.push({
      run,
      file,
      path,
      level: Number(file.match(/^level-(\d+)-/)[1]),
      attempt: Number(file.match(/-attempt-(\d+)-/)[1]),
      outcome: record.outcome,
      saveWeapons: record.save?.weapons ?? null,
      // 结算 JSON 的 events 只是采样快照；完整流在 pickup-events.jsonl（部分批次缺失）。
      toastTitles: (record.events ?? []).map(event => event.payload?.title).filter(title => typeof title === 'string'),
      hasStream: Boolean(stream),
      sha256: fingerprint(path),
    });
  }
  if (stream) {
    const titles = stream.map(event => event.payload?.title).filter(title => typeof title === 'string');
    for (const entry of attempts.filter(item => item.run === run)) entry.streamTitles = titles;
  }
}
attempts.sort((first, second) => first.level - second.level || first.run.localeCompare(second.run) || first.attempt - second.attempt);

// —— 整备许可基线：首关结算存档里，减去该关两个奖励节点后的剩余即首次整备自选 ——
const firstRunBaseline = read(join(root, 'campaign-r01', 'baseline-save.json')).weapons ?? [];
const afterLevelOne = attempts.find(entry => entry.level === 1)?.saveWeapons ?? [];
const levelOneRewards = ledger.filter(node => node.level === 1).map(node => node.weaponId);
const preparationLicenses = afterLevelOne.filter(weaponId => !levelOneRewards.includes(weaponId));

/** 该关之前（含更早关卡与整备）已经持有的许可。 */
function licensesBefore(level) {
  const earlier = attempts.filter(entry => entry.level < level && entry.saveWeapons);
  const latest = earlier.at(-1)?.saveWeapons;
  return new Set(latest ?? preparationLicenses);
}

/** 提示是否提到这把武器（兼容「已拥有 → 裸武器名」与多标签换行拼接）。 */
function mentionsWeapon(title, name) {
  if (!title.startsWith('阶段补给') && !title.startsWith('章节战利品')) return false;
  return title.split('\n').some(line => line.includes(name));
}

const nodes = ledger.map(node => {
  const related = attempts.filter(entry => entry.level === node.level);
  const before = licensesBefore(node.level);
  const alreadyOwnedBefore = before.has(node.weaponId);
  const licenseGained = related.some(entry => entry.saveWeapons?.includes(node.weaponId)) && !alreadyOwnedBefore;
  const toastHits = related.flatMap(entry => {
    const titles = [...(entry.streamTitles ?? []), ...entry.toastTitles];
    return titles.filter(title => mentionsWeapon(title, node.name)).map(title => ({ run: entry.run, file: entry.file, outcome: entry.outcome, title }));
  });
  const streamAvailable = related.some(entry => entry.hasStream);
  let verdict;
  if (licenseGained) verdict = 'delivered-license';
  else if (toastHits.length > 0) verdict = 'delivered-toast';
  else if (alreadyOwnedBefore && !streamAvailable) verdict = 'evidence-gap';
  else verdict = 'not-observed';
  return {
    ...node,
    alreadyOwnedBefore,
    licenseGained,
    toastCount: toastHits.length,
    firstToast: toastHits[0] ?? null,
    streamAvailable,
    verdict,
    attempts: related.map(entry => `${entry.run}/${entry.file}:${entry.outcome}`),
  };
});

const delivered = nodes.filter(node => node.verdict.startsWith('delivered'));
const gaps = nodes.filter(node => node.verdict === 'evidence-gap');
const notObserved = nodes.filter(node => node.verdict === 'not-observed');

const summary = {
  passed: notObserved.length === 0,
  totalNodes: nodes.length,
  delivered: delivered.length,
  deliveredByLicense: nodes.filter(node => node.verdict === 'delivered-license').length,
  deliveredByToast: nodes.filter(node => node.verdict === 'delivered-toast').length,
  evidenceGap: gaps.map(node => `${node.levelId}#${node.stage}:${node.weaponId}`),
  notObserved: notObserved.map(node => `${node.levelId}#${node.stage}:${node.weaponId}`),
  preparationLicenses,
  firstRunBaseline,
  finalLicenses: attempts.filter(entry => entry.saveWeapons).at(-1)?.saveWeapons ?? null,
  scope: '只读审计 campaign-r01～r09 的自然结算与 pickup 事件流；不新开浏览器、不改原始证据。',
  method: [
    '信号1 许可增量：该关结算存档新增该武器许可，且该关之前未持有。',
    '信号2 奖励提示：游戏实际派发的 pickupCollected 文本提到该武器名（兼容已拥有时的裸武器名）。',
    '首次整备自选的 6 把属整备许可，已从奖励判定中扣除。',
  ],
  limits: [
    'evidence-gap：该节点武器在进关前已持有（奖励转补给，不产生许可增量），且该批次缺 pickup-events.jsonl，完整提示流不可得。不记作失败，也不记作通过。',
    '同一关首败后重试，任一自然尝试观察到即记为交付；未区分首胜局与失败局。',
    '不评价奖励时机与备弹量是否合适（属 V6）。',
  ],
};

await mkdir(outDir, { recursive: true });
await copyFile(resolve(process.argv[1]), join(outDir, 'audit-source.mjs'));
await writeFile(join(outDir, 'nodes.json'), JSON.stringify(nodes, null, 2) + '\n', { flag: 'wx' });
await writeFile(join(outDir, 'sources.json'), JSON.stringify(attempts.map(({ streamTitles, toastTitles, saveWeapons, ...rest }) => rest), null, 2) + '\n', { flag: 'wx' });
await writeFile(join(outDir, 'summary.json'), JSON.stringify(summary, null, 2) + '\n', { flag: 'wx' });

console.log(`交付 ${summary.delivered}/${summary.totalNodes}（许可增量 ${summary.deliveredByLicense} + 提示 ${summary.deliveredByToast}）；证据缺口 ${gaps.length}；未观察到 ${notObserved.length}`);
for (const node of nodes) {
  const tag = { 'delivered-license': 'OK/许可', 'delivered-toast': 'OK/提示', 'evidence-gap': '缺口  ', 'not-observed': '未观察' }[node.verdict];
  console.log(`${tag} ${node.levelId}#${node.stage} ${node.name.padEnd(14)} ${node.firstToast ? node.firstToast.title.split('\n')[0] : node.alreadyOwnedBefore ? '(进关前已持有)' : ''}`);
}
if (!summary.passed) process.exitCode = 1;
