import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Service worker registration is done manually from main.tsx so we keep the
// build config minimal and dependency-light.
//
// `base` is configurable so the same build can target:
//   - GitHub Pages project site:    BASE=/audio-sampling-machine/  (default for build)
//   - Custom domain / root deploy:  BASE=/
//   - Local dev:                    /
//
// All in-app paths use `import.meta.env.BASE_URL`, and the manifest / SW
// use paths relative to their own location, so changing `base` is sufficient.
export default defineConfig(({ command }) => ({
  plugins: [react()],
  base: process.env.BASE ?? (command === 'build' ? '/audio-sampling-machine/' : '/'),
  server: {
    host: true,
    port: 5173,
  },
  build: {
    target: 'es2020',
    sourcemap: true,
  },
}));
