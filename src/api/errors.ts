export type ApiErrorCode =
  | 'unauthorized'
  | 'invalid_credentials'
  | 'confirm_email'
  | 'email_taken'
  | 'invalid'
  | 'forbidden'
  | 'not_found'
  | 'conflict'
  | 'too_large'
  | 'storage_full'
  | 'rate_limited'
  | 'network'
  | 'approval_required'
  | 'server';

const STATUS: Record<ApiErrorCode, number> = {
  unauthorized: 401,
  invalid_credentials: 401,
  confirm_email: 202,
  email_taken: 409,
  invalid: 400,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  too_large: 413,
  storage_full: 507,
  rate_limited: 429,
  network: 0,
  approval_required: 403,
  server: 500,
};

export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly status: number;
  /** Extra data, such as the current version on a conflict. */
  readonly details?: Record<string, unknown>;

  constructor(code: ApiErrorCode, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = STATUS[code];
    this.details = details;
  }
}

export function isApiError(error: unknown, code?: ApiErrorCode): error is ApiError {
  return error instanceof ApiError && (code === undefined || error.code === code);
}

/** A sentence that is safe to show to people. */
export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  return 'Something went wrong. Please try again.';
}
