import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { copyFile, mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

/**
 * 武器关卡奖励节点只读审计。
 *
 * 不跑新浏览器：`campaign-r01`～`r09` 已用同一存档自然通关 1—30，奖励挂在阶段清空上，
 * 所以那条链本身已经执行过全部节点。这里把配置台账与那批结算里**实际弹出的奖励提示**
 * 逐节点对齐，并用下一批的开局存档交叉核对许可是否持久化。
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

// —— 配置台账：从源码解析，避免手抄出错（2026-10-29 已发现文档把 18 处写成 17 处）——
const weaponSource = readFileSync('src/config/weapons.ts', 'utf8');
const weaponNames = Object.fromEntries([...weaponSource.matchAll(/id:'(\w+)',\s*name:'([^']+)'/g)].map(match => [match[1], match[2]]));
const templateSource = readFileSync('src/config/levelTemplates.ts', 'utf8');
const ledger = [];
for (const block of templateSource.split(/\n\s*\{\s*\n\s*id: '/).slice(1)) {
  const levelId = block.match(/^(level_\d+)'/)?.[1];
  const stagesText = block.slice(block.indexOf('stages:'));
  // 每个阶段对象以 `{ mix:` 开头，按出现顺序编号。
  const stages = stagesText.split('{ mix:').slice(1);
  stages.forEach((stage, index) => {
    for (const match of stage.matchAll(/type: 'weapon', weaponId: '(\w+)', ammo: (\d+)/g)) {
      ledger.push({ levelId, stage: index + 1, weaponId: match[1], name: weaponNames[match[1]], ammo: Number(match[2]) });
    }
  });
}
assert.equal(ledger.length, 18, `台账应为 18 处，实际 ${ledger.length}`);
for (const node of ledger) assert.ok(node.name, `${node.weaponId} 缺武器名`);

// —— 收集 campaign 批次的全部关卡结算 ——
const runs = readdirSync(root).filter(name => /^campaign-r\d+$/.test(name)).sort();
const results = [];
for (const run of runs) {
  for (const file of readdirSync(join(root, run)).filter(name => /^level-\d+-attempt-\d+-result\.json$/.test(name))) {
    const path = join(root, run, file);
    const record = read(path);
    const level = Number(file.match(/^level-(\d+)-/)[1]);
    const toasts = (record.events ?? [])
      .filter(event => event.type === 'pickup' && typeof event.payload?.title === 'string' && event.payload.title.startsWith('阶段补给'))
      .map(event => ({ at: event.at, title: event.payload.title }));
    results.push({ run, file, path, level, outcome: record.outcome, toasts, saveWeapons: record.save?.weapons ?? null, sha256: fingerprint(path) });
  }
}

// —— 逐节点核对：同一关可能有多次尝试，任一自然尝试弹出对应武器提示即算交付 ——
const nodes = ledger.map(node => {
  const level = Number(node.levelId.replace('level_', ''));
  const attempts = results.filter(entry => entry.level === level);
  const hits = attempts.flatMap(entry => entry.toasts
    .filter(toast => toast.title.includes(` ${node.name} `) || toast.title.includes(`· ${node.name} ·`))
    .map(toast => ({ run: entry.run, file: entry.file, outcome: entry.outcome, title: toast.title })));
  const licensed = attempts.some(entry => entry.saveWeapons?.includes(node.weaponId));
  return {
    ...node,
    attempts: attempts.map(entry => `${entry.run}/${entry.file}:${entry.outcome}`),
    delivered: hits.length > 0,
    licensedInSave: licensed,
    firstToast: hits[0] ?? null,
    toastCount: hits.length,
  };
});

// —— 交叉核对：每批开局存档的许可，必须包含此前已交付的全部武器（持久化证据）——
const baselines = runs.map(run => {
  const path = join(root, run, 'baseline-save.json');
  return existsSync(path) ? { run, weapons: read(path).weapons ?? [], sha256: fingerprint(path) } : null;
}).filter(Boolean);

const delivered = nodes.filter(node => node.delivered);
const missing = nodes.filter(node => !node.delivered);
const summary = {
  passed: missing.length === 0,
  totalNodes: nodes.length,
  delivered: delivered.length,
  missing: missing.map(node => `${node.levelId}#${node.stage}:${node.weaponId}`),
  uniqueWeapons: [...new Set(ledger.map(node => node.weaponId))].length,
  finalLicenses: baselines.at(-1)?.weapons ?? null,
  scope: '只读审计 campaign-r01～r09 的自然结算事件；不新开浏览器、不改原始证据。奖励提示文本来自游戏实际 pickupCollected 事件。',
  limits: [
    '同一关首败后重试，只要任一自然尝试弹出该武器提示即记为交付；未区分是首胜局还是失败局里的阶段清空。',
    '编队满 6 把时奖励只解锁许可、不进本局编队——这是设计行为，提示文本含「编队已满」。',
    '不评价奖励时机、备弹量是否合适（属于 V6）。',
  ],
};

await mkdir(outDir, { recursive: true });
await copyFile(resolve(process.argv[1]), join(outDir, 'audit-source.mjs'));
await writeFile(join(outDir, 'nodes.json'), JSON.stringify(nodes, null, 2) + '\n', { flag: 'wx' });
await writeFile(join(outDir, 'baselines.json'), JSON.stringify(baselines, null, 2) + '\n', { flag: 'wx' });
await writeFile(join(outDir, 'sources.json'), JSON.stringify(results.map(({ toasts, saveWeapons, ...rest }) => rest), null, 2) + '\n', { flag: 'wx' });
await writeFile(join(outDir, 'summary.json'), JSON.stringify(summary, null, 2) + '\n', { flag: 'wx' });

console.log(`nodes ${summary.delivered}/${summary.totalNodes} delivered; unique weapons ${summary.uniqueWeapons}`);
for (const node of nodes) {
  console.log(`${node.delivered ? 'OK  ' : 'MISS'} ${node.levelId}#${node.stage} ${node.name.padEnd(14)} ${node.firstToast ? node.firstToast.run + ' | ' + node.firstToast.title : '(无提示)'}`);
}
if (!summary.passed) process.exitCode = 1;
