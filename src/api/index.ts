import type { ElumApi } from './client';
import { HttpApi } from './http/HttpApi';
import { LocalApi } from './local/LocalApi';
import { SupabaseApi } from './supabase/SupabaseApi';

/**
 * The one API instance the app uses:
 * - VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY set: Supabase (see supabase/README.md)
 * - VITE_ELUM_API_URL set: the ELUM API over HTTPS (see docs/API.md)
 * - neither: everything stays in this browser, for previews and development
 */
const env = import.meta.env;
// ELUM runs on one Supabase project, so every build connects to it unless told otherwise. The
// address and publishable key are public (the database's row-level security protects the data).
// Browser-only preview mode is used only in tests, or when VITE_ELUM_PREVIEW=true on purpose.
const ELUM_SUPABASE_URL = 'https://afdnnvngrpdodsfwpaqo.supabase.co';
const ELUM_SUPABASE_KEY = 'sb_publishable_0o6tXC51UwLFHi8j8d9zcQ_xeB1eKyz';
const browserOnly = env.MODE === 'test' || env.VITE_ELUM_PREVIEW === 'true';
const supabaseUrl = browserOnly ? null : env.VITE_SUPABASE_URL?.trim() || ELUM_SUPABASE_URL;
const supabaseKey = browserOnly ? null : env.VITE_SUPABASE_ANON_KEY?.trim() || ELUM_SUPABASE_KEY;
const baseUrl = env.VITE_ELUM_API_URL?.trim();

export const api: ElumApi =
  baseUrl && !env.VITE_SUPABASE_URL ? new HttpApi(baseUrl) : supabaseUrl && supabaseKey ? new SupabaseApi(supabaseUrl, supabaseKey) : new LocalApi();

export * from './types';
export * from './preferences';
export type { ElumApi } from './client';
export { ApiError, errorMessage, isApiError } from './errors';
