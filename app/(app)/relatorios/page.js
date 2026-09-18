import { redirect } from 'next/navigation';
import { requireStaff, companyScope } from '@/lib/auth';
import { listBusStatus, getCompany } from '@/lib/queries';
import { createSupabaseAdminClient } from '@/lib/supabase-admin';
import { resolvePeriod } from '@/lib/periods';
import { loadFuelReport } from '@/lib/fuel-report';
import RelatoriosView from './RelatoriosView';

export const metadata = { title: 'Relatórios' };
export const dynamic = 'force-dynamic';

export default async function RelatoriosPage() {
  const auth = await requireStaff();
  if (auth.error) redirect('/login');

  const companyId = companyScope(auth.profile);
  const supabase = createSupabaseAdminClient();
  const [buses, company, initialReport] = await Promise.all([
    listBusStatus(companyId),
    getCompany(companyId ?? auth.profile.company_id),
    loadFuelReport({
      supabase,
      period: resolvePeriod('this_month'),
      companyId,
    }),
  ]);

  return <RelatoriosView buses={buses} company={company} profile={auth.profile} initialReport={initialReport} />;
}
