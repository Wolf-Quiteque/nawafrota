import { cache } from 'react';
import { createSupabaseAdminClient } from '@/lib/supabase-admin';
import { scopeToCompany } from '@/lib/api';

/**
 * Every bus with its live state, scoped to the caller's company (§2.2).
 * Reads the view rather than re-deriving "is it out right now" — the view is
 * where the multi-leg deduplication lives (§2.3).
 */
export async function listBusStatus(companyId, { includeInactive = true } = {}) {
  const supabase = createSupabaseAdminClient();
  let query = supabase.from('fleet_bus_status').select('*');
  query = scopeToCompany(query, companyId);
  if (!includeInactive) query = query.eq('is_active', true);

  const { data, error } = await query;
  if (error) throw error;

  // Sorted here rather than in SQL: the order staff want is by state (things
  // needing attention first), which the view stores as text and would sort
  // alphabetically.
  const rank = { needs_maintenance: 0, on_trip: 1, idle: 2, out_of_service: 3 };
  return (data || []).sort(
    (a, b) =>
      (rank[a.state] ?? 9) - (rank[b.state] ?? 9) ||
      String(a.license_plate).localeCompare(String(b.license_plate), 'pt')
  );
}

const getBusStatusCached = cache(async (busId, companyId) => {
  const supabase = createSupabaseAdminClient();
  let query = supabase.from('fleet_bus_status').select('*').eq('bus_id', busId);
  query = scopeToCompany(query, companyId);
  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  return data;
});

export function getBusStatus(busId, companyId) {
  return getBusStatusCached(busId, companyId);
}

/**
 * The highest seat already sold on a *future* trip for this bus — the number
 * the capacity guard in §2.1 compares against. Past trips are irrelevant: those
 * passengers have already travelled.
 */
export async function maxSoldSeatForBus(busId) {
  const supabase = createSupabaseAdminClient();
  const { data: trips, error: tripError } = await supabase
    .from('trips')
    .select('id')
    .eq('bus_id', busId)
    .gt('departure_time', new Date().toISOString());
  if (tripError) throw tripError;

  const tripIds = (trips || []).map((t) => t.id);
  if (!tripIds.length) return null;

  const { data, error } = await supabase
    .from('tickets')
    .select('seat_number')
    .in('trip_id', tripIds)
    .in('status', ['active', 'used'])
    .order('seat_number', { ascending: false })
    .limit(1);
  if (error) throw error;

  return data?.[0]?.seat_number ?? null;
}

/** The fuel price in force at an instant, from the DB's own lookup (§4.3). */
export async function fuelPriceAt(at, companyId, fuelType = 'diesel') {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase.rpc('fuel_price_at', {
    p_at: at || new Date().toISOString(),
    p_fuel_type: fuelType,
    p_company_id: companyId,
  });
  if (error) throw error;
  return data === null ? null : Number(data);
}

/** Staff and drivers, for the "who was driving" picker on a refuelling. */
export async function listDrivers(companyId) {
  const supabase = createSupabaseAdminClient();
  let query = supabase
    .from('profiles')
    .select('id, first_name, last_name, role')
    .in('role', ['driver', 'agent', 'admin'])
    .order('first_name');
  query = scopeToCompany(query, companyId);
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

export async function getCompany(companyId) {
  if (!companyId) return null;
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from('companies')
    .select('id, name, logo_url')
    .eq('id', companyId)
    .maybeSingle();
  if (error) throw error;
  return data;
}
