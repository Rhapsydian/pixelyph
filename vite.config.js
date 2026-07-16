import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  // GitHub Pages serves this from the pixelyph.com custom domain root (see
  // public/CNAME), so the default build and dev server share the same root
  // base. An itch.io upload is served from an arbitrary per-project path
  // instead, so it needs a relative base like the Electron renderer build
  // already uses (electron.vite.config.mjs) — triggered by `vite build
  // --mode itch`.
  base: mode === 'itch' ? './' : '/',
  server: {
    port: Number(process.env.PORT) || 5174,
    strictPort: false,
  },
}));
