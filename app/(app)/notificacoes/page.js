import { redirect } from 'next/navigation';
import { requireFleetUser, companyScope } from '@/lib/auth';
import { createSupabaseAdminClient } from '@/lib/supabase-admin';
import { markReadState } from '@/lib/notifications';
import { scopeToCompany } from '@/lib/api';
import NotificacoesView from './NotificacoesView';

export const metadata = { title: 'Notificações' };
export const dynamic = 'force-dynamic';

export default async function NotificacoesPage() {
  const auth = await requireFleetUser();
  if (auth.error) redirect('/login');

  const supabase = createSupabaseAdminClient();
  let query = supabase
    .from('fleet_notifications')
    .select('id, kind, title, body, bus_id, entity_id, created_at')
    .order('created_at', { ascending: false })
    .limit(100);
  query = scopeToCompany(query, companyScope(auth.profile));

  const { data, error } = await query;
  if (error) throw error;
  const ids = (data || []).map((n) => n.id);

  const { data: reads, error: readsError } = ids.length
    ? await supabase
        .from('fleet_notification_reads')
        .select('notification_id')
        .eq('user_id', auth.user.id)
        .in('notification_id', ids)
    : { data: [] };
  if (readsError) throw readsError;

  const notifications = markReadState(data, (reads || []).map((r) => r.notification_id));

  return <NotificacoesView initialNotifications={notifications} />;
}
