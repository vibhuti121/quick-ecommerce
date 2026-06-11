import axios from 'axios';
import { authStore } from '@/stores/authStore';

/**
 * Same-origin Axios client. nginx in the admin-app container reverse-proxies `/api/*` + `/auth/*`
 * to the gateway over TLS server-side (proxy_ssl_verify off), so the browser only ever speaks plain
 * HTTP to its own loopback origin — no CORS, no self-signed-cert prompt. baseURL is therefore empty.
 */
export const api = axios.create({
  baseURL: '',
  headers: { Accept: 'application/json' },
});

// Attach the in-memory bearer token to every request in a CUSTOM header, NOT `Authorization`. The
// admin-app's nginx puts the whole console behind HTTP Basic auth, and the browser carries those
// Basic credentials in the `Authorization` header automatically. If we set `Authorization: Bearer`
// here it would OVERRIDE the cached Basic header, so post-login data calls would reach nginx with a
// Bearer it can't validate as Basic → 401 → the interceptor below logs out → login-bounce loop.
// Instead we send `X-Access-Token`; nginx (same-origin, no CORS preflight) rebuilds
// `Authorization: Bearer <token>` for the gateway hop. Do NOT force a JSON Content-Type here — that
// would break multipart uploads (axios sets the correct boundary itself when the body is FormData).
api.interceptors.request.use((config) => {
  const token = authStore.getState().token;
  if (token) {
    config.headers.set('X-Access-Token', token);
  }
  return config;
});

// A rejected/expired token is unrecoverable in-app: drop it and let ProtectedRoute bounce to /login.
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error?.response?.status;
    if (status === 401 || status === 403) {
      authStore.getState().logout();
    }
    return Promise.reject(error);
  },
);
