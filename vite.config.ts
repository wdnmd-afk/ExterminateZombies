import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  server: {
    port: 5173,
    open: true,
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
});
