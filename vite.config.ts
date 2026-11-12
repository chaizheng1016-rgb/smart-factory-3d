import { defineConfig } from 'vite';

export default defineConfig({
  base: '/smart-factory-3d/',
  server: {
    host: '127.0.0.1',
    port: 5173,
  },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1500,
  },
});
