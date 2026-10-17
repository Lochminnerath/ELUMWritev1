import type {
  Asset,
  CommentThread,
  DocNode,
  DocumentFilter,
  DocumentRecord,
  DocumentSummary,
  NewComment,
  PublicUser,
  SaveDocumentInput,
  SaveResult,
  Session,
  Share,
  ShareRole,
  SignInInput,
  SignUpInput,
  User,
} from './types';

/**
 * Everything ELUM Write asks of its backend. `LocalApi` implements it inside
 * the browser today; `HttpApi` implements it against the ELUM API. The
 * endpoint contract for the server lives in docs/API.md.
 *
 * Every call except the auth ones acts as the signed-in person and fails
 * with `ApiError('unauthorized')` when there is no valid session.
 */
export interface ElumApi {
  readonly mode: 'local' | 'remote';

  // Accounts and sessions
  restoreSession(): Promise<Session | null>;
  signUp(input: SignUpInput): Promise<Session>;
  signIn(input: SignInInput): Promise<Session>;
  signOut(): Promise<void>;
  updateProfile(input: { name: string }): Promise<User>;
  /** Called when the server rejects the session (expired or revoked). Returns an unsubscribe function. */
  onUnauthorized(handler: () => void): () => void;

  // People
  /** Finds people to share with by name or email. Excludes the signed-in person. */
  searchUsers(query: string): Promise<PublicUser[]>;

  // Documents
  listDocuments(filter?: DocumentFilter): Promise<DocumentSummary[]>;
  createDocument(input?: { title?: string; content?: DocNode }): Promise<DocumentRecord>;
  /** Opens a document. Also records when the signed-in person last opened it. */
  getDocument(id: string): Promise<DocumentRecord>;
  renameDocument(id: string, title: string): Promise<DocumentSummary>;
  /** Editors can change anything. Commenters can only add or remove comment anchors. */
  saveDocument(id: string, input: SaveDocumentInput): Promise<SaveResult>;
  duplicateDocument(id: string): Promise<DocumentRecord>;
  /** Owner only. Removes the document for everyone. */
  deleteDocument(id: string): Promise<void>;
  /** Removes a document someone shared with you from your list. */
  leaveDocument(id: string): Promise<void>;

  // Sharing
  listShares(docId: string): Promise<Share[]>;
  /** Adds a person or changes their role. */
  setShare(docId: string, userId: string, role: ShareRole): Promise<Share>;
  removeShare(docId: string, userId: string): Promise<void>;

  // Comments (commenters, editors and the owner; viewers do not see comments)
  listComments(docId: string): Promise<CommentThread[]>;
  addComment(docId: string, input: NewComment): Promise<CommentThread>;
  replyToComment(docId: string, commentId: string, body: string): Promise<CommentThread>;
  setCommentResolved(docId: string, commentId: string, resolved: boolean): Promise<CommentThread>;
  deleteComment(docId: string, commentId: string): Promise<void>;

  // Files placed on the page
  uploadAsset(docId: string, file: Blob): Promise<Asset>;
  /** Turns a stored image `src` into something an <img> can load. */
  resolveAssetUrl(src: string): Promise<string>;
  /** The raw bytes behind an image `src`, used for downloads and exports. */
  fetchAsset(src: string): Promise<Blob>;
}

export const ACCEPTED_IMAGE_TYPES = [
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'image/avif',
  'image/svg+xml',
  'image/bmp',
];

export const MAX_ASSET_BYTES = 15 * 1024 * 1024;
