import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ command, mode, isPreview }) => ({
  plugins: [react()],
  // GitHub Pages project sites serve from /<repo>/, not the domain root.
  // `vite preview` re-serves the already-built dist output (which has that
  // prefix baked into its asset URLs), so it needs the same base as the
  // build itself — only the dev server should serve at localhost's root.
  // An itch.io upload is served from an arbitrary per-project path instead,
  // so it needs a relative base like the Electron renderer build already
  // uses (electron.vite.config.mjs) — triggered by `vite build --mode itch`.
  base: mode === 'itch' ? './' : command === 'build' || isPreview ? '/pixelyph/' : '/',
  server: {
    port: Number(process.env.PORT) || 5174,
    strictPort: false,
  },
}));
