/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base URL of the ELUM API. Unset means the local, in-browser API. */
  readonly VITE_ELUM_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
