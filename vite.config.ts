import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Service worker registration is done manually from main.tsx so we keep the
// build config minimal and dependency-light.
export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
  },
  build: {
    target: 'es2020',
    sourcemap: true,
  },
});
