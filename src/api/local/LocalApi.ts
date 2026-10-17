import { ACCEPTED_IMAGE_TYPES, MAX_ASSET_BYTES, type ElumApi } from '../client';
import { buildPreview, collectAssetIds, COMMENT_MARK, emptyDocument, LOCAL_ASSET_PREFIX, sameIgnoringComments, stripMarks } from '../content';
import { ApiError } from '../errors';
import { atLeast } from '../roles';
import { tokenStore } from '../tokenStore';
import type {
  Asset,
  CommentThread,
  DocNode,
  DocumentFilter,
  DocumentRecord,
  DocumentSummary,
  NewComment,
  PublicUser,
  Role,
  SaveDocumentInput,
  SaveResult,
  Session,
  Share,
  ShareRole,
  SignInInput,
  SignUpInput,
  User,
} from '../types';
import { welcomeDocument } from '../welcome';
import { assetStore } from './assets';
import { LocalDb, shareKey, type CommentRow, type DocumentRow, type UserRow } from './db';
import { DEFAULT_ITERATIONS, hashPassword, randomToken, verifyPassword } from './passwords';
import { AVATAR_COLORS, seedDemoPeople } from './seed';

const SESSION_DAYS = 30;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_TITLE = 200;
const MAX_COMMENT = 4000;

export interface LocalApiOptions {
  storage?: Storage;
  /** Lower in tests to keep hashing fast. */
  passwordIterations?: number;
  seedDemoPeople?: boolean;
}

/**
 * The ELUM API, running inside this browser. It enforces the same rules the
 * server will (sessions, roles, version checks) so the UI behaves the same
 * when `HttpApi` replaces it. Data never leaves the device.
 */
export class LocalApi implements ElumApi {
  readonly mode = 'local' as const;
  private readonly db: LocalDb;
  private readonly iterations: number;
  private readonly unauthorizedHandlers = new Set<() => void>();
  private readonly objectUrls = new Map<string, string>();

  constructor(options: LocalApiOptions = {}) {
    this.db = new LocalDb(options.storage);
    this.iterations = options.passwordIterations ?? DEFAULT_ITERATIONS;
    if (options.seedDemoPeople ?? true) seedDemoPeople(this.db);
  }

  // ---------------------------------------------------------------- sessions

  async restoreSession(): Promise<Session | null> {
    const token = tokenStore.get();
    if (!token) return null;
    const row = this.db.read('sessions')[token];
    const user = row && this.db.read('users')[row.userId];
    if (!row || !user || Date.parse(row.expiresAt) < Date.now()) {
      tokenStore.clear();
      return null;
    }
    return { token, user: toUser(user), expiresAt: row.expiresAt };
  }

  async signUp(input: SignUpInput): Promise<Session> {
    const name = input.name.trim();
    const email = input.email.trim();
    const emailLower = email.toLowerCase();
    if (!name) throw new ApiError('invalid', 'Enter your name.', { field: 'name' });
    if (!EMAIL_RE.test(email)) throw new ApiError('invalid', 'Enter a valid email address.', { field: 'email' });
    if (input.password.length < 8) {
      throw new ApiError('invalid', 'Use at least 8 characters for your password.', { field: 'password' });
    }
    const users = this.db.read('users');
    if (Object.values(users).some((u) => u.emailLower === emailLower)) {
      throw new ApiError('email_taken', 'An account with this email already exists. Sign in instead.', { field: 'email' });
    }

    const credential = await hashPassword(input.password, this.iterations);
    const id = crypto.randomUUID();
    const user: UserRow = {
      id,
      name,
      email,
      emailLower,
      color: AVATAR_COLORS[Object.keys(users).length % AVATAR_COLORS.length],
      createdAt: now(),
    };
    this.db.update('users', (rows) => void (rows[id] = user));
    this.db.update('credentials', (rows) => void (rows[id] = credential));
    this.insertDocument(id, 'Welcome to Write', welcomeDocument(name));
    return this.startSession(user);
  }

  async signIn(input: SignInInput): Promise<Session> {
    const emailLower = input.email.trim().toLowerCase();
    const user = Object.values(this.db.read('users')).find((u) => u.emailLower === emailLower);
    const credential = user && this.db.read('credentials')[user.id];
    // Same message either way, so the form does not reveal which emails have accounts.
    if (!user || !credential || !(await verifyPassword(input.password, credential))) {
      throw new ApiError('invalid_credentials', 'That email and password do not match.');
    }
    return this.startSession(user);
  }

