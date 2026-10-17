import type { ElumApi } from './client';
import { HttpApi } from './http/HttpApi';
import { LocalApi } from './local/LocalApi';

/**
 * The one API instance the app uses. Set VITE_ELUM_API_URL to talk to the
 * ELUM API; leave it unset to keep everything in this browser.
 */
const baseUrl = import.meta.env.VITE_ELUM_API_URL?.trim();

export const api: ElumApi = baseUrl ? new HttpApi(baseUrl) : new LocalApi();

export * from './types';
export type { ElumApi } from './client';
export { ApiError, errorMessage, isApiError } from './errors';
