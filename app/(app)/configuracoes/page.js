import { redirect } from 'next/navigation';
import { requireFleetUser, companyScope } from '@/lib/auth';
import { createSupabaseAdminClient } from '@/lib/supabase-admin';
import { fuelPriceAt } from '@/lib/queries';
import ConfiguracoesView from './ConfiguracoesView';

export const metadata = { title: 'Configurações' };
export const dynamic = 'force-dynamic';

export default async function ConfiguracoesPage() {
  const auth = await requireFleetUser();
  if (auth.error) redirect('/login');

  const companyId = companyScope(auth.profile);
  const supabase = createSupabaseAdminClient();

  const [currentPrice, historyResult] = await Promise.all([
    fuelPriceAt(new Date().toISOString(), companyId),
    supabase
      .from('fleet_fuel_prices')
      .select(
        'id, price_per_litre_kz, effective_from, note, created_at, ' +
          'author:profiles!fleet_fuel_prices_set_by_fkey(first_name, last_name)'
      )
      .eq('fuel_type', 'diesel')
      .order('effective_from', { ascending: false })
      .limit(50),
  ]);

  const now = Date.now();
  const history = (historyResult.data || []).map((row) => ({
    ...row,
    price_per_litre_kz: Number(row.price_per_litre_kz),
    scheduled: new Date(row.effective_from).getTime() > now,
  }));

  return (
    <ConfiguracoesView
      currentPrice={currentPrice}
      history={history}
      isAdmin={auth.profile.role === 'admin'}
    />
  );
}
