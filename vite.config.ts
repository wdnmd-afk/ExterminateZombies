// defineConfig 取自 `vitest/config` 而不是 `vite`：它是同一个函数的再导出，
// 但额外带上 `test` 字段的类型，否则下面的测试配置过不了 `tsc --noEmit`
// （本文件在 tsconfig 的 include 里）。`loadEnv` 仍从 `vite` 取，保持来源明确。
import { defineConfig } from 'vitest/config';
import { loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', 'IMAGE_API_');
  const imageApiPort = Number(env.IMAGE_API_PORT || 8787);

  return {
    base: './',
    server: {
      port: 5173,
      open: true,
      proxy: {
        '/api': `http://127.0.0.1:${imageApiPort}`,
      },
      watch: {
        // 忽略 CDP 调试用的 Chrome 用户资料目录:它会持续写入且含无法 lstat 的临时文件,
        // 否则 vite 的文件监视器会因 lstat 失败抛未捕获异常整体崩溃。
        ignored: ['**/.chrome-debug/**'],
      },
    },
    build: {
      target: 'es2020',
      outDir: 'dist',
    },
    test: {
      /**
       * 只把 `.test.ts` 交给 vitest。
       *
       * `tests/image-api.test.mjs` 用 Node 内置的 `node:test` 写，由独立脚本
       * `npm run test:image-api` 执行。在没有本配置之前，vitest 的默认 include
       * 会把它一起扫进来，而它没有 vitest 的 `describe`/`it`，于是 vitest 报
       * `No test suite found in file`——`npm test` 因此恒定红一条，其余 27 个文件
       * 全部通过。用 include 白名单而不是 exclude 单个文件：新增 node:test 用例
       * 时不必再回来改这里，两套 runner 的边界由扩展名自然划分。
       */
      include: ['tests/**/*.test.ts'],
    },
  };
});
