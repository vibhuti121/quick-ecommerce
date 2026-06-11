import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // The gateway terminates TLS with a dev self-signed cert (Pillar 4), so target HTTPS on 8443
      // and disable cert verification for the local proxy (secure: false). Auth/login routes too.
      '/api': { target: 'https://localhost:8443', changeOrigin: true, secure: false },
      '/auth': { target: 'https://localhost:8443', changeOrigin: true, secure: false },
      // Socket.IO for the live call rides the same gateway; ws:true upgrades the connection so the
      // WebSocket transport works through the dev proxy (signaling-service behind /socket.io/**).
      '/socket.io': { target: 'https://localhost:8443', changeOrigin: true, secure: false, ws: true },
    },
  },
});
