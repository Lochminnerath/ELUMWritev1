/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base URL of the ELUM API. Unset means the local, in-browser API. */
  readonly VITE_ELUM_API_URL?: string;
  /** Supabase project URL, such as https://abcd.supabase.co. */
  readonly VITE_SUPABASE_URL?: string;
  /** Supabase anon (publishable) key. Safe in the browser; row level security protects the data. */
  readonly VITE_SUPABASE_ANON_KEY?: string;
  /** Parent domain shared by every ELUM service, such as .elum.example. Shares one sign-in across them. */
  readonly VITE_ELUM_COOKIE_DOMAIN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
