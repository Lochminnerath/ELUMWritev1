import { ApiError } from './errors';
import type { SignUpInput } from './types';

/** Input rules shared by every API implementation, so they all answer the same way. */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_TITLE = 200;
const MAX_COMMENT = 4000;
export const MIN_PASSWORD = 8;

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
