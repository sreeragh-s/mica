/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Same base URL as Worker `BETTER_AUTH_URL` (used in UI hints only; auth runs in the main process). */
  readonly VITE_AUTH_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
