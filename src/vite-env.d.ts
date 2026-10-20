/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base URL of the ELUM API. Unset means the local, in-browser API. */
  readonly VITE_ELUM_API_URL?: string;
  /** Supabase project URL, such as https://abcd.supabase.co. */
  readonly VITE_SUPABASE_URL?: string;
  /** Supabase anon (publishable) key. Safe in the browser; row level security protects the data. */
  readonly VITE_SUPABASE_ANON_KEY?: string;
  /** Parent domain shared by every ELUM service, such as .elum.services. Shares one sign-in across them. */
  readonly VITE_ELUM_COOKIE_DOMAIN?: string;
  /** ELUM Account, such as https://elumaccounts.netlify.app. Set, signing in and account changes go there. */
  readonly VITE_ELUM_ACCOUNT_URL?: string;
  /** Where Write itself is hosted. Defaults to https://elumwrite.netlify.app. */
  readonly VITE_ELUM_WRITE_URL?: string;
  /** Where ELUM Type is hosted. Defaults to https://elumtype.netlify.app. */
  readonly VITE_ELUM_TYPE_URL?: string;
  readonly VITE_ELUM_MAKE_URL?: string;
  readonly VITE_ELUM_BROWSE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
