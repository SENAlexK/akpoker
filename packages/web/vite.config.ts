import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { nodePolyfills } from 'vite-plugin-node-polyfills';

const API_TARGET = process.env.VITE_API_TARGET ?? 'http://localhost:3001';

export default defineConfig({
  // streamx (via @thaunknown/simple-peer) needs Node's `events` in the browser.
  plugins: [react(), tailwindcss(), nodePolyfills({ include: ['events'] })],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: API_TARGET, changeOrigin: true },
      '/socket.io': { target: API_TARGET, ws: true, changeOrigin: true },
    },
  },
  build: { outDir: 'dist', sourcemap: true },
});
