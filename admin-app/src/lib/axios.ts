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

// Attach the in-memory bearer token to every request. Do NOT force a JSON Content-Type here — that
// would break multipart uploads (axios sets the correct boundary itself when the body is FormData).
api.interceptors.request.use((config) => {
  const token = authStore.getState().token;
  if (token) {
    config.headers.set('Authorization', `Bearer ${token}`);
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
