import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';

const root = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  main: {
    build: {
      outDir: 'out/main',
      rollupOptions: { input: resolve(root, 'electron/main/index.js') },
    },
    plugins: [externalizeDepsPlugin()],
  },
  preload: {
    build: {
      outDir: 'out/preload',
      rollupOptions: { input: resolve(root, 'electron/preload/index.js') },
    },
    plugins: [externalizeDepsPlugin()],
  },
  renderer: {
    // Reuse the project's existing root-level index.html/src/ layout — the
    // same renderer source vite.config.js builds for the web target —
    // rather than moving everything under a src/renderer/ electron-vite
    // convention. Loaded via file:// once packaged, so assets need
    // relative paths, unlike the web build's GitHub Pages '/pixelyph/' base.
    root: '.',
    base: './',
    build: {
      outDir: 'out/renderer',
      rollupOptions: { input: resolve(root, 'index.html') },
    },
    plugins: [react()],
    server: {
      port: Number(process.env.PORT) || 5174,
    },
  },
});
