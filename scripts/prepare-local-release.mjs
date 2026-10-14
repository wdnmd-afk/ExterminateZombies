import { constants, copyFileSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, extname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { preview } from 'vite';
import { auditRuntimeInventory, parseInventory } from './audit-runtime-assets.mjs';

const asset = path => `src/assets/${path}`;
const cc0 = asset('downloaded/zombies/LICENSE-CC0-1.0.txt');
const materials = {
  'zombies-1.1': [asset('zombie-1.1/SOURCE.md'), asset('zombie-1.1/LICENSE-CC-BY-3.0.txt'), asset('zombie-1.1/CHANGES.txt')],
  'zombie-rpg-sprites': [asset('downloaded/zombies/zombie-rpg-sprites/SOURCE.md'), cc0],
  'pixel-art-guns': [asset('downloaded/weapons/pixel-art-guns-128x128/SOURCE.md'), asset('downloaded/weapons/LICENSE-CC0-1.0.txt')],
  'desert-eagle-486': [asset('downloaded/weapons/486-shotgun-desert-eagle/SOURCE.md'), asset('downloaded/weapons/LICENSE-CC0-1.0.txt')],
  'alibaba-puhuiti-3': ['SOURCE.md', 'LEGAL-STATEMENT.txt', 'LEGAL-STATEMENT.source.json'].map(name => asset(`downloaded/fonts/alibaba-puhuiti-3/${name}`)),
  'project-characters': [asset('generated/characters/SOURCE.md')],
  'project-tactical-props': [asset('generated/tactical-devices/SOURCE.md')],
  'project-tactical-devices': [asset('generated/tactical-devices/SOURCE.md')],
  'project-ui': [asset('processed/ui/SOURCE.md')],
};
for (const [source, folder, license] of [
  ['freeart-topdown-extras', 'freeart-topdown-extras', 'LICENSE.txt'],
  ['ammo-pack', 'ammo-pack', 'LICENSE.txt'],
  ['medicine-pack', 'medicine-pack-16x16', 'LICENSE.txt'],
  ['airos-medical-items', 'airos-medical-items-32x32', 'LICENSE.txt'],
  ['airos-food-items', 'airos-food-items-32x32', 'LICENSE.txt'],
  ['cc0-explosive-icons', 'cc0-explosive-icons', 'LICENSE.txt'],
  ['endless-midnight', 'endless-midnight-zombie-swarm-assets', 'LICENSE.txt'],
  ['kenney-rpg-urban-pack', 'kenney-rpg-urban-pack', 'License.txt'],
  ['modern-city-extension', 'modern-city-extension', 'LICENSE.txt'],
  ['railway-line-terrain', 'railway-line-terrain', 'LICENSE.txt'],
]) materials[source] = [asset(`downloaded/environment/${folder}/SOURCE.md`), asset(`downloaded/environment/${folder}/${license}`)];
for (const source of ['gunshot-sounds', 'gun-reload-sounds', 'zombies-sound-pack', '100-cc0-sfx', 'kenney-interface-sounds', 'hurt-sound-effects', 'fire-crackling', 'empty-city', 'fast-fight-battle', 'trance-boss-battle']) {
  materials[source] = [asset(`downloaded/audio/${source}/SOURCE.md`), asset(`downloaded/audio/${source}/${source === 'gunshot-sounds' ? 'LICENSE-CC-BY-3.0.txt' : 'LICENSE-CC0-1.0.txt'}`)];
}
for (const source of ['project-zombies', 'project-weapon-side-ai', 'project-weapon-side-drawn', 'project-weapon-topdown', 'project-obstacles', 'project-effects', 'project-particles']) materials[source] = ['docs/ART_ASSET_REGISTRY.md'];

const commonMaterials = [
  'docs/RUNTIME_ASSET_MANIFEST.md', 'docs/RUNTIME_ASSET_INVENTORY.csv', 'docs/ART_ASSET_REGISTRY.md',
  'node_modules/phaser/LICENSE.md', 'node_modules/phaser/src/physics/matter-js/lib/license.js', 'node_modules/eventemitter3/LICENSE',
];
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const slash = path => path.split(sep).join('/');
const inside = (root, path) => { const value = relative(root, path); return value !== '' && value !== '..' && !value.startsWith(`..${sep}`) && !isAbsolute(value); };

export function licenseMaterialPaths(sourceIds) {
  for (const source of sourceIds) if (!Object.hasOwn(materials, source)) throw new Error(`未登记的运行时来源：${source}`);
  return [...new Set([...commonMaterials, ...sourceIds.flatMap(source => materials[source])])].sort();
}

export function assertCandidatePath(workspace, output) {
  const base = resolve(workspace, '.release-candidates');
  const target = resolve(workspace, output);
  if (!inside(base, target)) throw new Error('候选包必须位于工作区 .release-candidates 的新子目录');
  if (existsSync(target)) throw new Error('候选目录已存在，拒绝覆盖');
  // 不跟随输出父目录中的 junction/symlink，防止表面位于工作区而实际写到外部。
  for (let parent = dirname(target); parent !== resolve(workspace); parent = dirname(parent)) {
    if (existsSync(parent) && lstatSync(parent).isSymbolicLink()) throw new Error('候选目录不能经过符号链接');
  }
  return target;
}

function listFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`交付包不允许符号链接：${path}`);
    return entry.isDirectory() ? listFiles(path) : entry.isFile() ? [path] : [];
  }).sort();
}

