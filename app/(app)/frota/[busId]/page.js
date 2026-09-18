import { notFound, redirect } from 'next/navigation';
import { requireStaff, companyScope } from '@/lib/auth';
import { createSupabaseAdminClient } from '@/lib/supabase-admin';
import { getBusStatus, maxSoldSeatForBus, getCompany, listDrivers, fuelPriceAt } from '@/lib/queries';
import BusDetailView from './BusDetailView';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Autocarro' };

export default async function BusDetailPage({ params }) {
  const { busId } = await params;
  const auth = await requireStaff();
  if (auth.error) redirect('/login');

  const companyId = companyScope(auth.profile);
  const bus = await getBusStatus(busId, companyId);
  if (!bus) notFound();

  const supabase = createSupabaseAdminClient();

  const [fuelResult, issuesResult, maxSoldSeat, company, drivers, currentPrice] = await Promise.all([
    supabase
      .from('bus_fuel_logs')
      .select(
        'id, filled_at, litres, price_per_litre_kz, total_cost_kz, odometer_km, station, notes, ' +
          'is_full_tank, receipt_url, driver:profiles!bus_fuel_logs_driver_id_fkey(first_name, last_name)'
      )
      .eq('bus_id', busId)
      .order('filled_at', { ascending: false })
      .limit(200),
    supabase
      .from('bus_maintenance')
      .select(
        'id, title, description, severity, status, reported_at, scheduled_for, completed_at, ' +
          'cost_kz, workshop, takes_bus_offline, ' +
          'reporter:profiles!bus_maintenance_reported_by_fkey(first_name, last_name)'
      )
      .eq('bus_id', busId)
      .order('reported_at', { ascending: false })
      .limit(100),
    maxSoldSeatForBus(busId),
    getCompany(bus.company_id),
    listDrivers(companyId),
    fuelPriceAt(new Date().toISOString(), companyId),
  ]);
  if (fuelResult.error) throw fuelResult.error;
  if (issuesResult.error) throw issuesResult.error;

  return (
    <BusDetailView
      bus={bus}
      fuelLogs={fuelResult.data || []}
      issues={issuesResult.data || []}
      maxSoldSeat={maxSoldSeat}
      company={company}
      drivers={drivers}
      currentPrice={currentPrice}
      profile={auth.profile}
    />
  );
}
