import type { Role, ShareRole } from './types';

const RANK: Record<Role, number> = { viewer: 1, commenter: 2, editor: 3, owner: 4 };

export function atLeast(role: Role | null | undefined, needed: Role): boolean {
  return !!role && RANK[role] >= RANK[needed];
}

export const canEdit = (role: Role | null | undefined) => atLeast(role, 'editor');
export const canComment = (role: Role | null | undefined) => atLeast(role, 'commenter');
/** Owners and editors can add people, like most document tools. */
export const canShare = (role: Role | null | undefined) => atLeast(role, 'editor');

export const SHARE_ROLES: { value: ShareRole; label: string; hint: string }[] = [
  { value: 'viewer', label: 'Viewer', hint: 'Can read' },
  { value: 'commenter', label: 'Commenter', hint: 'Can read and comment' },
  { value: 'editor', label: 'Editor', hint: 'Can edit and share' },
];

export const ROLE_LABEL: Record<Role, string> = {
  owner: 'Owner',
  editor: 'Editor',
  commenter: 'Commenter',
  viewer: 'Viewer',
};
