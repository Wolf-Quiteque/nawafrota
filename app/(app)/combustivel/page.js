import { redirect } from 'next/navigation';
import { requireFleetUser, companyScope } from '@/lib/auth';
import { createSupabaseAdminClient } from '@/lib/supabase-admin';
import { listBusStatus, listDrivers, fuelPriceAt } from '@/lib/queries';
import CombustivelView from './CombustivelView';

export const metadata = { title: 'Combustível' };
export const dynamic = 'force-dynamic';

export default async function CombustivelPage() {
  const auth = await requireFleetUser();
  if (auth.error) redirect('/login');

  const companyId = companyScope(auth.profile);
  const supabase = createSupabaseAdminClient();

  let logsQuery = supabase
    .from('bus_fuel_logs')
    .select(
      'id, bus_id, filled_at, litres, price_per_litre_kz, total_cost_kz, odometer_km, station, ' +
        'is_full_tank, receipt_url, notes, driver_id, recorded_by, ' +
        'bus:buses!inner(license_plate, make, model, company_id), ' +
        'driver:profiles!bus_fuel_logs_driver_id_fkey(first_name, last_name)'
    )
    .order('filled_at', { ascending: false })
    .limit(100);
  if (companyId) logsQuery = logsQuery.eq('bus.company_id', companyId);

  const [buses, drivers, currentPrice, logsResult] = await Promise.all([
    listBusStatus(companyId),
    listDrivers(companyId),
    fuelPriceAt(new Date().toISOString(), companyId),
    logsQuery,
  ]);
  if (logsResult.error) throw logsResult.error;

  const logs = logsResult.data || [];

  return (
    <CombustivelView
      initialLogs={logs}
      // Only buses that can actually be filled: a retired bus in the picker is
      // noise at a filling station.
      buses={buses.filter((b) => b.is_active)}
      drivers={drivers}
      currentPrice={currentPrice}
      // Who is looking, so the list can offer only what they may actually do:
      // anyone on staff corrects a row, but an agent deletes only their own.
      viewer={{ id: auth.user.id, isAdmin: auth.profile.role === 'admin' }}
    />
  );
}
