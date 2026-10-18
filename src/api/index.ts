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
const supabaseUrl = env.VITE_SUPABASE_URL?.trim();
const supabaseKey = env.VITE_SUPABASE_ANON_KEY?.trim();
const baseUrl = env.VITE_ELUM_API_URL?.trim();

export const api: ElumApi =
  supabaseUrl && supabaseKey ? new SupabaseApi(supabaseUrl, supabaseKey) : baseUrl ? new HttpApi(baseUrl) : new LocalApi();

export * from './types';
export * from './preferences';
export type { ElumApi } from './client';
export { ApiError, errorMessage, isApiError } from './errors';