  async signOut(): Promise<void> {
    const token = tokenStore.get();
    if (token) this.db.update('sessions', (rows) => void delete rows[token]);
    tokenStore.clear();
    this.objectUrls.forEach((url) => URL.revokeObjectURL?.(url));
    this.objectUrls.clear();
  }

  async updateProfile(input: { name: string }): Promise<User> {
    const me = this.requireUser();
    const name = input.name.trim();
    if (!name) throw new ApiError('invalid', 'Enter your name.', { field: 'name' });
    const row = this.db.update('users', (rows) => {
      rows[me.id] = { ...rows[me.id], name };
      return rows[me.id];
    });
    return toUser(row);
  }

  onUnauthorized(handler: () => void): () => void {
    this.unauthorizedHandlers.add(handler);
    return () => this.unauthorizedHandlers.delete(handler);
  }

  // ------------------------------------------------------------------ people

  async searchUsers(query: string): Promise<PublicUser[]> {
    const me = this.requireUser();
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];
    return Object.values(this.db.read('users'))
      .filter((u) => u.id !== me.id && (u.name.toLowerCase().includes(q) || u.emailLower.includes(q)))
      .sort((a, b) => rank(a, q) - rank(b, q) || a.name.localeCompare(b.name))
      .slice(0, 8)
      .map(toPublic);
  }

  // --------------------------------------------------------------- documents

  async listDocuments(filter: DocumentFilter = 'all'): Promise<DocumentSummary[]> {
    const me = this.requireUser();
    const docs = Object.values(this.db.read('documents'));
    return docs
      .map((doc) => ({ doc, role: this.roleOf(doc, me.id) }))
      .filter(({ role }) => role !== null)
      .filter(({ role }) => filter === 'all' || (filter === 'owned' ? role === 'owner' : role !== 'owner'))
      .map(({ doc }) => this.summarize(doc, me.id))
      .sort((a, b) => recency(b) - recency(a));
  }

  async createDocument(input: { title?: string; content?: DocNode } = {}): Promise<DocumentRecord> {
    const me = this.requireUser();
    const row = this.insertDocument(me.id, cleanTitle(input.title), input.content ?? emptyDocument());
    this.db.update('opens', (rows) => void (rows[shareKey(row.id, me.id)] = now()));
    return this.record(row, me.id);
  }

  async getDocument(id: string): Promise<DocumentRecord> {
    const me = this.requireUser();
    const { doc } = this.access(id, me.id, 'viewer');
    this.db.update('opens', (rows) => void (rows[shareKey(id, me.id)] = now()));
    return this.record(doc, me.id);
  }

  async renameDocument(id: string, title: string): Promise<DocumentSummary> {
    const me = this.requireUser();
    this.access(id, me.id, 'editor');
    const row = this.db.update('documents', (rows) => {
      rows[id] = { ...rows[id], title: cleanTitle(title) };
      return rows[id];
    });
    return this.summarize(row, me.id);
  }

  async saveDocument(id: string, input: SaveDocumentInput): Promise<SaveResult> {
    const me = this.requireUser();
    const { doc, role } = this.access(id, me.id, 'commenter');
    const commentsOnly = sameIgnoringComments(doc.content, input.content);
    if (!atLeast(role, 'editor') && !commentsOnly) {
      throw new ApiError('forbidden', 'You can comment on this document but not edit it.');
    }
    if (input.baseVersion !== doc.version && !input.force) {
      throw new ApiError('conflict', 'This document changed somewhere else.', { version: doc.version });
    }
    const updated: DocumentRow = {
      ...doc,
      content: input.content,
      version: doc.version + 1,
      // Comment anchors are not edits, so they do not count as a modification.
      ...(commentsOnly ? {} : { updatedAt: now(), updatedById: me.id }),
    };
    this.db.update('documents', (rows) => void (rows[id] = updated));
    return { version: updated.version, updatedAt: updated.updatedAt };
  }

  async duplicateDocument(id: string): Promise<DocumentRecord> {
    const me = this.requireUser();
    const { doc } = this.access(id, me.id, 'viewer');
    // Comments stay with the original.
    const copy = this.insertDocument(me.id, cleanTitle(`Copy of ${doc.title}`), stripMarks(doc.content, COMMENT_MARK));
    this.db.update('opens', (rows) => void (rows[shareKey(copy.id, me.id)] = now()));
    return this.record(copy, me.id);
  }

  async deleteDocument(id: string): Promise<void> {
    const me = this.requireUser();
    const { role } = this.access(id, me.id, 'viewer');
    if (role !== 'owner') throw new ApiError('forbidden', 'Only the owner can delete this document.');
    this.db.update('documents', (rows) => void delete rows[id]);
    const forDoc = (key: string) => key.startsWith(`${id}:`);
    this.db.update('shares', (rows) => Object.keys(rows).filter(forDoc).forEach((k) => delete rows[k]));
    this.db.update('opens', (rows) => Object.keys(rows).filter(forDoc).forEach((k) => delete rows[k]));
    this.db.update('comments', (rows) =>
      Object.values(rows)
        .filter((c) => c.docId === id)
        .forEach((c) => delete rows[c.id]),
    );
    await this.collectUnusedAssets(id);
  }

  async leaveDocument(id: string): Promise<void> {
    const me = this.requireUser();
    const { role } = this.access(id, me.id, 'viewer');
    if (role === 'owner') throw new ApiError('invalid', 'You own this document. Delete it instead.');
    this.db.update('shares', (rows) => void delete rows[shareKey(id, me.id)]);
    this.db.update('opens', (rows) => void delete rows[shareKey(id, me.id)]);
  }

  // ----------------------------------------------------------------- sharing

  async listShares(docId: string): Promise<Share[]> {
    const me = this.requireUser();
    this.access(docId, me.id, 'viewer');
    const users = this.db.read('users');
    return Object.values(this.db.read('shares'))
      .filter((s) => s.docId === docId && users[s.userId])
      .sort((a, b) => a.addedAt.localeCompare(b.addedAt))
      .map((s) => ({
        user: toPublic(users[s.userId]),
        role: s.role,
        addedAt: s.addedAt,
        addedBy: s.addedById && users[s.addedById] ? toPublic(users[s.addedById]) : null,
      }));
  }

  async setShare(docId: string, userId: string, role: ShareRole): Promise<Share> {
    const me = this.requireUser();
    const { doc } = this.access(docId, me.id, 'editor');
    if (!['viewer', 'commenter', 'editor'].includes(role)) throw new ApiError('invalid', 'Choose a role.');
    if (userId === doc.ownerId) throw new ApiError('invalid', 'The owner already has full access.');
    const users = this.db.read('users');
    const person = users[userId];
    if (!person) throw new ApiError('not_found', 'We could not find that person.');
    const key = shareKey(docId, userId);
    const row = this.db.update('shares', (rows) => {
      rows[key] = { docId, userId, role, addedAt: rows[key]?.addedAt ?? now(), addedById: rows[key]?.addedById ?? me.id };
      return rows[key];
    });
    const addedBy = row.addedById && users[row.addedById] ? toPublic(users[row.addedById]) : null;
    return { user: toPublic(person), role: row.role, addedAt: row.addedAt, addedBy };
  }

  async removeShare(docId: string, userId: string): Promise<void> {
    const me = this.requireUser();
    // Anyone can remove themselves; editors can remove others.
    this.access(docId, me.id, userId === me.id ? 'viewer' : 'editor');
    this.db.update('shares', (rows) => void delete rows[shareKey(docId, userId)]);
  }

  // ---------------------------------------------------------------- comments

  async listComments(docId: string): Promise<CommentThread[]> {
    const me = this.requireUser();
    // Like most document tools, viewers do not see comments.
    this.access(docId, me.id, 'commenter');
    return Object.values(this.db.read('comments'))
      .filter((c) => c.docId === docId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .map((c) => this.thread(c));
  }

  async addComment(docId: string, input: NewComment): Promise<CommentThread> {
    const me = this.requireUser();
    this.access(docId, me.id, 'commenter');
    const body = cleanComment(input.body);
    if (!/^[\w-]{8,64}$/.test(input.id)) throw new ApiError('invalid', 'Comment id is not valid.');
    const comments = this.db.read('comments');
    if (comments[input.id]) throw new ApiError('invalid', 'That comment already exists.');
    const row: CommentRow = {
      id: input.id,
      docId,
      authorId: me.id,
      body,
      quote: input.quote.slice(0, 500),
      createdAt: now(),
      resolved: false,
      resolvedAt: null,
      resolvedById: null,
      replies: [],
    };
    comments[row.id] = row;
    this.db.write('comments', comments);
    return this.thread(row);
  }

  async replyToComment(docId: string, commentId: string, body: string): Promise<CommentThread> {
    const me = this.requireUser();
    this.access(docId, me.id, 'commenter');
    const text = cleanComment(body);
    const row = this.db.update('comments', (rows) => {
      const c = this.commentIn(rows, docId, commentId);
      c.replies.push({ id: crypto.randomUUID(), authorId: me.id, body: text, createdAt: now() });
      // Replying to a resolved thread opens it again.
      c.resolved = false;
      c.resolvedAt = null;
      c.resolvedById = null;
      return c;
    });
    return this.thread(row);
  }

  async setCommentResolved(docId: string, commentId: string, resolved: boolean): Promise<CommentThread> {
    const me = this.requireUser();
    this.access(docId, me.id, 'commenter');
    const row = this.db.update('comments', (rows) => {
      const c = this.commentIn(rows, docId, commentId);
      c.resolved = resolved;
      c.resolvedAt = resolved ? now() : null;
      c.resolvedById = resolved ? me.id : null;
      return c;
    });
    return this.thread(row);
  }

  async deleteComment(docId: string, commentId: string): Promise<void> {
    const me = this.requireUser();
    const { role } = this.access(docId, me.id, 'commenter');
    this.db.update('comments', (rows) => {
      const c = this.commentIn(rows, docId, commentId);
      if (c.authorId !== me.id && role !== 'owner') {
        throw new ApiError('forbidden', 'Only the person who wrote this comment or the owner can delete it.');
      }
      delete rows[commentId];
    });
  }

  // ------------------------------------------------------------------ assets

  async uploadAsset(docId: string, file: Blob): Promise<Asset> {
    const me = this.requireUser();
    this.access(docId, me.id, 'editor');
    if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
      throw new ApiError('invalid', 'Choose an image file: PNG, JPEG, GIF, WebP, AVIF, SVG or BMP.');
    }
    if (file.size > MAX_ASSET_BYTES) throw new ApiError('too_large', 'Images can be up to 15 MB.');
    const id = crypto.randomUUID();
    const bytes = await readBytes(file);
    try {
      await assetStore.put({ id, docId, ownerId: me.id, mimeType: file.type, size: file.size, bytes, createdAt: now() });
    } catch (error) {
      if (error instanceof DOMException && error.name === 'QuotaExceededError') {
        throw new ApiError('storage_full', 'This browser is out of space for images.');
      }
      throw error;
    }
    return { id, url: LOCAL_ASSET_PREFIX + id, mimeType: file.type, size: file.size };
  }

  async resolveAssetUrl(src: string): Promise<string> {
    if (!src.startsWith(LOCAL_ASSET_PREFIX)) return src;
    const cached = this.objectUrls.get(src);
    if (cached) return cached;
    const url = URL.createObjectURL(await this.fetchAsset(src));
    this.objectUrls.set(src, url);
    return url;
  }

  async fetchAsset(src: string): Promise<Blob> {
    if (!src.startsWith(LOCAL_ASSET_PREFIX)) {
      const response = await fetch(src);
      if (!response.ok) throw new ApiError('not_found', 'That image could not be loaded.');
      return response.blob();
    }
    const row = await assetStore.get(src.slice(LOCAL_ASSET_PREFIX.length));
    if (!row) throw new ApiError('not_found', 'That image is no longer available.');
    return new Blob([row.bytes], { type: row.mimeType });
  }

  // ----------------------------------------------------------------- helpers

  private startSession(user: UserRow): Session {
    const token = randomToken();
    const expiresAt = new Date(Date.now() + SESSION_DAYS * 86_400_000).toISOString();
    this.db.update('sessions', (rows) => {
      // Drop expired sessions while we are here.
      for (const [key, row] of Object.entries(rows)) if (Date.parse(row.expiresAt) < Date.now()) delete rows[key];
      rows[token] = { token, userId: user.id, createdAt: now(), expiresAt };
    });
    tokenStore.set(token);
    return { token, user: toUser(user), expiresAt };
  }

  private requireUser(): UserRow {
    const token = tokenStore.get();
    const session = token ? this.db.read('sessions')[token] : undefined;
    const user = session && this.db.read('users')[session.userId];
    if (!session || !user || Date.parse(session.expiresAt) < Date.now()) {
      this.unauthorizedHandlers.forEach((h) => h());
      throw new ApiError('unauthorized', 'Your session has ended. Sign in again.');
    }
    return user;
  }

  private roleOf(doc: DocumentRow, userId: string): Role | null {
    if (doc.ownerId === userId) return 'owner';
    return this.db.read('shares')[shareKey(doc.id, userId)]?.role ?? null;
  }

  private access(docId: string, userId: string, needed: Role): { doc: DocumentRow; role: Role } {
    const doc = this.db.read('documents')[docId];
    if (!doc) throw new ApiError('not_found', 'This document does not exist or was deleted.');
    const role = this.roleOf(doc, userId);
    if (!role) throw new ApiError('forbidden', 'You need access to this document. Ask the owner to share it with you.');
    if (!atLeast(role, needed)) {
      const what = needed === 'commenter' ? 'comment on' : needed === 'editor' ? 'edit' : 'open';
      throw new ApiError('forbidden', `You do not have permission to ${what} this document.`);
    }
    return { doc, role };
  }

  private insertDocument(ownerId: string, title: string, content: DocNode): DocumentRow {
    const at = now();
    const row: DocumentRow = {
      id: crypto.randomUUID(),
      title,
      ownerId,
      content,
      version: 1,
      createdAt: at,
      updatedAt: at,
      updatedById: ownerId,
    };
    this.db.update('documents', (rows) => void (rows[row.id] = row));
    return row;
  }

  private summarize(doc: DocumentRow, userId: string): DocumentSummary {
    const users = this.db.read('users');
    const shares = this.db.read('shares');
    const owner = users[doc.ownerId];
    return {
      id: doc.id,
      title: doc.title,
      owner: owner ? toPublic(owner) : { id: doc.ownerId, name: 'Unknown', email: '', color: AVATAR_COLORS[0] },
      role: this.roleOf(doc, userId) ?? 'viewer',
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
      updatedBy: doc.updatedById && users[doc.updatedById] ? toPublic(users[doc.updatedById]) : null,
      lastOpenedAt: this.db.read('opens')[shareKey(doc.id, userId)] ?? null,
      preview: buildPreview(doc.content),
      sharedWithCount: Object.values(shares).filter((s) => s.docId === doc.id).length,
    };
  }

  private record(doc: DocumentRow, userId: string): DocumentRecord {
    return { ...this.summarize(doc, userId), content: doc.content, version: doc.version };
  }

  private commentIn(rows: Record<string, CommentRow>, docId: string, commentId: string): CommentRow {
    const c = rows[commentId];
    if (!c || c.docId !== docId) throw new ApiError('not_found', 'That comment was deleted.');
    return c;
  }

  private thread(c: CommentRow): CommentThread {
    const users = this.db.read('users');
    const person = (id: string): PublicUser =>
      users[id] ? toPublic(users[id]) : { id, name: 'Former member', email: '', color: AVATAR_COLORS[0] };
    return {
      id: c.id,
      docId: c.docId,
      author: person(c.authorId),
      body: c.body,
      quote: c.quote,
      createdAt: c.createdAt,
      resolved: c.resolved,
      resolvedAt: c.resolvedAt,
      resolvedBy: c.resolvedById ? person(c.resolvedById) : null,
      replies: c.replies.map((r) => ({ id: r.id, author: person(r.authorId), body: r.body, createdAt: r.createdAt })),
    };
  }

  /** Deletes a document's images unless another document still shows them (copies, pastes). */
  private async collectUnusedAssets(docId: string) {
    try {
      const inUse = new Set<string>();
      Object.values(this.db.read('documents')).forEach((d) => collectAssetIds(d.content, inUse));
      const ids = await assetStore.idsForDocument(docId);
      await Promise.all(ids.filter((id) => !inUse.has(id)).map((id) => assetStore.delete(id)));
    } catch {
      // Cleanup is best effort; the document is already gone.
    }
  }
}

