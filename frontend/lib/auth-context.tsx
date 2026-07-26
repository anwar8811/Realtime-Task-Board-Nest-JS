'use client';

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { ACCESS_TOKEN_KEY } from './api';

export interface AuthUser {
  userId: string;
  role: 'user' | 'admin';
}

/**
 * Decodes the payload segment of a JWT for UI branching only (e.g. showing
 * the admin-only owner column, or comparing a task's ownerId against "me").
 *
 * This is NOT a security check — the backend's JwtStrategy re-verifies the
 * token's signature on every real request, so a tampered/forged token simply
 * fails there. This function never throws and never triggers logout; on any
 * malformed input it returns null and the caller treats that as "no user
 * info available yet" (e.g. before hydration) rather than an auth failure.
 */
function decodeUserFromToken(token: string): AuthUser | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const payloadSegment = parts[1];
    // base64url -> base64: swap URL-safe chars back and restore padding.
    const base64 = payloadSegment.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(
      base64.length + ((4 - (base64.length % 4)) % 4),
      '=',
    );
    const json = atob(padded);
    const payload: unknown = JSON.parse(json);

    if (
      typeof payload !== 'object' ||
      payload === null ||
      !('sub' in payload) ||
      !('role' in payload)
    ) {
      return null;
    }

    const { sub, role } = payload as { sub: unknown; role: unknown };
    if (
      typeof sub !== 'string' ||
      (role !== 'user' && role !== 'admin')
    ) {
      return null;
    }

    return { userId: sub, role };
  } catch {
    return null;
  }
}

interface AuthContextValue {
  token: string | null;
  /**
   * Derived from `token` via useMemo, so it can never drift out of sync
   * with it. Null whenever there's no token, or the token can't be decoded.
   */
  user: AuthUser | null;
  login: (token: string) => void;
  logout: () => void;
  /**
   * True until the initial localStorage read has completed. Consumers that
   * guard a route (e.g. app/tasks/page.tsx) should wait for this to become
   * false before deciding whether to redirect, otherwise they'd redirect
   * during the brief window before hydration finishes (React runs a child
   * component's mount effect before its parent's, so a guard effect can see
   * `token === null` for one tick even when a token is actually stored).
   *
   * Deviation note: the Story spec for this context says it should expose
   * exactly `{ token, login, logout }`. This `loading` flag is added on top
   * of that because without it, `/tasks` would briefly (but visibly) bounce
   * an already-logged-in user back to `/login` on every hard refresh. Flagged
   * here as a deliberate, minimal addition rather than a silent scope change.
   */
  loading: boolean;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const user = useMemo(
    () => (token ? decodeUserFromToken(token) : null),
    [token],
  );

  useEffect(() => {
    // Reading localStorage (a browser API unavailable during SSR) and
    // syncing it into state is exactly the "subscribe to an external
    // system on mount" case useEffect exists for; it's intentionally not
    // computed during render to avoid an SSR/hydration mismatch (Story spec).
    /* eslint-disable react-hooks/set-state-in-effect */
    const stored = window.localStorage.getItem(ACCESS_TOKEN_KEY);
    setToken(stored);
    setLoading(false);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  function login(newToken: string) {
    window.localStorage.setItem(ACCESS_TOKEN_KEY, newToken);
    setToken(newToken);
  }

  function logout() {
    window.localStorage.removeItem(ACCESS_TOKEN_KEY);
    setToken(null);
  }

  return (
    <AuthContext.Provider value={{ token, user, login, logout, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}
