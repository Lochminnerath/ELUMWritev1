import type { ElumApi } from '../client';
import { ApiError, type ApiErrorCode } from '../errors';
import { normalizePreferences, type Preferences } from '../preferences';
import { tokenStore } from '../tokenStore';
import type {
  Asset,
  CommentThread,
  DocNode,
  DocumentFilter,
  DocumentRecord,
  DocumentSummary,
  Invite,
  NewComment,
  PublicUser,
  SaveDocumentInput,
  SaveResult,
  Session,
  Share,
  ShareByEmailResult,
  ShareRole,
  SignInInput,
  SignUpInput,
  User,
} from '../types';

const KNOWN_CODES = new Set<ApiErrorCode>([
  'unauthorized',
  'invalid_credentials',
  'email_taken',
  'invalid',
  'forbidden',
  'not_found',
  'conflict',
  'too_large',
  'storage_full',
  'server',
]);

/**
 * The ELUM API over HTTPS. Endpoints and payloads are described in
 * docs/API.md. Errors come back as `{ error: { code, message, details } }`.
 */
export class HttpApi implements ElumApi {
  readonly mode = 'remote' as const;
  private readonly unauthorizedHandlers = new Set<() => void>();

  constructor(private readonly baseUrl: string) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
  }

  // ---------------------------------------------------------------- sessions

  async restoreSession(): Promise<Session | null> {
    if (!tokenStore.get()) return null;
    try {
      return await this.request<Session>('GET', '/auth/session', undefined, { quiet: true });
    } catch (error) {
      if (error instanceof ApiError && error.code === 'unauthorized') {
        tokenStore.clear();
        return null;
      }
      throw error;
    }
  }

  async signUp(input: SignUpInput): Promise<Session> {
    const session = await this.request<Session>('POST', '/auth/signup', input, { quiet: true });
    tokenStore.set(session.token);
    return session;
  }

  async signIn(input: SignInInput): Promise<Session> {
    const session = await this.request<Session>('POST', '/auth/signin', input, { quiet: true });
    tokenStore.set(session.token);
    return session;
  }

  async signOut(): Promise<void> {
    try {
      await this.request('POST', '/auth/signout', undefined, { quiet: true });
    } finally {
      tokenStore.clear();
    }
  }

  updateProfile(input: { name: string }): Promise<User> {
    return this.request('PATCH', '/me', input);
  }

  async getPreferences(): Promise<Preferences> {
    return normalizePreferences(await this.request('GET', '/me/preferences'));
  }

  async updatePreferences(patch: Partial<Preferences>): Promise<Preferences> {
    return normalizePreferences(await this.request('PATCH', '/me/preferences', patch));
  }

  onUnauthorized(handler: () => void): () => void {
    this.unauthorizedHandlers.add(handler);
    return () => this.unauthorizedHandlers.delete(handler);
  }

  // ------------------------------------------------------------------ people

  searchUsers(query: string): Promise<PublicUser[]> {
    return this.request('GET', `/users/search?q=${encodeURIComponent(query)}`);
  }

  // --------------------------------------------------------------- documents

  listDocuments(filter: DocumentFilter = 'all'): Promise<DocumentSummary[]> {
    return this.request('GET', `/documents?filter=${filter}`);
  }

  createDocument(input: { title?: string; content?: DocNode } = {}): Promise<DocumentRecord> {
    return this.request('POST', '/documents', input);
  }

  getDocument(id: string): Promise<DocumentRecord> {
    return this.request('GET', `/documents/${enc(id)}`);
  }

  renameDocument(id: string, title: string): Promise<DocumentSummary> {
    return this.request('PATCH', `/documents/${enc(id)}`, { title });
  }

  saveDocument(id: string, input: SaveDocumentInput): Promise<SaveResult> {
    return this.request('PUT', `/documents/${enc(id)}/content`, input);
  }

  duplicateDocument(id: string): Promise<DocumentRecord> {
    return this.request('POST', `/documents/${enc(id)}/copy`);
  }

  deleteDocument(id: string): Promise<void> {
    return this.request('DELETE', `/documents/${enc(id)}`);
  }

  leaveDocument(id: string): Promise<void> {
    return this.request('DELETE', `/documents/${enc(id)}/shares/me`);
  }

  // ----------------------------------------------------------------- sharing

  listShares(docId: string): Promise<Share[]> {
    return this.request('GET', `/documents/${enc(docId)}/shares`);
  }

  setShare(docId: string, userId: string, role: ShareRole): Promise<Share> {
    return this.request('PUT', `/documents/${enc(docId)}/shares/${enc(userId)}`, { role });
  }

  removeShare(docId: string, userId: string): Promise<void> {
    return this.request('DELETE', `/documents/${enc(docId)}/shares/${enc(userId)}`);
  }

  shareByEmail(docId: string, email: string, role: ShareRole): Promise<ShareByEmailResult> {
    return this.request('POST', `/documents/${enc(docId)}/shares/by-email`, { email, role });
  }

  listInvites(docId: string): Promise<Invite[]> {
    return this.request('GET', `/documents/${enc(docId)}/invites`);
  }

  removeInvite(docId: string, email: string): Promise<void> {
    return this.request('DELETE', `/documents/${enc(docId)}/invites/${enc(email.trim().toLowerCase())}`);
  }

  // ---------------------------------------------------------------- comments

  listComments(docId: string): Promise<CommentThread[]> {
    return this.request('GET', `/documents/${enc(docId)}/comments`);
  }

  addComment(docId: string, input: NewComment): Promise<CommentThread> {
    return this.request('POST', `/documents/${enc(docId)}/comments`, input);
  }

  replyToComment(docId: string, commentId: string, body: string): Promise<CommentThread> {
    return this.request('POST', `/documents/${enc(docId)}/comments/${enc(commentId)}/replies`, { body });
  }

  setCommentResolved(docId: string, commentId: string, resolved: boolean): Promise<CommentThread> {
    return this.request('PATCH', `/documents/${enc(docId)}/comments/${enc(commentId)}`, { resolved });
  }

  deleteComment(docId: string, commentId: string): Promise<void> {
    return this.request('DELETE', `/documents/${enc(docId)}/comments/${enc(commentId)}`);
  }

  // ------------------------------------------------------------------ assets

  uploadAsset(docId: string, file: Blob): Promise<Asset> {
    const form = new FormData();
    form.append('file', file);
    return this.request('POST', `/documents/${enc(docId)}/assets`, form);
  }

  async resolveAssetUrl(src: string): Promise<string> {
    // The API returns signed, directly loadable URLs.
    return src;
  }

  async fetchAsset(src: string): Promise<Blob> {
    const response = await fetch(src);
    if (!response.ok) throw new ApiError('not_found', 'That image could not be loaded.');
    return response.blob();
  }

  // ----------------------------------------------------------------- request

  private async request<T>(method: string, path: string, body?: unknown, opts: { quiet?: boolean } = {}): Promise<T> {
    const headers: Record<string, string> = { Accept: 'application/json' };
    const token = tokenStore.get();
    if (token) headers.Authorization = `Bearer ${token}`;
    let payload: BodyInit | undefined;
    if (body instanceof FormData) payload = body;
    else if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
      payload = JSON.stringify(body);
    }

    let response: Response;
    try {
      response = await fetch(this.baseUrl + path, { method, headers, body: payload, credentials: 'omit' });
    } catch {
      throw new ApiError('network', 'We could not reach ELUM. Check your connection and try again.');
    }

    if (response.status === 204) return undefined as T;
    const data = await response.json().catch(() => null);
    if (response.ok) return data as T;

    const err = data?.error ?? {};
    const code: ApiErrorCode = KNOWN_CODES.has(err.code) ? err.code : response.status === 401 ? 'unauthorized' : 'server';
    if (code === 'unauthorized' && !opts.quiet) {
      tokenStore.clear();
      this.unauthorizedHandlers.forEach((h) => h());
    }
    throw new ApiError(code, typeof err.message === 'string' ? err.message : 'Something went wrong. Please try again.', err.details);
  }
}

const enc = encodeURIComponent;
