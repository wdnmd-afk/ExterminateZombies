import { readFileSync } from 'node:fs';
import { createSourceFile, forEachChild, isMethodDeclaration, ScriptTarget, transpileModule, type MethodDeclaration, type Node } from 'typescript';

const gameSource = createSourceFile('GameScene.ts', readFileSync(new URL('../../src/scenes/GameScene.ts', import.meta.url), 'utf8'), ScriptTarget.Latest, true);

// 执行真实方法并替换外围依赖，仅验证业务接线，不代表浏览器物理或画面验收。
export function sceneMethod(name: string, bindings: Record<string, unknown> = {}, methodSource = gameSource): (...args: unknown[]) => unknown {
  let method: MethodDeclaration | undefined;
  const visit = (node: Node): void => {
    if (isMethodDeclaration(node) && node.name.getText(methodSource) === name) method = node;
    forEachChild(node, visit);
  };
  visit(methodSource);
  if (!method) throw new Error(`场景方法缺失：${name}`);
  const compiled = transpileModule(`class Subject { ${method.getText(methodSource)} }`, { compilerOptions: { target: ScriptTarget.ES2020 } }).outputText;
  return new Function(...Object.keys(bindings), `${compiled}\nreturn Subject.prototype[${JSON.stringify(name)}];`)(...Object.values(bindings));
}
