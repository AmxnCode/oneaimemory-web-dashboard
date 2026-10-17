import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // The dashboard is served under /app in production — / is the marketing
  // landing page (see backend/src/app.ts). Asset URLs need this prefix baked
  // in at build time so they resolve correctly once mounted there.
  base: '/app/',
  server: {
    port: 5173,
    // Must match backend CORS_ORIGINS.
    strictPort: true,
  },
  build: { outDir: 'dist', sourcemap: true },
});
