import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import {
  createSourceFile,
  forEachChild,
  isCallExpression,
  isImportDeclaration,
  isStringLiteral,
  ScriptTarget,
  type Node,
} from 'typescript';
import { describe, expect, it } from 'vitest';
import { TACTICAL_TEXTURE_KEYS } from '../src/config/tacticalDevices';

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const TACTICAL_FILES: Record<keyof typeof TACTICAL_TEXTURE_KEYS, string> = {
  lure: 'prop-lure-station.png',
  countershot: 'prop-countershot.png',
};
const preloadFile = createSourceFile(
  'PreloadScene.ts',
  readFileSync(new URL('../src/scenes/PreloadScene.ts', import.meta.url), 'utf8'),
  ScriptTarget.Latest,
  true,
);

// 只核对配置常量会漏掉实体使用了纹理却没有预加载的缺陷；语法树也不会把注释当加载调用。
function imageRegistrations(): { key: string; image: string }[] {
  const registrations: { key: string; image: string }[] = [];
  const visit = (node: Node): void => {
    if (isCallExpression(node)
      && node.expression.getText(preloadFile) === 'this.load.image'
      && node.arguments.length === 2) {
      registrations.push({
        key: node.arguments[0].getText(preloadFile),
        image: node.arguments[1].getText(preloadFile),
      });
    }
    forEachChild(node, visit);
  };
  visit(preloadFile);
  return registrations;
}

describe('战术装置与反打弹资产交付', () => {
  it.each(Object.entries(TACTICAL_FILES))('%s 的透明 PNG 存在且采用统一画幅', (_key, fileName) => {
    const buffer = readFileSync(new URL(`../src/assets/processed/environment/${fileName}`, import.meta.url));
    expect(buffer.subarray(0, 8)).toEqual(PNG_MAGIC);
    expect(buffer.subarray(12, 16).toString('ascii')).toBe('IHDR');
    expect(buffer.readUInt32BE(16)).toBe(46);
    expect(buffer.readUInt32BE(20)).toBe(38);
    expect(buffer[25]).toBe(6);
  });

  it.each(Object.entries(TACTICAL_FILES))('%s 的纹理键实际注册到对应文件', (key, fileName) => {
    const assetPath = `../assets/processed/environment/${fileName}`;
    const assetImport = preloadFile.statements.filter(isImportDeclaration).find((statement) => (
      isStringLiteral(statement.moduleSpecifier) && statement.moduleSpecifier.text === assetPath
    ));
    const identifier = assetImport?.importClause?.name?.text;
    expect(identifier, `${fileName} 必须导入预加载场景`).toBeDefined();
    expect(imageRegistrations().filter((entry) => entry.key === `TACTICAL_TEXTURE_KEYS.${key}`)).toEqual([
      { key: `TACTICAL_TEXTURE_KEYS.${key}`, image: identifier },
    ]);
  });

  it('两个纹理键互异，避免后加载的图片覆盖先加载的装置', () => {
    expect(new Set(Object.values(TACTICAL_TEXTURE_KEYS)).size).toBe(Object.keys(TACTICAL_FILES).length);
  });

  it('运行时清单登记实际产物指纹，不把候选原图算成加载资产', () => {
    const inventory = readFileSync(new URL('../docs/RUNTIME_ASSET_INVENTORY.csv', import.meta.url), 'utf8')
      .trim().split(/\r?\n/);
    for (const [key, fileName] of Object.entries(TACTICAL_FILES)) {
      const assetPath = `src/assets/processed/environment/${fileName}`;
      const buffer = readFileSync(new URL(`../${assetPath}`, import.meta.url));
      const fingerprint = createHash('sha256').update(buffer).digest('hex');
      const expectedRow = [
        'image', `TACTICAL_TEXTURE_KEYS.${key}`, assetPath, buffer.length,
        46, 38, fingerprint, 'project-tactical-devices', 'loaded',
      ].join(',');
      expect(inventory.filter((row) => row.split(',')[2] === assetPath)).toEqual([expectedRow]);
    }
  });
});
