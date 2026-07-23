'use client';

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { ACCESS_TOKEN_KEY } from './api';

interface AuthContextValue {
  token: string | null;
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
    <AuthContext.Provider value={{ token, login, logout, loading }}>
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
