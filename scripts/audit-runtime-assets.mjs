import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const HEADER = 'category,loader_key,path,bytes,width,height,sha256,source_id,load_status';
export function parseInventory(text) {
  const [header, ...lines] = text.trim().split(/\r?\n/);
  if (header !== HEADER) throw new Error('资源清单表头不符合已确认的九列结构');
  return lines.map((line, index) => {
    const fields = [];
    let value = '', quoted = false;
    for (let cursor = 0; cursor < line.length; cursor++) {
      const character = line[cursor];
      if (character === '"') {
        if (quoted && line[cursor + 1] === '"') { value += '"'; cursor++; }
        else quoted = !quoted;
      } else if (character === ',' && !quoted) { fields.push(value); value = ''; }
      else value += character;
    }
    fields.push(value);
    if (quoted || fields.length !== 9) throw new Error(`资源清单第 ${index + 2} 行列数或引号无效`);
    return Object.fromEntries(HEADER.split(',').map((key, column) => [key, fields[column]]));
  });
}

export function auditRuntimeInventory(workspace = resolve('.')) {
  const csv = readFileSync(resolve(workspace, 'docs/RUNTIME_ASSET_INVENTORY.csv'));
  const rows = parseInventory(csv.toString('utf8'));
  const issues = [], paths = new Set(), categories = {};
  for (const row of rows) {
    const absolute = resolve(workspace, row.path);
    const inside = relative(workspace, absolute);
    if (inside.startsWith('..') || isAbsolute(inside)) { issues.push({ kind: 'outside-workspace', path: row.path }); continue; }
    if (paths.has(row.path)) issues.push({ kind: 'duplicate-path', path: row.path });
    paths.add(row.path);
    if (!existsSync(absolute)) { issues.push({ kind: 'missing', path: row.path }); continue; }
    const bytes = readFileSync(absolute);
    const hash = createHash('sha256').update(bytes).digest('hex');
    if (bytes.length !== Number(row.bytes) || hash !== row.sha256) issues.push({ kind: 'fingerprint', path: row.path, actualBytes: bytes.length, actualSha256: hash });
    if (row.category === 'image') {
      const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
      if (bytes.length < 24 || !bytes.subarray(0, 8).equals(signature)
        || bytes.readUInt32BE(16) !== Number(row.width) || bytes.readUInt32BE(20) !== Number(row.height)) issues.push({ kind: 'png-dimensions', path: row.path });
    }
    const category = categories[row.category] ?? { files: 0, bytes: 0 };
    category.files++; category.bytes += bytes.length; categories[row.category] = category;
  }

  const preloadPath = resolve(workspace, 'src/scenes/PreloadScene.ts');
  const preload = ts.createSourceFile(preloadPath, readFileSync(preloadPath, 'utf8'), ts.ScriptTarget.Latest, true);
  const imported = new Map(), registrations = [];
  const visitPreload = node => {
    if (ts.isImportDeclaration(node) && node.importClause?.name && ts.isStringLiteral(node.moduleSpecifier)) imported.set(node.importClause.name.text, resolve(dirname(preloadPath), node.moduleSpecifier.text));
    if (ts.isCallExpression(node) && node.expression.getText(preload) === 'this.load.image' && node.arguments.length === 2) registrations.push({ key: node.arguments[0].getText(preload), variable: node.arguments[1].getText(preload) });
    ts.forEachChild(node, visitPreload);
  };
  visitPreload(preload);
  const visualsPath = resolve(workspace, 'src/config/uiVisuals.ts');
  const visuals = ts.createSourceFile(visualsPath, readFileSync(visualsPath, 'utf8'), ts.ScriptTarget.Latest, true);
  const uiKeys = [];
  const visitVisuals = node => {
    if (ts.isVariableDeclaration(node) && node.name.getText(visuals) === 'UI_ASSET_KEYS') {
      let initializer = node.initializer;
      while (initializer && ts.isAsExpression(initializer)) initializer = initializer.expression;
      if (!initializer || !ts.isObjectLiteralExpression(initializer)) throw new Error('UI_ASSET_KEYS 必须是显式对象');
      for (const property of initializer.properties) if (ts.isPropertyAssignment(property)) uiKeys.push(`UI_ASSET_KEYS.${property.name.getText(visuals)}`);
    }
    ts.forEachChild(node, visitVisuals);
  };
  visitVisuals(visuals);
  if (uiKeys.length === 0) issues.push({ kind: 'missing-ui-definition' });
  for (const key of uiKeys) {
    const registered = registrations.filter(entry => entry.key === key);
    const inventoried = rows.filter(entry => entry.loader_key === key);
    if (registered.length !== 1 || inventoried.length !== 1 || imported.get(registered[0]?.variable) !== resolve(workspace, inventoried[0]?.path ?? '.')) issues.push({ kind: 'ui-preload-inventory-mismatch', key });
  }
  return { checkedAt: new Date().toISOString(), passed: issues.length === 0, files: rows.length, bytes: Object.values(categories).reduce((total, entry) => total + entry.bytes, 0), categories, uiKeys: uiKeys.length, inventorySha256: createHash('sha256').update(csv).digest('hex'), issues, limits: '字节/尺寸与九个UI的加载接线审计；不替代浏览器解码、音频实听或发布法律判断' };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const report = auditRuntimeInventory();
  if (process.argv[2]) {
    const path = resolve(process.argv[2]); mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
  }
  console.log(JSON.stringify(report, null, 2));
  if (!report.passed) process.exitCode = 1;
}
