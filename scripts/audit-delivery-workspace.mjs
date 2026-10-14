import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { dirname, join, relative, resolve } from 'node:path';

const workspace = resolve('.');
const git = args => execFileSync('git', args, { cwd: workspace, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
const pathsFromGit = args => git(args).split('\0').filter(Boolean);
const summarize = paths => {
  const files = paths.filter(path => existsSync(join(workspace, path))).map(path => ({ path, bytes: lstatSync(join(workspace, path)).size }));
  const byRoot = {};
  for (const file of files) {
    const root = file.path.startsWith('src/assets/') ? file.path.split('/').slice(0, 3).join('/') : file.path.startsWith('docs/execution/evidence/') ? 'docs/execution/evidence' : file.path.split('/')[0];
    const group = byRoot[root] ?? { files: 0, bytes: 0 };
    group.files++; group.bytes += file.bytes; byRoot[root] = group;
  }
  return { files: files.length, bytes: files.reduce((total, file) => total + file.bytes, 0), pngFiles: files.filter(file => file.path.endsWith('.png')).length, byRoot, largest: [...files].sort((first, second) => second.bytes - first.bytes).slice(0, 12) };
};
const measureDirectory = directory => {
  let files = 0, bytes = 0, skippedLinks = 0;
  const visit = path => {
    for (const entry of readdirSync(path, { withFileTypes: true })) {
      const absolute = join(path, entry.name);
      if (entry.isSymbolicLink()) { skippedLinks++; continue; }
      if (entry.isDirectory()) visit(absolute);
      else if (entry.isFile()) { files++; bytes += lstatSync(absolute).size; }
    }
  };
  if (existsSync(directory)) visit(directory);
  return { files, bytes, skippedLinks };
};
const tracked = pathsFromGit(['ls-files', '-z']);
const untracked = pathsFromGit(['ls-files', '--others', '--exclude-standard', '-z']);
const objects = spawnSync('git', ['count-objects', '-v'], { cwd: workspace, encoding: 'utf8' });
if (objects.status !== 0) throw new Error(objects.stderr);
const specs = JSON.parse(readFileSync('scripts/weapon_side_specs.json', 'utf8'));
const candidates = existsSync('TmpGenerate') ? readdirSync('TmpGenerate') : [];
const heavyWeapons = Object.entries(specs.weapons).map(([id, spec]) => {
  const path = `src/assets/processed/weapons/${spec.outputName}`;
  const bytes = readFileSync(path);
  return {
    id, output: { path, bytes: bytes.length, width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20), sha256: createHash('sha256').update(bytes).digest('hex') },
    candidatePattern: `TmpGenerate/${spec.candidateSlug}-icon-<采用版本>.png`,
    candidatesPresent: candidates.filter(name => name.startsWith(`${spec.candidateSlug}-icon-`) && name.endsWith('.png')),
    adoptedOriginalVerified: false,
  };
});
const report = {
  createdAt: new Date().toISOString(), readOnly: true, head: git(['rev-parse', 'HEAD']).trim(),
  upstream: git(['rev-parse', '@{upstream}']).trim(), tracked: summarize(tracked), untracked: summarize(untracked),
  directories: Object.fromEntries(['src/assets/generated', 'src/assets/processed', 'src/assets/downloaded', 'docs/execution/evidence', 'node_modules', '.release-candidates'].map(path => [path, measureDirectory(join(workspace, path))])),
  gitObjects: { stdout: objects.stdout, warnings: objects.stderr, unit: 'git count-objects 的 size 字段为 KiB，非 bytes' },
  heavyWeapons,
  limits: '按实际工作区文件量测；tracked 包含跟踪文件的当前内容但不包含新增未跟踪文件。目录统计彼此可重叠，不能与 Git 对象数相加。只检查当前已知候选路径，不宣称搜遍外部备份。没有删除截图、素材、浏览器数据或 Git 垃圾，没有重写历史。',
};
if (!process.argv[2]) throw new Error('用法：node scripts/audit-delivery-workspace.mjs <新证据文件>');
const output = resolve(process.argv[2]);
if (!relative(workspace, output).startsWith('docs' + (process.platform === 'win32' ? '\\' : '/') + 'execution')) throw new Error('证据应写入当前仓库 docs/execution 下');
mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ head: report.head, tracked: { files: report.tracked.files, bytes: report.tracked.bytes }, untracked: { files: report.untracked.files, bytes: report.untracked.bytes, pngFiles: report.untracked.pngFiles }, heavyOriginalsVerified: 0, directories: report.directories, gitObjects: report.gitObjects }, null, 2));
