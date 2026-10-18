import { ApiError } from './errors';
import type { SignUpInput } from './types';

/** Input rules shared by every API implementation, so they all answer the same way. */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_TITLE = 200;
const MAX_COMMENT = 4000;
export const MIN_PASSWORD = 8;
const HANDLE_RE = /^[a-z0-9](?:[a-z0-9._-]{1,28}[a-z0-9])?$/;
const RESERVED_HANDLES = new Set([
  'admin', 'administrator', 'elum', 'support', 'help', 'security', 'abuse', 'postmaster', 'hostmaster', 'webmaster',
  'noreply', 'no-reply', 'mailer-daemon', 'root', 'system', 'write', 'type', 'browse', 'make', 'store', 'billing',
  'privacy', 'legal', 'team', 'hello',
]);

/** Why a Type address name cannot be used, or null when its format is fine (it may still be taken). Matches the database. */
export function handleProblem(raw: string): string | null {
  const handle = raw.trim().toLowerCase();
  if (handle.length < 3) return 'Use at least 3 characters.';
  if (handle.length > 30) return 'Use at most 30 characters.';
  if (!/^[a-z0-9._-]+$/.test(handle)) return 'Use letters, numbers, dots, dashes or underscores.';
  if (!HANDLE_RE.test(handle)) return 'Start and end with a letter or number.';
  if (/[._-]{2}/.test(handle)) return 'Do not put two symbols in a row.';
  if (RESERVED_HANDLES.has(handle)) return 'That name is not available.';
  return null;
}

export function isEmail(value: string): boolean {
  return EMAIL_RE.test(value.trim());
}

export function checkSignUp(input: SignUpInput): SignUpInput {
  const name = input.name.trim();
  const email = input.email.trim();
  if (!name) throw new ApiError('invalid', 'Enter your name.', { field: 'name' });
  if (!EMAIL_RE.test(email)) throw new ApiError('invalid', 'Enter a valid email address.', { field: 'email' });
  if (input.password.length < MIN_PASSWORD) {
    throw new ApiError('invalid', `Use at least ${MIN_PASSWORD} characters for your password.`, { field: 'password' });
  }
  return { name, email, password: input.password };
}

export function cleanName(name: string): string {
  const value = name.trim();
  if (!value) throw new ApiError('invalid', 'Enter your name.', { field: 'name' });
  return value.slice(0, 80);
}

export function cleanTitle(title: string | undefined): string {
  const t = (title ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_TITLE);
  return t || 'Untitled document';
}

export function cleanComment(body: string): string {
  const text = body.trim();
  if (!text) throw new ApiError('invalid', 'Write something first.');
  if (text.length > MAX_COMMENT) throw new ApiError('invalid', 'Comments can be up to 4,000 characters.');
  return text;
}
