import { requireStaff, companyScope } from '@/lib/auth';
import { createSupabaseAdminClient } from '@/lib/supabase-admin';
import { denied, serverError } from '@/lib/api';
import { resolvePeriod } from '@/lib/periods';
import { toCsv, csvNumber, csvFilename } from '@/lib/csv';
import { formatDateTime } from '@/lib/format';

/**
 * Two exports, both with Portuguese column headers (§2.5):
 *   kind=summary  one row per bus, matching what /relatorios shows
 *   kind=logs     every individual refuelling in the period
 */
export async function GET(request) {
  const auth = await requireStaff();
  if (auth.error) return denied(auth);

  const { searchParams } = new URL(request.url);
  const kind = searchParams.get('kind') === 'logs' ? 'logs' : 'summary';
  const period = resolvePeriod(searchParams.get('period') || 'this_month', {
    from: searchParams.get('from'),
    to: searchParams.get('to'),
  });
  const busId = searchParams.get('bus_id');
  const companyId = companyScope(auth.profile);

  try {
    const supabase = createSupabaseAdminClient();
    const csv =
      kind === 'logs'
        ? await logsCsv(supabase, period, companyId, busId)
        : await summaryCsv(supabase, period, companyId, busId);

    return new Response(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${csvFilename(
          kind === 'logs' ? 'abastecimentos' : 'resumo-combustivel',
          period.fromYmd,
          period.toYmd
        )}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    return serverError(err);
  }
}

async function summaryCsv(supabase, period, companyId, busId) {
  const { data, error } = await supabase.rpc('fleet_fuel_summary', {
    p_from: period.from,
    p_to: period.to,
    p_company_id: companyId,
  });
  if (error) throw error;

  const rows = (data || []).filter((r) => !busId || r.bus_id === busId);

  return toCsv(
    [
      'Matrícula',
      'Abastecimentos',
      'Litros',
      'Custo (Kz)',
      'Preço médio (Kz/L)',
      'Quilómetros',
      'Consumo (L/100 km)',
      'Custo por km (Kz)',
    ],
    rows.map((r) => [
      r.license_plate,
      r.fills,
      csvNumber(r.total_litres, 2),
      csvNumber(r.total_cost_kz, 2),
      csvNumber(r.avg_price_per_litre_kz, 2),
      r.km_travelled ?? '',
      csvNumber(r.litres_per_100km, 2),
      csvNumber(r.cost_per_km_kz, 2),
    ])
  );
}

async function logsCsv(supabase, period, companyId, busId) {
  let query = supabase
    .from('bus_fuel_logs')
    .select(
      'filled_at, litres, price_per_litre_kz, total_cost_kz, odometer_km, station, notes, is_full_tank, ' +
        'bus:buses!inner(license_plate, company_id), ' +
        'driver:profiles!bus_fuel_logs_driver_id_fkey(first_name, last_name)'
    )
    .gte('filled_at', period.from)
    .lt('filled_at', period.to)
    .order('filled_at', { ascending: true });

  if (companyId) query = query.eq('bus.company_id', companyId);
  if (busId) query = query.eq('bus_id', busId);

  const { data, error } = await query;
  if (error) throw error;

  return toCsv(
    [
      'Data',
      'Matrícula',
      'Litros',
      'Preço por litro (Kz)',
      'Total (Kz)',
      'Quilometragem',
      'Depósito cheio',
      'Posto',
      'Motorista',
      'Notas',
    ],
    (data || []).map((r) => [
      // Luanda time, never a raw UTC stamp (§2.4) — the spreadsheet is read by
      // people who were standing at the pump.
      formatDateTime(r.filled_at),
      r.bus?.license_plate ?? '',
      csvNumber(r.litres, 2),
      csvNumber(r.price_per_litre_kz, 2),
      csvNumber(r.total_cost_kz, 2),
      r.odometer_km ?? '',
      r.is_full_tank ? 'Sim' : 'Não',
      r.station ?? '',
      [r.driver?.first_name, r.driver?.last_name].filter(Boolean).join(' '),
      r.notes ?? '',
    ])
  );
}

export const dynamic = 'force-dynamic';