function now() {
  return new Date().toISOString();
}

function toUser(row: UserRow): User {
  return { id: row.id, name: row.name, email: row.email, color: row.color, createdAt: row.createdAt };
}

function toPublic(row: Pick<UserRow, 'id' | 'name' | 'email' | 'color'>): PublicUser {
  return { id: row.id, name: row.name, email: row.email, color: row.color };
}

/** Blob.arrayBuffer, with a FileReader fallback for older engines. */
function readBytes(blob: Blob): Promise<ArrayBuffer> {
  if (typeof blob.arrayBuffer === 'function') return blob.arrayBuffer();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(blob);
  });
}

function cleanTitle(title: string | undefined): string {
  const t = (title ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_TITLE);
  return t || 'Untitled document';
}

function cleanComment(body: string): string {
  const text = body.trim();
  if (!text) throw new ApiError('invalid', 'Write something first.');
  if (text.length > MAX_COMMENT) throw new ApiError('invalid', 'Comments can be up to 4,000 characters.');
  return text;
}

/** Name and email prefix matches first. */
function rank(u: UserRow, q: string) {
  if (u.name.toLowerCase().startsWith(q) || u.emailLower.startsWith(q)) return 0;
  return 1;
}

function recency(d: DocumentSummary) {
  return Math.max(Date.parse(d.updatedAt), d.lastOpenedAt ? Date.parse(d.lastOpenedAt) : 0);
}
