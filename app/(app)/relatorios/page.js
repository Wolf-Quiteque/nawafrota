import { redirect } from 'next/navigation';
import { requireStaff, companyScope } from '@/lib/auth';
import { listBusStatus, getCompany } from '@/lib/queries';
import RelatoriosView from './RelatoriosView';

export const metadata = { title: 'Relatórios' };
export const dynamic = 'force-dynamic';

export default async function RelatoriosPage() {
  const auth = await requireStaff();
  if (auth.error) redirect('/login');

  const companyId = companyScope(auth.profile);
  const [buses, company] = await Promise.all([
    listBusStatus(companyId),
    getCompany(companyId ?? auth.profile.company_id),
  ]);

  return <RelatoriosView buses={buses} company={company} profile={auth.profile} />;
}
