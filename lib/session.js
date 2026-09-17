// The Supabase refresh token does not expire on a fixed schedule, so Nawa-frotas
// enforces its own week-long session on top of it: this cookie is stamped at
// login with a 7-day Max-Age. Once the browser drops it, the middleware treats
// the visitor as signed out even if Supabase's own cookies are still valid.
//
// The name is deliberately distinct from nawasoft-pwa's marker — the two apps
// can be installed side by side on one phone and must not clear each other's
// sessions when they share a host during local development.
export const SESSION_COOKIE = 'nawafrotas_session_started';
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7; // 7 days

// Full access: the fleet office.
export const STAFF_ROLES = ['admin', 'agent'];

// Drivers may sign in, but only to log a refuelling and report a breakdown
// (§6.7). Everything else is gated on STAFF_ROLES.
export const DRIVER_ROLES = ['driver'];

// Anyone allowed through the front door at all.
export const FLEET_ROLES = [...STAFF_ROLES, ...DRIVER_ROLES];

export function isStaffRole(role) {
  return STAFF_ROLES.includes(role);
}

export function isDriverRole(role) {
  return DRIVER_ROLES.includes(role);
}
