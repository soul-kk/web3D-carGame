import { defineConfig } from 'vite';

export default defineConfig({
  // 用相对路径打包，方便把 dist/ 丢到任意静态目录里
  base: './',
  server: { open: false, port: 5173 },
  build: { target: 'es2020', outDir: 'dist' },
});