export function fingerprintDirectory(directory) {
  const files = listFiles(directory).map(path => {
    const bytes = readFileSync(path);
    return { path: slash(relative(directory, path)), bytes: bytes.length, sha256: sha256(bytes) };
  });
  return { files, totalBytes: files.reduce((total, file) => total + file.bytes, 0), fingerprint: sha256(JSON.stringify(files)) };
}

export function verifyBuildFiles(directory, evidence) {
  const actual = fingerprintDirectory(directory);
  if (!actual.files.some(file => file.path === 'index.html')) throw new Error('缺少生产 index.html');
  if (JSON.stringify(actual.files) !== JSON.stringify(evidence.files) || actual.fingerprint !== evidence.fingerprint || actual.totalBytes !== evidence.totalBytes) throw new Error('dist 与生产实景采样构建指纹不一致，请重新构建并补验');
  return actual;
}

async function verifyHttp(payload, files) {
  const server = await preview({ configFile: false, logLevel: 'silent', base: './', build: { outDir: payload }, preview: { host: '127.0.0.1', port: 0, open: false } });
  const address = server.httpServer.address();
  const origin = `http://127.0.0.1:${address.port}`;
  const types = { '.html': 'text/html', '.js': 'javascript', '.css': 'text/css', '.png': 'image/png', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.woff2': 'font/woff2', '.json': 'application/json' };
  const results = [];
  try {
    for (const file of files) {
      const response = await fetch(`${origin}/${file.path.split('/').map(encodeURIComponent).join('/')}`, { signal: AbortSignal.timeout(15000) });
      const bytes = Buffer.from(await response.arrayBuffer());
      const contentType = response.headers.get('content-type') ?? '';
      const expectedType = types[extname(file.path)];
      results.push({ path: file.path, status: response.status, bytes: bytes.length, contentType, passed: response.ok && bytes.length === file.bytes && sha256(bytes) === file.sha256 && (!expectedType || contentType.includes(expectedType)) });
    }
    return { passed: results.every(result => result.passed), origin, files: results.length, results, scope: '回环 Vite preview 逐文件校验，不代表任何公共主机、CDN 或真实跨浏览器实听' };
  } finally {
    server.httpServer.closeAllConnections();
    await new Promise((accept, reject) => server.httpServer.close(error => error ? reject(error) : accept()));
  }
}

export async function prepareLocalRelease(workspace, output, buildEvidencePath) {
  workspace = realpathSync(workspace);
  const target = assertCandidatePath(workspace, output);
  const inventory = auditRuntimeInventory(workspace);
  if (!inventory.passed) throw new Error(`运行时资源核对失败：${JSON.stringify(inventory.issues)}`);
  const evidencePath = resolve(workspace, buildEvidencePath);
  if (!inside(workspace, realpathSync(evidencePath))) throw new Error('构建证据必须来自当前工作区');
  const build = verifyBuildFiles(join(workspace, 'dist'), JSON.parse(readFileSync(evidencePath, 'utf8')));
  const session = JSON.parse(readFileSync(join(dirname(evidencePath), 'session.json'), 'utf8'));
  if (!session.production || !session.testing.developerGlobalAbsent) throw new Error('必须提供无开发全局的生产实景构建证据');
  const checkedSources = Object.entries(session.sourceHashes).filter(([path]) => path.startsWith('src/'));
  if (!checkedSources.length) throw new Error('生产采样缺少源码指纹');
  for (const [path, hash] of checkedSources) {
    const absolute = resolve(workspace, path);
    if (!inside(workspace, realpathSync(absolute)) || sha256(readFileSync(absolute)) !== hash) throw new Error(`生产采样之后源码发生变化：${path}`);
  }
  const rows = parseInventory(readFileSync(join(workspace, 'docs/RUNTIME_ASSET_INVENTORY.csv'), 'utf8'));
  const sourceIds = [...new Set(rows.map(row => row.source_id))].sort();
  const paths = licenseMaterialPaths(sourceIds);
  const sourceLicensePresent = existsSync(join(workspace, 'LICENSE')) && readFileSync(join(workspace, 'LICENSE'), 'utf8').trim().length > 0;
  if (sourceLicensePresent) paths.push('LICENSE');
  for (const path of paths) {
    const absolute = resolve(workspace, path);
    if (!inside(workspace, realpathSync(absolute)) || readFileSync(absolute).length === 0) throw new Error(`许可材料不存在、为空或越界：${path}`);
  }
  const payload = join(target, 'payload');
  mkdirSync(payload, { recursive: true });
  const copy = (source, destination) => { mkdirSync(dirname(destination), { recursive: true }); copyFileSync(source, destination, constants.COPYFILE_EXCL); };
  for (const file of build.files) copy(join(workspace, 'dist', file.path), join(payload, file.path));
  for (const path of paths) copy(join(workspace, path), join(payload, 'licenses', path));
  const notices = [
    '# 本地候选包：尚未获准公开发布', '',
    '来源登记与复制许可原文不等于法律批准。源码许可、项目生成视觉的对外授权和发布许可均须权利人确认；不得把第三方素材统一改标 MIT、CC0 或 OFL。', '',
    'Gunshot recordings by Vincent Sevedge, submitted by Tabasco on OpenGameArt, licensed under CC BY 3.0. Recordings trimmed into single-shot samples by this project.',
    'Gunshot source: https://opengameart.org/content/gunshot-sounds ; license: https://creativecommons.org/licenses/by/3.0/',
    'Zombies 1.1: Svetlana Kushnariova (Cabbit) / Jordan Irwin (AntumDeluge), CC BY 3.0+；保留旧图预载与修改记录。',
    '阿里巴巴普惠体 3 保留官方完整中英文法律声明；不重新授予字体权利。',
    'Phaser、内含 Matter 代码及 eventemitter3 保留安装版本许可原文；不把未使用的 Spine 插件误记为游戏资源。', '',
    '## 交付材料', ...paths.map(path => `- [${path}](licenses/${path.split('/').map(encodeURIComponent).join('/')})`), '',
  ].join('\n');
  writeFileSync(join(payload, 'THIRD_PARTY_NOTICES.md'), notices, { flag: 'wx' });
  const packaged = fingerprintDirectory(payload);
  const http = await verifyHttp(payload, packaged.files);
  const after = fingerprintDirectory(payload);
  if (after.fingerprint !== packaged.fingerprint) throw new Error('HTTP 核对期间候选包发生变化');
  const manualGates = [
    ...(!sourceLicensePresent ? ['源码 LICENSE 尚未由用户确定'] : ['源码 LICENSE 的适用范围须权利人确认，存在文件不等于发布授权']),
    '项目生成视觉对外许可／三张重火力采用原图待补',
    'P2/V6 外部独立试玩、三个记忆点、手感与实听待真人回填',
    'P5 指定目标设备、主流浏览器生产包体验及公开试玩安排待确认',
    'F-08 爆破狂潮自然成功仍未通过',
    '公开发布对象、版本、渠道及执行授权待用户确认',
  ];
  const report = {
    createdAt: new Date().toISOString(), candidate: slash(relative(workspace, target)), localCandidatePrepared: true,
    technicalChecksPassed: inventory.passed && http.passed, publicReleaseReady: false, sourceLicensePresent,
    sourceIds, materialFiles: paths.length, productionSourceFilesChecked: checkedSources.length,
    buildEvidence: slash(relative(workspace, evidencePath)), build, packaged, inventory, http, manualGates,
    limits: '本地交付预检，不是法律意见、真人验收或公开发布。任何外部门禁不得用脚本自动代签。',
  };
  writeFileSync(join(target, 'release-report.json'), JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
  return report;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (!process.argv[2] || !process.argv[3]) throw new Error('用法：node scripts/prepare-local-release.mjs .release-candidates/<新编号> <生产实景目录>/build.json [新证据文件路径]');
  const report = await prepareLocalRelease(resolve('.'), process.argv[2], process.argv[3]);
  if (process.argv[4]) {
    const path = resolve(process.argv[4]); mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
  }
  console.log(JSON.stringify({ candidate: report.candidate, technicalChecksPassed: report.technicalChecksPassed, materialFiles: report.materialFiles, httpFiles: report.http.files, bytes: report.packaged.totalBytes, publicReleaseReady: false, manualGates: report.manualGates }, null, 2));
  process.exitCode = report.technicalChecksPassed ? 2 : 1;
}
