import type { ReactNode } from 'react';
import { Navigate, useLocation, useSearchParams } from 'react-router';
import { FullPageLoader } from '../components/Loader';
import { useAuth } from './AuthProvider';

/** Sends signed-out visitors to sign in, then brings them back. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const location = useLocation();
  if (status === 'loading') return <FullPageLoader brand />;
  if (status === 'signed-out') {
    const next = location.pathname + location.search;
    return <Navigate to={next === '/' ? '/signin' : `/signin?next=${encodeURIComponent(next)}`} replace />;
  }
  return <>{children}</>;
}

/** Sign-in and sign-up pages: skip them when already signed in. */
export function RedirectIfSignedIn({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const next = useSafeNext();
  if (status === 'loading') return <FullPageLoader brand />;
  if (status === 'signed-in') return <Navigate to={next} replace />;
  return <>{children}</>;
}

/** The `next` query parameter, limited to paths on this site. */
export function useSafeNext(): string {
  const [params] = useSearchParams();
  const next = params.get('next') ?? '/';
  return next.startsWith('/') && !next.startsWith('//') ? next : '/';
}
