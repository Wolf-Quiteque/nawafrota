import { redirect } from 'next/navigation';
import { requireFleetUser, companyScope } from '@/lib/auth';
import { createSupabaseAdminClient } from '@/lib/supabase-admin';
import { listBusStatus } from '@/lib/queries';
import { isStaffRole } from '@/lib/session';
import ManutencaoView from './ManutencaoView';

export const metadata = { title: 'Manutenção' };
export const dynamic = 'force-dynamic';

export default async function ManutencaoPage() {
  const auth = await requireFleetUser();
  if (auth.error) redirect('/login');

  const companyId = companyScope(auth.profile);
  const supabase = createSupabaseAdminClient();

  const [buses, issuesResult] = await Promise.all([
    listBusStatus(companyId),
    supabase
      .from('bus_maintenance')
      .select(
        'id, bus_id, title, description, severity, status, reported_at, scheduled_for, ' +
          'completed_at, cost_kz, workshop, takes_bus_offline, ' +
          'bus:buses!inner(license_plate, company_id, is_active), ' +
          'reporter:profiles!bus_maintenance_reported_by_fkey(first_name, last_name)'
      )
      .order('reported_at', { ascending: false })
      .limit(200),
  ]);

  const issues = (issuesResult.data || []).filter(
    (row) => !companyId || row.bus?.company_id === companyId
  );

  return (
    <ManutencaoView
      initialIssues={issues}
      buses={buses.filter((b) => b.is_active)}
      canResolve={isStaffRole(auth.profile.role)}
    />
  );
}
