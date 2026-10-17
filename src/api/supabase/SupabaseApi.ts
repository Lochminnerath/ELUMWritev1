import { createClient, type Session as AuthSession, type SupabaseClient } from '@supabase/supabase-js';
import { ACCEPTED_IMAGE_TYPES, MAX_ASSET_BYTES, type ElumApi, type NotificationsApi } from '../client';
import { buildPreview, COMMENT_MARK, emptyDocument, stripMarks, SUPABASE_ASSET_PREFIX } from '../content';
import { ApiError } from '../errors';
import { cookieStorage } from './cookieStorage';
import { cleanPreferencesPatch, normalizePreferences, type Preferences } from '../preferences';
import type {
  AppNotification,
  Asset,
  CommentThread,
  DocNode,
  DocumentFilter,
  DocumentRecord,
  DocumentSummary,
  Invite,
  NewComment,
  PreviewBlock,
  PublicUser,
  Role,
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
import { checkSignUp, cleanComment, cleanName, cleanTitle } from '../validation';
import { welcomeDocument } from '../welcome';

/**
 * The ELUM API on Supabase: Auth for accounts, Postgres (with the row level
 * security in supabase/migrations) for documents, sharing and comments, and
 * Storage for images. The database enforces every permission; this class
 * shapes requests and turns errors into ApiErrors.
 */

const BUCKET = 'assets';
const SIGNED_URL_SECONDS = 60 * 60;

const PERSON = 'id, name, email, color';
const SUMMARY = `id, title, owner_id, created_at, updated_at, preview,
  owner:profiles!documents_owner_id_fkey(${PERSON}),
  updater:profiles!documents_updated_by_fkey(${PERSON}),
  document_shares(user_id, role),
  document_opens(user_id, opened_at)`;
const RECORD = `${SUMMARY}, content, version`;
const SHARE = `user_id, role, added_at,
  user:profiles!document_shares_user_id_fkey(${PERSON}),
  adder:profiles!document_shares_added_by_fkey(${PERSON})`;
const INVITE = `email, role, invited_at, inviter:profiles!document_invites_invited_by_fkey(${PERSON})`;
const PROFILE = `${PERSON}, account_type, welcomed, created_at`;
const THREAD = `id, doc_id, body, quote, created_at, resolved, resolved_at,
  author:profiles!comments_author_id_fkey(${PERSON}),
  resolver:profiles!comments_resolved_by_fkey(${PERSON}),
  comment_replies(id, body, created_at, author:profiles!comment_replies_author_id_fkey(${PERSON}))`;

interface ProfileRow extends PublicUser {
  account_type: 'type' | 'external';
  welcomed: boolean;
  created_at: string;
}

interface DocRow {
  id: string;
  title: string;
  owner_id: string;
  created_at: string;
  updated_at: string;
  preview: PreviewBlock[] | null;
  owner: PublicUser | null;
  updater: PublicUser | null;
  document_shares: { user_id: string; role: ShareRole }[];
  document_opens: { user_id: string; opened_at: string }[];
  content?: DocNode;
  version?: number;
}

interface ShareRow {
  user_id: string;
  role: ShareRole;
  added_at: string;
  user: PublicUser | null;
  adder: PublicUser | null;
}

interface InviteRow {
  email: string;
  role: ShareRole;
  invited_at: string;
  inviter: PublicUser | null;
}

interface ThreadRow {
  id: string;
  doc_id: string;
  body: string;
  quote: string;
  created_at: string;
  resolved: boolean;
  resolved_at: string | null;
  author: PublicUser | null;
  resolver: PublicUser | null;
  comment_replies: { id: string; body: string; created_at: string; author: PublicUser | null }[];
}

/** What Supabase and PostgREST put in their errors. */
interface RawError {
  code?: string;
  message?: string;
  details?: string | null;
  status?: number;
  statusCode?: string | number;
  name?: string;
}

const FORMER_MEMBER: PublicUser = { id: '', name: 'Former member', email: '', color: '#a3aac0' };
const person = (p: PublicUser | null): PublicUser => p ?? FORMER_MEMBER;

/** Translates Supabase errors into the app's error codes and plain messages. */
export function toApiError(error: RawError | null | undefined, fallback = 'Something went wrong. Please try again.'): ApiError {
  const code = String(error?.code ?? '');
  const status = Number(error?.status ?? error?.statusCode ?? 0);
  const message = error?.message ?? '';
  // Our own database functions raise PostgREST status codes with readable messages.
  if (code === 'PT409') return new ApiError('conflict', message, { version: Number(error?.details) });
  if (code === 'PT403') return new ApiError('forbidden', message);
  if (code === 'PT404') return new ApiError('not_found', message);
  if (code === 'PT400') return new ApiError('invalid', message);
  if (code === 'PT429' || status === 429) return new ApiError('rate_limited', message || 'Too many requests. Wait a little and try again.');
  if (code === 'PT401' || code === 'PGRST301' || code === 'PGRST303' || status === 401) {
    return new ApiError('unauthorized', 'Your session has ended. Sign in again.');
  }
  if (code === '42501' || status === 403) return new ApiError('forbidden', 'You do not have permission to do that.');
  if (code === 'PGRST116' || code === '22P02') return new ApiError('not_found', 'This document does not exist or was deleted.');
  if (code === '23505') return new ApiError('invalid', 'That already exists.');
  if (code === '23514' || code === '23502') return new ApiError('invalid', 'Some of that is not allowed. Check it and try again.');
  if (status === 413 || /exceeded the maximum allowed size/i.test(message)) return new ApiError('too_large', 'Images can be up to 15 MB.');
  if (error?.name === 'AuthRetryableFetchError' || /failed to fetch|network/i.test(message)) {
    return new ApiError('network', 'We could not reach ELUM. Check your connection and try again.');
  }
  return new ApiError('server', fallback);
}

function must<T>(result: { data: T | null; error: RawError | null }, fallback?: string): T {
  if (result.error) throw toApiError(result.error, fallback);
  if (result.data === null) throw new ApiError('not_found', 'This document does not exist or was deleted.');
  return result.data;
}

export class SupabaseApi implements ElumApi {
  readonly mode = 'remote' as const;
  readonly sb: SupabaseClient;
  private readonly unauthorizedHandlers = new Set<() => void>();
  private readonly signedUrls = new Map<string, { url: string; expires: number }>();

  constructor(url: string, anonKey: string, client?: SupabaseClient) {
    // With VITE_ELUM_COOKIE_DOMAIN set (such as .elum.example), the session lives in cookies on
    // that domain, so one sign-in covers every ELUM service. Otherwise it stays in this site's storage.
    const cookieDomain = import.meta.env.VITE_ELUM_COOKIE_DOMAIN?.trim();
    this.sb =
      client ??
      createClient(url, anonKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
          ...(cookieDomain ? { storageKey: 'elum-auth', storage: cookieStorage({ domain: cookieDomain, secure: location.protocol === 'https:' }) } : {}),
        },
      });
    this.sb.auth.onAuthStateChange((event) => {
      // Covers expiry, revocation and signing out in another tab.
      if (event === 'SIGNED_OUT') {
        this.signedUrls.clear();
        this.unauthorizedHandlers.forEach((h) => h());
      }
    });
  }

  /** Notifications from every ELUM service (see supabase/migrations/*_elum_platform.sql). */
  readonly notifications: NotificationsApi = {
    list: async ({ before, unreadOnly = false, limit = 30 } = {}) => {
      await this.me();
      const { data, error } = await this.sb.rpc('elum_notifications', { p_limit: limit, p_before: before ?? null, p_unread_only: unreadOnly });
      if (error) throw toApiError(error);
      return ((data ?? []) as NotificationRow[]).map(toNotification);
    },
    markRead: async (ids) => {
      await this.me();
      const { error } = await this.sb.rpc('elum_mark_notifications_read', { p_ids: ids ?? null });
      if (error) throw toApiError(error);
    },
    subscribe: (onNew) => {
      let channel: ReturnType<SupabaseClient['channel']> | null = null;
      let stopped = false;
      void this.sb.auth.getSession().then(({ data }) => {
        const me = data.session?.user.id;
        if (!me || stopped) return;
        channel = this.sb
          .channel(`elum-notifications-${me}`)
          .on(
            'postgres_changes',
            { event: 'INSERT', schema: 'elum', table: 'notifications', filter: `account_id=eq.${me}` },
            (change) => {
              const row = change.new as Record<string, unknown>;
              onNew(
                toNotification({
                  id: String(row.id),
                  service_id: String(row.service_id),
                  type: String(row.type),
                  title: String(row.title),
                  body: (row.body as string | null) ?? null,
                  link: (row.link as string | null) ?? null,
                  created_at: String(row.created_at),
                  read_at: null,
                  actor: null,
                }),
              );
            },
          )
          .subscribe();
      });
      return () => {
        stopped = true;
        if (channel) void this.sb.removeChannel(channel);
      };
    },
  };

  // ---------------------------------------------------------------- sessions

  async restoreSession(): Promise<Session | null> {
    const { data, error } = await this.sb.auth.getSession();
    if (error || !data.session) return null;
    try {
      return await this.sessionFor(data.session);
    } catch (e) {
      if (e instanceof ApiError && (e.code === 'unauthorized' || e.code === 'not_found')) return null;
      throw e;
    }
  }

  async signUp(input: SignUpInput): Promise<Session> {
    const { name, email, password } = checkSignUp(input);
    const { data, error } = await this.sb.auth.signUp({
      email,
      password,
      // Type accounts come with ELUM's own inbox, which is not built yet; everyone signs up with their own email.
      options: { data: { name, account_type: 'external' }, emailRedirectTo: `${window.location.origin}/` },
    });
    if (error) {
      if (error.code === 'user_already_exists' || error.code === 'email_exists') {
        throw new ApiError('email_taken', 'An account with this email already exists. Sign in instead.', { field: 'email' });
      }
      if (error.code === 'weak_password') throw new ApiError('invalid', error.message, { field: 'password' });
      if (error.code === 'email_address_invalid') throw new ApiError('invalid', 'Enter a valid email address.', { field: 'email' });
      if (error.code === 'over_email_send_rate_limit' || error.status === 429) {
        throw new ApiError('invalid', 'Too many attempts. Wait a minute and try again.');
      }
      throw toApiError(error);
    }
    // With email confirmation on, there is no session until the link is followed.
    if (!data.session) {
      throw new ApiError('confirm_email', `We sent a link to ${email}. Open it to confirm your email, then sign in.`);
    }
    return this.sessionFor(data.session);
  }

  async signIn(input: SignInInput): Promise<Session> {
    const { data, error } = await this.sb.auth.signInWithPassword({ email: input.email.trim(), password: input.password });
    if (error) {
      if (error.code === 'email_not_confirmed') {
        throw new ApiError('confirm_email', 'Confirm your email first. We sent you a link when you signed up.');
      }
      if (error.code === 'invalid_credentials' || error.status === 400) {
        throw new ApiError('invalid_credentials', 'That email and password do not match.');
      }
      throw toApiError(error);
    }
    return this.sessionFor(data.session);
  }

  async signOut(): Promise<void> {
    this.signedUrls.clear();
    await this.sb.auth.signOut();
  }

  async updateProfile(input: { name: string }): Promise<User> {
    const me = await this.me();
    const row = must(
      await this.sb.from('profiles').update({ name: cleanName(input.name) }).eq('id', me).select(PROFILE).single<ProfileRow>(),
    );
    return toUser(row);
  }

  async getPreferences(): Promise<Preferences> {
    const me = await this.me();
    const { data, error } = await this.sb.from('user_preferences').select('preferences').eq('user_id', me).maybeSingle<{ preferences: unknown }>();
    if (error) throw toApiError(error);
    return normalizePreferences(data?.preferences);
  }

  async updatePreferences(patch: Partial<Preferences>): Promise<Preferences> {
    await this.me();
    // Merged on the server, so two devices changing different settings do not undo each other.
    const { data, error } = await this.sb.rpc('update_preferences', { patch: cleanPreferencesPatch(patch) });
    if (error) throw toApiError(error);
    return normalizePreferences(data);
  }

  onUnauthorized(handler: () => void): () => void {
    this.unauthorizedHandlers.add(handler);
    return () => this.unauthorizedHandlers.delete(handler);
  }

  // ------------------------------------------------------------------ people

  async searchUsers(query: string): Promise<PublicUser[]> {
    await this.me();
    if (query.trim().length < 2) return [];
    const { data, error } = await this.sb.rpc('search_users', { q: query.trim() });
    if (error) throw toApiError(error);
    return (data ?? []) as PublicUser[];
  }

  // --------------------------------------------------------------- documents

  async listDocuments(filter: DocumentFilter = 'all'): Promise<DocumentSummary[]> {
    const me = await this.me();
    const rows = must(await this.sb.from('documents').select(SUMMARY).order('updated_at', { ascending: false }).returns<DocRow[]>());
    return rows
      .map((row) => summarize(row, me))
      .filter((d) => filter === 'all' || (filter === 'owned' ? d.role === 'owner' : d.role !== 'owner'))
      .sort((a, b) => recency(b) - recency(a));
  }

  async createDocument(input: { title?: string; content?: DocNode } = {}): Promise<DocumentRecord> {
    const me = await this.me();
    const content = input.content ?? emptyDocument();
    const row = must(
      await this.sb
        .from('documents')
        .insert({ title: cleanTitle(input.title), content, preview: buildPreview(content) })
        .select(RECORD)
        .single<DocRow>(),
    );
    await this.markOpened(row.id, me);
    return record(row, me);
  }

  async getDocument(id: string): Promise<DocumentRecord> {
    const me = await this.me();
    const { data, error } = await this.sb.from('documents').select(RECORD).eq('id', id).maybeSingle<DocRow>();
    if (error) throw toApiError(error);
    if (!data) throw await this.noAccess(id);
    await this.markOpened(id, me);
    return record(data, me);
  }

  async renameDocument(id: string, title: string): Promise<DocumentSummary> {
    const me = await this.me();
    const { data, error } = await this.sb.from('documents').update({ title: cleanTitle(title) }).eq('id', id).select(SUMMARY).maybeSingle<DocRow>();
    if (error) throw toApiError(error);
    // Row level security turns a rename someone may not make into "no rows".
    if (!data) throw new ApiError('forbidden', 'You do not have permission to edit this document.');
    return summarize(data, me);
  }

  async saveDocument(id: string, input: SaveDocumentInput): Promise<SaveResult> {
    await this.me();
    const { data, error } = await this.sb.rpc('save_document', {
      p_doc: id,
      p_content: input.content,
      p_base_version: input.baseVersion,
      p_force: input.force ?? false,
      p_preview: buildPreview(input.content),
    });
    if (error) throw toApiError(error);
    return data as SaveResult;
  }

  async duplicateDocument(id: string): Promise<DocumentRecord> {
    const original = await this.getDocument(id);
    // Comments stay with the original.
    const content = stripMarks(original.content, COMMENT_MARK);
    const copy = await this.createDocument({ title: `Copy of ${original.title}`, content });
    // Images move into the copy's own folder, so its collaborators can see them.
    const moved = await this.copyImages(content, copy.id);
    if (moved === content) return copy;
    const saved = await this.saveDocument(copy.id, { content: moved, baseVersion: copy.version });
    return { ...copy, content: moved, version: saved.version, updatedAt: saved.updatedAt };
  }

  async deleteDocument(id: string): Promise<void> {
    await this.me();
    const access = await this.access(id);
    if (access === 'missing') throw new ApiError('not_found', 'This document does not exist or was deleted.');
    if (access !== 'owner') throw new ApiError('forbidden', 'Only the owner can delete this document.');
    // Images first, while the document still grants the owner access to them.
    try {
      const { data: files } = await this.sb.storage.from(BUCKET).list(id, { limit: 1000 });
      if (files?.length) await this.sb.storage.from(BUCKET).remove(files.map((f) => `${id}/${f.name}`));
    } catch {
      // Cleanup is best effort; the document goes either way.
    }
    const { error } = await this.sb.from('documents').delete().eq('id', id);
    if (error) throw toApiError(error);
  }

  async leaveDocument(id: string): Promise<void> {
    const me = await this.me();
    const access = await this.access(id);
    if (access === 'owner') throw new ApiError('invalid', 'You own this document. Delete it instead.');
    await this.sb.from('document_opens').delete().eq('doc_id', id).eq('user_id', me);
    const { error } = await this.sb.from('document_shares').delete().eq('doc_id', id).eq('user_id', me);
    if (error) throw toApiError(error);
  }

  // ----------------------------------------------------------------- sharing

  async listShares(docId: string): Promise<Share[]> {
    await this.me();
    const rows = must(await this.sb.from('document_shares').select(SHARE).eq('doc_id', docId).order('added_at').returns<ShareRow[]>());
    return rows.map(toShare);
  }

  async setShare(docId: string, userId: string, role: ShareRole): Promise<Share> {
    await this.me();
    if (!['viewer', 'commenter', 'editor'].includes(role)) throw new ApiError('invalid', 'Choose a role.');
    // Change the role if they already have access, otherwise add them.
    const updated = await this.sb.from('document_shares').update({ role }).eq('doc_id', docId).eq('user_id', userId).select(SHARE).returns<ShareRow[]>();
    if (updated.error) throw toApiError(updated.error);
    if (updated.data?.length) return toShare(updated.data[0]);
    const inserted = await this.sb.from('document_shares').insert({ doc_id: docId, user_id: userId, role }).select(SHARE).single<ShareRow>();
    if (inserted.error) {
      if (inserted.error.code === '42501') throw new ApiError('forbidden', 'Only the owner and editors can add people.');
      if (inserted.error.code === '23503') throw new ApiError('not_found', 'We could not find that person.');
      throw toApiError(inserted.error);
    }
    return toShare(inserted.data);
  }

  async removeShare(docId: string, userId: string): Promise<void> {
    await this.me();
    const { data, error } = await this.sb.from('document_shares').delete().eq('doc_id', docId).eq('user_id', userId).select('user_id');
    if (error) throw toApiError(error);
    if (!data?.length) throw new ApiError('forbidden', 'Only the owner and editors can remove people.');
  }

  async shareByEmail(docId: string, email: string, role: ShareRole): Promise<ShareByEmailResult> {
    await this.me();
    const { data, error } = await this.sb.rpc('share_by_email', { p_doc: docId, p_email: email, p_role: role });
    if (error) throw toApiError(error);
    const result = data as { kind: 'share'; userId: string } | { kind: 'invite'; email: string };
    if (result.kind === 'share') {
      const row = must(
        await this.sb.from('document_shares').select(SHARE).eq('doc_id', docId).eq('user_id', result.userId).single<ShareRow>(),
      );
      return { kind: 'share', share: toShare(row) };
    }
    const row = must(await this.sb.from('document_invites').select(INVITE).eq('doc_id', docId).eq('email', result.email).single<InviteRow>());
    return { kind: 'invite', invite: toInvite(row) };
  }

  async listInvites(docId: string): Promise<Invite[]> {
    await this.me();
    const rows = must(await this.sb.from('document_invites').select(INVITE).eq('doc_id', docId).order('invited_at').returns<InviteRow[]>());
    return rows.map(toInvite);
  }

  async removeInvite(docId: string, email: string): Promise<void> {
    await this.me();
    const { data, error } = await this.sb
      .from('document_invites')
      .delete()
      .eq('doc_id', docId)
      .eq('email', email.trim().toLowerCase())
      .select('email');
    if (error) throw toApiError(error);
    if (!data?.length) throw new ApiError('forbidden', 'Only the owner and editors can cancel invites.');
  }

  // ---------------------------------------------------------------- comments

  async listComments(docId: string): Promise<CommentThread[]> {
    await this.me();
    const rows = must(
      await this.sb
        .from('comments')
        .select(THREAD)
        .eq('doc_id', docId)
        .order('created_at')
        .order('created_at', { referencedTable: 'comment_replies' })
        .returns<ThreadRow[]>(),
    );
    return rows.map(toThread);
  }

  async addComment(docId: string, input: NewComment): Promise<CommentThread> {
    await this.me();
    const { data, error } = await this.sb
      .from('comments')
      .insert({ id: input.id, doc_id: docId, body: cleanComment(input.body), quote: input.quote.slice(0, 500) })
      .select(THREAD)
      .single<ThreadRow>();
    if (error) {
      if (error.code === '42501') throw new ApiError('forbidden', 'You do not have permission to comment on this document.');
      throw toApiError(error);
    }
    return toThread(data);
  }

  async replyToComment(docId: string, commentId: string, body: string): Promise<CommentThread> {
    await this.me();
    const { error } = await this.sb.from('comment_replies').insert({ comment_id: commentId, body: cleanComment(body) });
    if (error) throw toApiError(error);
    return this.thread(docId, commentId);
  }

  async setCommentResolved(docId: string, commentId: string, resolved: boolean): Promise<CommentThread> {
    await this.me();
    const { data, error } = await this.sb
      .from('comments')
      .update({ resolved })
      .eq('id', commentId)
      .eq('doc_id', docId)
      .select(THREAD)
      .maybeSingle<ThreadRow>();
    if (error) throw toApiError(error);
    if (!data) throw new ApiError('not_found', 'That comment was deleted.');
    return toThread(data);
  }

  async deleteComment(docId: string, commentId: string): Promise<void> {
    await this.me();
    const { data, error } = await this.sb.from('comments').delete().eq('id', commentId).eq('doc_id', docId).select('id');
    if (error) throw toApiError(error);
    if (!data?.length) throw new ApiError('forbidden', 'Only the person who wrote this comment or the owner can delete it.');
  }

  // ------------------------------------------------------------------ assets

  async uploadAsset(docId: string, file: Blob): Promise<Asset> {
    await this.me();
    if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
      throw new ApiError('invalid', 'Choose an image file: PNG, JPEG, GIF, WebP, AVIF, SVG or BMP.');
    }
    if (file.size > MAX_ASSET_BYTES) throw new ApiError('too_large', 'Images can be up to 15 MB.');
    const path = `${docId}/${crypto.randomUUID()}.${extension(file.type)}`;
    const { error } = await this.sb.storage.from(BUCKET).upload(path, file, { contentType: file.type, upsert: false });
    if (error) {
      const raw = error as RawError;
      if (raw.status === 403 || raw.statusCode === '403' || /row-level security/i.test(error.message)) {
        throw new ApiError('forbidden', 'You do not have permission to add images to this document.');
      }
      throw toApiError(raw, 'That image could not be uploaded.');
    }
    return { id: path, url: SUPABASE_ASSET_PREFIX + path, mimeType: file.type, size: file.size };
  }

  async resolveAssetUrl(src: string): Promise<string> {
    if (!src.startsWith(SUPABASE_ASSET_PREFIX)) return src;
    const cached = this.signedUrls.get(src);
    // Renew a little before the link expires.
    if (cached && cached.expires - Date.now() > 5 * 60_000) return cached.url;
    const { data, error } = await this.sb.storage.from(BUCKET).createSignedUrl(src.slice(SUPABASE_ASSET_PREFIX.length), SIGNED_URL_SECONDS);
    if (error || !data) throw new ApiError('not_found', 'That image is no longer available.');
    this.signedUrls.set(src, { url: data.signedUrl, expires: Date.now() + SIGNED_URL_SECONDS * 1000 });
    return data.signedUrl;
  }

  async fetchAsset(src: string): Promise<Blob> {
    if (!src.startsWith(SUPABASE_ASSET_PREFIX)) {
      const response = await fetch(src);
      if (!response.ok) throw new ApiError('not_found', 'That image could not be loaded.');
      return response.blob();
    }
    const { data, error } = await this.sb.storage.from(BUCKET).download(src.slice(SUPABASE_ASSET_PREFIX.length));
    if (error || !data) throw new ApiError('not_found', 'That image is no longer available.');
    return data;
  }

  // ----------------------------------------------------------------- helpers

  /** The signed-in person's id, or an unauthorized error. */
  private async me(): Promise<string> {
    const { data } = await this.sb.auth.getSession();
    const id = data.session?.user.id;
    if (!id) {
      this.unauthorizedHandlers.forEach((h) => h());
      throw new ApiError('unauthorized', 'Your session has ended. Sign in again.');
    }
    return id;
  }

  private async sessionFor(session: AuthSession): Promise<Session> {
    const profile = must(
      await this.sb.from('profiles').select(PROFILE).eq('id', session.user.id).single<ProfileRow>(),
    );
    if (!profile.welcomed) await this.welcome(profile);
    // Tell the platform this account uses Write. Optional: older databases lack the function.
    void this.sb.rpc('elum_join_service', { p_service: 'write' }).then(() => undefined, () => undefined);
    return {
      token: session.access_token,
      user: toUser(profile),
      expiresAt: new Date((session.expires_at ?? 0) * 1000).toISOString(),
    };
  }

  /** Every new account gets the welcome document, once. */
  private async welcome(profile: ProfileRow) {
    try {
      await this.createDocument({ title: 'Welcome to Write', content: welcomeDocument(profile.name) });
      await this.sb.from('profiles').update({ welcomed: true }).eq('id', profile.id);
    } catch {
      // Not worth blocking sign-in over; it is tried again next time.
    }
  }

  private async access(id: string): Promise<Role | 'none' | 'missing'> {
    const { data, error } = await this.sb.rpc('check_document_access', { p_doc: id });
    if (error) {
      if (error.code === '22P02') return 'missing';
      throw toApiError(error);
    }
    return data as Role | 'none' | 'missing';
  }

  /** Why a document did not come back: it is gone, or it was never shared with you. */
  private async noAccess(id: string): Promise<ApiError> {
    const access = await this.access(id).catch(() => 'missing' as const);
    return access === 'none'
      ? new ApiError('forbidden', 'You need access to this document. Ask the owner to share it with you.')
      : new ApiError('not_found', 'This document does not exist or was deleted.');
  }

  private async markOpened(docId: string, me: string) {
    // "Last opened by me" is a nicety; never fail a request over it.
    await this.sb
      .from('document_opens')
      .upsert({ doc_id: docId, user_id: me, opened_at: new Date().toISOString() }, { onConflict: 'doc_id,user_id' });
  }

  private async thread(docId: string, commentId: string): Promise<CommentThread> {
    const row = must(
      await this.sb
        .from('comments')
        .select(THREAD)
        .eq('id', commentId)
        .eq('doc_id', docId)
        .order('created_at', { referencedTable: 'comment_replies' })
        .single<ThreadRow>(),
    );
    return toThread(row);
  }

  /** Copies every stored image into another document's folder and points the content at the copies. */
  private async copyImages(node: DocNode, docId: string): Promise<DocNode> {
    const src = node.attrs?.src;
    if (node.type === 'image' && typeof src === 'string' && src.startsWith(SUPABASE_ASSET_PREFIX)) {
      const from = src.slice(SUPABASE_ASSET_PREFIX.length);
      const to = `${docId}/${from.split('/').pop()}`;
      const { error } = await this.sb.storage.from(BUCKET).copy(from, to);
      return error ? node : { ...node, attrs: { ...node.attrs, src: SUPABASE_ASSET_PREFIX + to } };
    }
    if (!node.content) return node;
    const content = await Promise.all(node.content.map((c) => this.copyImages(c, docId)));
    return content.every((c, i) => c === node.content![i]) ? node : { ...node, content };
  }
}

