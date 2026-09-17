import { NextResponse } from 'next/server';
import { requireFleetUser, companyScope } from '@/lib/auth';
import { createSupabaseAdminClient } from '@/lib/supabase-admin';
import { denied, badRequest, serverError, friendlyDbError, scopeToCompany, intParam } from '@/lib/api';
import { validateFuelEntry, parseAmount, consumptionBetween } from '@/lib/fuel';
import { pushQuietly } from '@/lib/push-server';
import { formatKz, formatLitres } from '@/lib/format';

const SELECT =
  'id, bus_id, filled_at, litres, price_per_litre_kz, total_cost_kz, odometer_km, ' +
  'fuel_type, station, notes, is_full_tank, receipt_url, driver_id, recorded_by, created_at, ' +
  'bus:buses!inner(id, license_plate, make, model, company_id), ' +
  'driver:profiles!bus_fuel_logs_driver_id_fkey(id, first_name, last_name)';

export async function GET(request) {
  const auth = await requireFleetUser();
  if (auth.error) return denied(auth);

  const { searchParams } = new URL(request.url);
  const limit = intParam(searchParams, 'limit', 50, { min: 1, max: 500 });
  const busId = searchParams.get('bus_id');
  const from = searchParams.get('from');
  const to = searchParams.get('to');

  const supabase = createSupabaseAdminClient();
  let query = supabase.from('bus_fuel_logs').select(SELECT).order('filled_at', { ascending: false }).limit(limit);

  // Scoped on the *bus*, not on bus_fuel_logs.company_id: the stamp trigger
  // fills that in, but a row inserted before the bus had a company would slip
  // through a filter on the log's own column.
  const scope = companyScope(auth.profile);
  if (scope) query = query.eq('bus.company_id', scope);
  if (busId) query = query.eq('bus_id', busId);
  if (from) query = query.gte('filled_at', from);
  if (to) query = query.lt('filled_at', to);

  const { data, error } = await query;
  if (error) return serverError(error);

  return NextResponse.json({ fuelLogs: data || [] });
}

export async function POST(request) {
  const auth = await requireFleetUser();
  if (auth.error) return denied(auth);

  const body = await request.json().catch(() => ({}));
  const { valid, errors } = validateFuelEntry(body);
  if (!valid) return badRequest('Verifique os campos assinalados.', errors);

  const supabase = createSupabaseAdminClient();

  const { data: bus } = await supabase
    .from('buses')
    .select('id, license_plate, company_id')
    .eq('id', body.bus_id)
    .maybeSingle();
  if (!bus) return badRequest('Autocarro não encontrado.', { bus_id: 'Inválido.' });

  const scope = companyScope(auth.profile);
  if (scope && bus.company_id !== scope) {
    return NextResponse.json({ error: 'Sem acesso a este autocarro.' }, { status: 403 });
  }

  // The previous fill, needed for the consumption figure shown on save (§6.3).
  // Read before the insert so the new row is not its own predecessor.
  const filledAt = body.filled_at || body.queued_at || new Date().toISOString();
  const { data: previousRows } = await supabase
    .from('bus_fuel_logs')
    .select('odometer_km, litres, is_full_tank, filled_at, total_cost_kz')
    .eq('bus_id', bus.id)
    .lt('filled_at', filledAt)
    .order('filled_at', { ascending: false })
    .limit(1);
  const previous = previousRows?.[0] || null;

  // price_per_litre_kz and total_cost_kz are deliberately left out when blank:
  // the b_apply_fuel_price trigger derives them from the price in force at
  // filled_at (§4.3), which is what makes a backdated entry price correctly.
  const row = {
    bus_id: bus.id,
    filled_at: filledAt,
    litres: parseAmount(body.litres),
    odometer_km: parseAmount(body.odometer_km),
    fuel_type: body.fuel_type || 'diesel',
    station: body.station?.trim() || null,
    driver_id: body.driver_id || null,
    trip_id: body.trip_id || null,
    receipt_url: body.receipt_url || null,
    notes: body.notes?.trim() || null,
    is_full_tank: body.is_full_tank !== false,
    recorded_by: auth.user.id,
  };
  const price = parseAmount(body.price_per_litre_kz);
  const total = parseAmount(body.total_cost_kz);
  if (price !== null) row.price_per_litre_kz = price;
  if (total !== null) row.total_cost_kz = total;

  // total_cost_kz is NOT NULL with no default, and the trigger only fills it
  // when a price exists. If neither is available the insert would fail with a
  // constraint error that means nothing to an agent.
  if (total === null && price === null) {
    const { data: configured } = await supabase.rpc('fuel_price_at', {
      p_at: filledAt,
      p_fuel_type: row.fuel_type,
      p_company_id: bus.company_id,
    });
    if (configured === null || configured === undefined) {
      return badRequest('Indique o preço por litro ou o total — não há preço configurado.', {
        price_per_litre_kz: 'Obrigatório.',
      });
    }
  }

  const { data, error } = await supabase.from('bus_fuel_logs').insert(row).select(SELECT).single();
  if (error) return NextResponse.json({ error: friendlyDbError(error) }, { status: 400 });

  // The DB trigger already wrote the fleet_notifications row that drives the
  // in-app feed (§4.5). Push covers the app-closed case, and must never be
  // able to fail the refuelling itself.
  await pushQuietly(
    {
      title: `${bus.license_plate} abastecido`,
      body: `${formatLitres(data.litres)} · ${formatKz(data.total_cost_kz)}`,
      url: `/frota/${bus.id}`,
      tag: `fuel-${bus.id}`,
    },
    { exceptUserId: auth.user.id }
  );

  return NextResponse.json(
    { fuelLog: data, consumption: consumptionBetween(previous, data) },
    { status: 201 }
  );
}
