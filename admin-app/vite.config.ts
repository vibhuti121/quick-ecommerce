import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The admin app ships as an nginx image that serves dist/ and reverse-proxies /admin/orders to
// order-service on the docker network (injecting X-User-Role: ADMIN). For local `vite dev` outside
// docker there is no reachable order-service (it publishes no host port), so dev proxying is left out
// deliberately — the container is the supported run path. Build output is what the QA gate checks.
export default defineConfig({
  plugins: [react()],
});
