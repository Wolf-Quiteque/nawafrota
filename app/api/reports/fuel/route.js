import { NextResponse } from 'next/server';
import { requireStaff, companyScope } from '@/lib/auth';
import { createSupabaseAdminClient } from '@/lib/supabase-admin';
import { denied, serverError, intParam } from '@/lib/api';
import { resolvePeriod, currentMonthRange, previousMonthRange, percentChange } from '@/lib/periods';
import { fleetAverageConsumption, isConsumptionOutlier } from '@/lib/fuel';

/** Numeric columns arrive from PostgREST as strings; the UI wants numbers. */
function numeric(row) {
  return {
    ...row,
    fills: Number(row.fills || 0),
    total_litres: row.total_litres === null ? null : Number(row.total_litres),
    total_cost_kz: row.total_cost_kz === null ? null : Number(row.total_cost_kz),
    avg_price_per_litre_kz:
      row.avg_price_per_litre_kz === null ? null : Number(row.avg_price_per_litre_kz),
    km_travelled: row.km_travelled === null ? null : Number(row.km_travelled),
    litres_per_100km: row.litres_per_100km === null ? null : Number(row.litres_per_100km),
    cost_per_km_kz: row.cost_per_km_kz === null ? null : Number(row.cost_per_km_kz),
  };
}

export async function GET(request) {
  const auth = await requireStaff();
  if (auth.error) return denied(auth);

  const { searchParams } = new URL(request.url);
  const period = resolvePeriod(searchParams.get('period') || 'this_month', {
    from: searchParams.get('from'),
    to: searchParams.get('to'),
  });
  const busId = searchParams.get('bus_id');
  const months = intParam(searchParams, 'months', 12, { min: 1, max: 36 });
  const companyId = companyScope(auth.profile);

  try {
    const supabase = createSupabaseAdminClient();

    const [summary, monthly, thisMonth, lastMonth] = await Promise.all([
      supabase.rpc('fleet_fuel_summary', {
        p_from: period.from,
        p_to: period.to,
        p_company_id: companyId,
      }),
      supabase.rpc('fleet_fuel_monthly', { p_months: months, p_company_id: companyId }),
      monthTotals(supabase, currentMonthRange(), companyId),
      monthTotals(supabase, previousMonthRange(), companyId),
    ]);

    if (summary.error) throw summary.error;
    if (monthly.error) throw monthly.error;

    let rows = (summary.data || []).map(numeric);
    // The fleet average is computed over the *whole* fleet before any per-bus
    // filter, so filtering down to one bus does not make it its own benchmark
    // and quietly hide that it is the outlier (§6.5).
    const fleetAverage = fleetAverageConsumption(rows);
    if (busId) rows = rows.filter((r) => r.bus_id === busId);

    rows = rows.map((r) => ({
      ...r,
      is_outlier: isConsumptionOutlier(r.litres_per_100km, fleetAverage),
    }));

    return NextResponse.json({
      period: { from: period.from, to: period.to, label: period.label, fromYmd: period.fromYmd, toYmd: period.toYmd },
      rows,
      fleetAverage,
      monthly: (monthly.data || []).map((m) => ({
        month: m.month,
        total_cost_kz: Number(m.total_cost_kz || 0),
        total_litres: Number(m.total_litres || 0),
        fills: Number(m.fills || 0),
      })),
      totals: {
        fills: rows.reduce((a, r) => a + r.fills, 0),
        litres: rows.reduce((a, r) => a + (r.total_litres || 0), 0),
        cost_kz: rows.reduce((a, r) => a + (r.total_cost_kz || 0), 0),
        km: rows.reduce((a, r) => a + (r.km_travelled || 0), 0),
      },
      thisMonth,
      lastMonth,
      changePercent: percentChange(thisMonth.cost_kz, lastMonth.cost_kz),
    });
  } catch (err) {
    return serverError(err);
  }
}

async function monthTotals(supabase, range, companyId) {
  const { data, error } = await supabase.rpc('fleet_fuel_summary', {
    p_from: range.from,
    p_to: range.to,
    p_company_id: companyId,
  });
  if (error) throw error;
  return (data || []).reduce(
    (acc, r) => ({
      cost_kz: acc.cost_kz + Number(r.total_cost_kz || 0),
      litres: acc.litres + Number(r.total_litres || 0),
      fills: acc.fills + Number(r.fills || 0),
    }),
    { cost_kz: 0, litres: 0, fills: 0 }
  );
}
