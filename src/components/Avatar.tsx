import type { PublicUser } from '../api';

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  const first = parts[0][0];
  const last = parts.length > 1 ? parts[parts.length - 1][0] : '';
  return (first + last).toUpperCase();
}

export function Avatar({ user, size = 32, title }: { user: Pick<PublicUser, 'name' | 'color'>; size?: number; title?: string }) {
  return (
    <span
      className="avatar"
      title={title}
      aria-hidden={title ? undefined : true}
      style={{ width: size, height: size, background: user.color, fontSize: Math.max(10, Math.round(size * 0.38)) }}
    >
      {initials(user.name)}
    </span>
  );
}
