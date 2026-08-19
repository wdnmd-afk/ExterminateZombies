import { defineConfig, loadEnv } from 'vite';

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
  };
});
