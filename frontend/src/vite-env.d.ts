/// <reference types="vite/client" />

interface ImportMetaEnv {
  // Base URL of the API gateway. Empty = same origin (production, served behind Caddy).
  // For local dev set this to the gateway URL, e.g. http://localhost:8088 — see frontend/.env.example.
  readonly VITE_API_BASE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
