// Cheap, local checks on the Supabase auth cookie.
//
// WHY: the documented Supabase SSR middleware builds a Supabase client and
// calls the auth server on every single request — including requests from
// visitors who are plainly signed out and carry no session at all. Detecting
// that case from the cookie jar costs nothing and skips the work entirely.
//
// SECURITY: this file never decides that somebody *is* signed in. It only
// reports whether a session cookie is present, so the only thing a forged
// cookie buys is the slow path, where the token is properly verified.

const AUTH_COOKIE = /^sb-.+-auth-token(\.\d+)?$/;

/**
 * True when the request carries a @supabase/ssr session cookie. The cookie is
 * split into `.0`, `.1`… chunks once it outgrows the 4KB limit, so match any.
 */
export function hasSessionCookie(cookies = []) {
  return cookies.some((c) => AUTH_COOKIE.test(c.name) && Boolean(c.value));
}
