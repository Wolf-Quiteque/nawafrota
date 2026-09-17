import { cache } from 'react';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { createSupabaseAdminClient } from '@/lib/supabase-admin';
import { STAFF_ROLES, FLEET_ROLES } from '@/lib/session';

// A staff profile changes about as often as somebody is hired. Re-reading it
// from Postgres on every API call adds a round trip for data that is
// effectively static, so hold it briefly in process. Short enough that a
// revoked role takes effect within the minute; long enough that a burst of
// calls from one screen pays for it once.
const PROFILE_TTL_MS = 60_000;
const PROFILE_CACHE_MAX = 200;
const profileCache = new Map();

function readCachedProfile(userId) {
  const hit = profileCache.get(userId);
  if (!hit) return undefined;
  if (hit.expiresAt <= Date.now()) {
    profileCache.delete(userId);
    return undefined;
  }
  return hit.profile;
}

function writeCachedProfile(userId, profile) {
  // Plain FIFO eviction — this only exists to bound memory on a long-lived
  // server, not to be clever about which staff member is busiest.
  if (profileCache.size >= PROFILE_CACHE_MAX) {
    const oldest = profileCache.keys().next().value;
    if (oldest !== undefined) profileCache.delete(oldest);
  }
  profileCache.set(userId, { profile, expiresAt: Date.now() + PROFILE_TTL_MS });
}

/** Drops a cached profile — call after anything that changes a role or on sign-out. */
export function invalidateProfile(userId) {
  if (userId) profileCache.delete(userId);
}

async function loadProfile(userId) {
  const cached = readCachedProfile(userId);
  if (cached !== undefined) return cached;

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from('profiles')
    .select('id, role, first_name, last_name, company_id')
    .eq('id', userId)
    .maybeSingle();

  if (error) return null;
  const profile = data ?? null;
  writeCachedProfile(userId, profile);
  return profile;
}

/**
 * Confirms the request carries a signed-in session whose role is in
 * `allowedRoles`, and returns the caller's id, role and name.
 *
 * Wrapped in React's cache() so a layout and the page inside it — which render
 * in the same pass — share one check instead of each paying for their own.
 */
const resolveSession = cache(async () => {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: () => {},
      },
    }
  );

  // getClaims() verifies the token's signature locally against the project's
  // cached JWKS rather than asking the auth server to do it, and falls back to
  // the server call on legacy HS256 projects. Same guarantee, usually without
  // the network hop. See the note in middleware.js.
  const { data, error } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (error || !userId) return { error: 'Sessão expirada. Entre novamente.', status: 401 };

  const profile = await loadProfile(userId);
  if (!profile) return { error: 'Esta conta não tem acesso ao Nawa-frotas.', status: 403 };

  return { user: { id: userId, email: data.claims.email ?? null }, profile };
});

async function requireRole(allowedRoles) {
  const session = await resolveSession();
  if (session.error) return session;
  if (!allowedRoles.includes(session.profile.role)) {
    return { error: 'Esta conta não tem acesso ao Nawa-frotas.', status: 403 };
  }
  return session;
}

/** Admin or agent — the fleet office. Every management route starts here. */
export function requireStaff() {
  return requireRole(STAFF_ROLES);
}

/** Admin, agent or driver — routes a driver is allowed to use (§6.7). */
export function requireFleetUser() {
  return requireRole(FLEET_ROLES);
}

/** Admin only — the fuel price and deletions. */
export async function requireAdmin() {
  const session = await resolveSession();
  if (session.error) return session;
  if (session.profile.role !== 'admin') {
    return { error: 'Só administradores podem fazer esta alteração.', status: 403 };
  }
  return session;
}

/**
 * The company whose rows this caller may see. An admin with no company_id is
 * a Nawabus super-admin and sees the whole multi-tenant fleet (§2.2); everyone
 * else is scoped to their own company.
 */
export function companyScope(profile) {
  if (!profile) return null;
  if (profile.role === 'admin' && !profile.company_id) return null;
  return profile.company_id ?? null;
}
