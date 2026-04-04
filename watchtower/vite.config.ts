import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { readPanopticonConfig } from './panopticon-config.js';

const config = readPanopticonConfig();

export default defineConfig({
  plugins: [react()],
  server: {
    host: config.watchtower?.host,
    port: config.watchtower?.port,
    proxy: {
      '/api': {
        target: config.watchtower?.apiBaseUrl,
        changeOrigin: true,
      },
    },
  },
});
