import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

// The admin app ships as an nginx image that serves dist/ and reverse-proxies /admin/orders to
// order-service AND /api/* + /auth/* to the gateway (same-origin), all behind basic-auth. For local
// `vite dev` outside docker there is no reachable backend, so dev proxying is left out deliberately —
// the container is the supported run path. Build output is what the QA gate checks.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
});
