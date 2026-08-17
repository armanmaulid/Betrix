/// <reference types="vite/client" />

interface ImportMetaEnv {
  // Base URL of the main backend (auth, chat, usage, dst) — NOT mt5-bridge.
  // e.g. http://localhost:3000 in dev.
  readonly VITE_API_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
