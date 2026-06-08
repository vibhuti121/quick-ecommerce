/// <reference types="vite/client" />

interface ImportMetaEnv {
  // Base URL of the API gateway. Empty = same origin (production) AND recommended for local dev,
  // where the Vite proxy forwards to the HTTPS gateway (https://localhost:8443) — see frontend/.env.example.
  readonly VITE_API_BASE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
