import { ApiError } from '../errors';
import type { DocNode, ShareRole } from '../types';
import type { PasswordHash } from './passwords';

/** Rows as the local API stores them. They mirror what a server database would hold. */
export interface UserRow {
  id: string;
  name: string;
  email: string;
  emailLower: string;
  color: string;
  createdAt: string;
}

export interface SessionRow {
  token: string;
  userId: string;
  createdAt: string;
  expiresAt: string;
}

export interface DocumentRow {
  id: string;
  title: string;
  ownerId: string;
  content: DocNode;
  version: number;
  createdAt: string;
  updatedAt: string;
  updatedById: string | null;
}

export interface ShareRow {
  docId: string;
  userId: string;
  role: ShareRole;
  addedAt: string;
  addedById: string | null;
}

export interface InviteRow {
  docId: string;
  email: string;
  role: ShareRole;
  invitedAt: string;
  invitedById: string | null;
}

export interface ReplyRow {
  id: string;
  authorId: string;
  body: string;
  createdAt: string;
}

export interface CommentRow {
  id: string;
  docId: string;
  authorId: string;
  body: string;
  quote: string;
  createdAt: string;
  resolved: boolean;
  resolvedAt: string | null;
  resolvedById: string | null;
  replies: ReplyRow[];
}

export interface Tables {
  users: Record<string, UserRow>;
  credentials: Record<string, PasswordHash>;
  sessions: Record<string, SessionRow>;
  documents: Record<string, DocumentRow>;
  /** Keyed by `${docId}:${userId}`. */
  shares: Record<string, ShareRow>;
  /** Last time each person opened each document, keyed by `${docId}:${userId}`. */
  opens: Record<string, string>;
  comments: Record<string, CommentRow>;
  /** Access for addresses with no account yet, keyed by `${docId}:${email}`. */
  invites: Record<string, InviteRow>;
}

export type TableName = keyof Tables;

const PREFIX = 'elum.local.v1.';

/** A tiny table store over localStorage. Each table is one JSON value. */
export class LocalDb {
  constructor(private readonly storage: Storage = localStorage) {}

  read<T extends TableName>(table: T): Tables[T] {
    const raw = this.storage.getItem(PREFIX + table);
    if (!raw) return {} as Tables[T];
    try {
      return JSON.parse(raw) as Tables[T];
    } catch {
      return {} as Tables[T];
    }
  }

  write<T extends TableName>(table: T, rows: Tables[T]): void {
    try {
      this.storage.setItem(PREFIX + table, JSON.stringify(rows));
    } catch (error) {
      if (error instanceof DOMException && /quota/i.test(error.name + error.message)) {
        throw new ApiError('storage_full', 'This browser is out of space for documents. Delete some to make room.');
      }
      throw error;
    }
  }

  /** Read, change and write one table. */
  update<T extends TableName, R>(table: T, change: (rows: Tables[T]) => R): R {
    const rows = this.read(table);
    const result = change(rows);
    this.write(table, rows);
    return result;
  }
}

export const shareKey = (docId: string, userId: string) => `${docId}:${userId}`;
