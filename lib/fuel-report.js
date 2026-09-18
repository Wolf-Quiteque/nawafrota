import { currentMonthRange, previousMonthRange, percentChange } from '@/lib/periods';
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

async function monthTotals(supabase, range, companyId) {
  const { data, error } = await supabase.rpc('fleet_fuel_summary', {
    p_from: range.from,
    p_to: range.to,
    p_company_id: companyId,
  });
  if (error) throw error;
  return (data || []).reduce(
    (acc, row) => ({
      cost_kz: acc.cost_kz + Number(row.total_cost_kz || 0),
      litres: acc.litres + Number(row.total_litres || 0),
      fills: acc.fills + Number(row.fills || 0),
    }),
    { cost_kz: 0, litres: 0, fills: 0 }
  );
}

/** Shared by the first server render and the filter API to avoid a client waterfall. */
export async function loadFuelReport({ supabase, period, busId = null, months = 12, companyId = null }) {
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
  const fleetAverage = fleetAverageConsumption(rows);
  if (busId) rows = rows.filter((row) => row.bus_id === busId);
  rows = rows.map((row) => ({
    ...row,
    is_outlier: isConsumptionOutlier(row.litres_per_100km, fleetAverage),
  }));

  return {
    period: {
      from: period.from,
      to: period.to,
      label: period.label,
      fromYmd: period.fromYmd,
      toYmd: period.toYmd,
    },
    rows,
    fleetAverage,
    monthly: (monthly.data || []).map((row) => ({
      month: row.month,
      total_cost_kz: Number(row.total_cost_kz || 0),
      total_litres: Number(row.total_litres || 0),
      fills: Number(row.fills || 0),
    })),
    totals: {
      fills: rows.reduce((sum, row) => sum + row.fills, 0),
      litres: rows.reduce((sum, row) => sum + (row.total_litres || 0), 0),
      cost_kz: rows.reduce((sum, row) => sum + (row.total_cost_kz || 0), 0),
      km: rows.reduce((sum, row) => sum + (row.km_travelled || 0), 0),
    },
    thisMonth,
    lastMonth,
    changePercent: percentChange(thisMonth.cost_kz, lastMonth.cost_kz),
  };
}
