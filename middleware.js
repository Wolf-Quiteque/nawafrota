import { createServerClient } from '@supabase/ssr';
import { NextResponse } from 'next/server';
import { SESSION_COOKIE } from '@/lib/session';
import { decideSession, isAuthHandshakePath } from '@/lib/auth-paths';
import { hasSessionCookie } from '@/lib/supabase-token';

/** Applies a decideSession() result to a response, carrying cookies across. */
function applyDecision(request, response, decision) {
  if (!decision.redirectTo) return response;

  const url = request.nextUrl.clone();
  url.pathname = decision.redirectTo;
  url.search = '';
  if (decision.redirectTo === '/login') url.searchParams.set('next', request.nextUrl.pathname);

  const redirect = NextResponse.redirect(url);
  // Carry over any cookie changes (e.g. the cleared session) to the redirect.
  response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
  return redirect;
}

export async function middleware(request) {
  const { pathname } = request.nextUrl;
  const hasWeekMarker = Boolean(request.cookies.get(SESSION_COOKIE)?.value);

  // Sign-in and sign-out manage the session themselves. Leave them untouched
  // (see lib/auth-paths.js and tests/auth-paths.test.js for why).
  if (isAuthHandshakePath(pathname)) {
    return NextResponse.next({ request });
  }

  // No session cookie at all: there is nothing to verify and nothing to
  // refresh, so skip building a Supabase client. Signed-out visitors get
  // redirected without any work. (Absence is safe to trust — a forged
  // *present* cookie still goes through full verification below.)
  if (!hasSessionCookie(request.cookies.getAll())) {
    const decision = decideSession({ pathname, hasUser: false, hasWeekMarker });
    return applyDecision(request, NextResponse.next({ request }), decision);
  }

  let response = NextResponse.next({ request });
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    }
  );

  // getClaims() verifies the access token's signature against the project's
  // JWKS, which @supabase/supabase-js fetches once and caches in-process — so
  // on projects using asymmetric signing keys this is a local check instead of
  // the HTTPS round trip to the auth server that getUser() makes on *every*
  // request. It still refreshes an expired token (and setAll above writes the
  // new cookies back), and on legacy HS256 projects it transparently falls
  // back to the same verified server call as before. Never less strict, just
  // less chatty.
  const { data: claimsData } = await supabase.auth.getClaims();
  const hasUser = Boolean(claimsData?.claims?.sub);

  const decision = decideSession({ pathname, hasUser, hasWeekMarker });

  if (decision.signOut) {
    // scope 'local' ends the session on this device only. A global sign-out
    // would revoke the account everywhere, including the Sunmi terminal and NAWASOFT.
    await supabase.auth.signOut({ scope: 'local' });
  }

  return applyDecision(request, response, decision);
}

export const config = {
  matcher: [
    // offline.html is precached by the service worker before anyone signs in,
    // so it has to stay reachable — otherwise the worker caches a redirect to
    // /login and there is no offline fallback at all.
    '/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|offline.html|icons/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
