/**
 * Shared API client for authenticated calls to the backend.
 *
 * - Reads the JWT from localStorage and attaches it as `Authorization: Bearer <token>`
 *   on every request (when present).
 * - On a 401 response, clears the stored token and redirects to /login.
 *
 * NOTE: This wrapper is for *authenticated* endpoints (e.g. /tasks/*). The
 * /auth/login call itself is intentionally NOT routed through this wrapper —
 * a 401 there means "wrong credentials" and should surface as an inline form
 * error, not trigger this module's global "kick the user back to /login"
 * behavior. See app/login/page.tsx.
 */

export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';

export const ACCESS_TOKEN_KEY = 'accessToken';

export function getStoredToken(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(ACCESS_TOKEN_KEY);
}

function clearStoredToken(): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(ACCESS_TOKEN_KEY);
}

function redirectToLogin(): void {
  if (typeof window === 'undefined') return;
  window.location.href = '/login';
}

/**
 * fetch wrapper that injects the JWT and handles global 401 logout+redirect.
 * `path` is joined with API_BASE_URL, e.g. apiFetch('/tasks').
 */
export async function apiFetch(
  path: string,
  options: RequestInit = {},
): Promise<Response> {
  const token = getStoredToken();

  const headers = new Headers(options.headers);
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  if (options.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers,
  });

  if (response.status === 401) {
    clearStoredToken();
    redirectToLogin();
  }

  return response;
}