interface NotificationRow {
  id: string;
  service_id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  created_at: string;
  read_at: string | null;
  actor: { id: string; name: string; color: string } | null;
}

function toNotification(r: NotificationRow): AppNotification {
  return {
    id: r.id,
    service: r.service_id as AppNotification['service'],
    type: r.type,
    title: r.title,
    body: r.body,
    link: r.link,
    createdAt: r.created_at,
    readAt: r.read_at,
    actor: r.actor,
  };
}

function toUser(p: ProfileRow): User {
  return { id: p.id, name: p.name, email: p.email, color: p.color, accountType: p.account_type ?? 'external', createdAt: p.created_at };
}

function toInvite(row: InviteRow): Invite {
  return { email: row.email, role: row.role, invitedAt: row.invited_at, invitedBy: row.inviter };
}

function roleFor(row: DocRow, me: string): Role {
  if (row.owner_id === me) return 'owner';
  return row.document_shares.find((s) => s.user_id === me)?.role ?? 'viewer';
}

function summarize(row: DocRow, me: string): DocumentSummary {
  return {
    id: row.id,
    title: row.title,
    owner: person(row.owner),
    role: roleFor(row, me),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    updatedBy: row.updater,
    lastOpenedAt: row.document_opens.find((o) => o.user_id === me)?.opened_at ?? null,
    preview: row.preview ?? [],
    sharedWithCount: row.document_shares.length,
  };
}

function record(row: DocRow, me: string): DocumentRecord {
  return { ...summarize(row, me), content: row.content ?? emptyDocument(), version: row.version ?? 1 };
}

function toShare(row: ShareRow): Share {
  return { user: person(row.user), role: row.role, addedAt: row.added_at, addedBy: row.adder };
}

function toThread(row: ThreadRow): CommentThread {
  return {
    id: row.id,
    docId: row.doc_id,
    author: person(row.author),
    body: row.body,
    quote: row.quote,
    createdAt: row.created_at,
    resolved: row.resolved,
    resolvedAt: row.resolved_at,
    resolvedBy: row.resolver,
    replies: row.comment_replies.map((r) => ({ id: r.id, author: person(r.author), body: r.body, createdAt: r.created_at })),
  };
}

function recency(d: DocumentSummary) {
  return Math.max(Date.parse(d.updatedAt), d.lastOpenedAt ? Date.parse(d.lastOpenedAt) : 0);
}

function extension(mimeType: string): string {
  return { 'image/jpeg': 'jpg', 'image/svg+xml': 'svg' }[mimeType] ?? mimeType.split('/')[1];
}
