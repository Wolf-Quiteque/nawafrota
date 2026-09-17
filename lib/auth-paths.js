// Pure routing rules for the middleware, kept free of Next/Supabase imports
// so they can be unit-tested with `node --test`.

export const PUBLIC_PATHS = ['/login'];

// The sign-in handshake is what *creates* the 7-day marker cookie, so the
// marker can never exist while these run. If the expiry check ran on them,
// the middleware would sign out the brand-new session a moment before the
// route validated it, and login would fail with "Auth session missing!".
export const AUTH_HANDSHAKE_PATHS = ['/api/auth/session', '/api/auth/logout'];

export function isPublicPath(pathname) {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export function isAuthHandshakePath(pathname) {
  return AUTH_HANDSHAKE_PATHS.includes(pathname);
}

// API routes call requireStaff() themselves and answer with JSON 401/403;
// redirecting them to the HTML login page would break `await res.json()`.
export function isApiPath(pathname) {
  return pathname.startsWith('/api/');
}

/**
 * What the middleware should do for a request.
 * - signOut: end this device's Supabase session (the week is over).
 * - redirectTo: '/login', '/', or null to let the request continue.
 */
export function decideSession({ pathname, hasUser, hasWeekMarker }) {
  if (isAuthHandshakePath(pathname)) return { signOut: false, redirectTo: null };

  const expired = hasUser && !hasWeekMarker;
  const signedIn = hasUser && !expired;

  if (isApiPath(pathname)) return { signOut: expired, redirectTo: null };
  if (!signedIn && !isPublicPath(pathname)) return { signOut: expired, redirectTo: '/login' };
  if (signedIn && isPublicPath(pathname)) return { signOut: false, redirectTo: '/' };
  return { signOut: expired, redirectTo: null };
}
