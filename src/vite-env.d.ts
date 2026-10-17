/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Developer override only — never surfaced to a user. See api.ts. */
  readonly VITE_ONECON_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
