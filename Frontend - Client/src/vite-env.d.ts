/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_ALPHA_VANTAGE_API_KEY: string;
  readonly VITE_MT5_BRIDGE_URL: string;
  // Base URL of the main backend (auth, chat, usage, dst) — NOT mt5-bridge.
  // e.g. http://localhost:3000 in dev.
  readonly VITE_API_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
