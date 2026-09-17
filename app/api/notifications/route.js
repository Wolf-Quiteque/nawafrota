import { NextResponse } from 'next/server';
import { requireFleetUser, companyScope } from '@/lib/auth';
import { createSupabaseAdminClient } from '@/lib/supabase-admin';
import { denied, serverError, scopeToCompany, intParam } from '@/lib/api';
import { markReadState, unreadCount } from '@/lib/notifications';

export async function GET(request) {
  const auth = await requireFleetUser();
  if (auth.error) return denied(auth);

  const limit = intParam(new URL(request.url).searchParams, 'limit', 50, { min: 1, max: 200 });

  try {
    const supabase = createSupabaseAdminClient();
    let query = supabase
      .from('fleet_notifications')
      .select('id, kind, title, body, bus_id, entity_id, created_at, created_by')
      .order('created_at', { ascending: false })
      .limit(limit);
    query = scopeToCompany(query, companyScope(auth.profile));

    const { data, error } = await query;
    if (error) throw error;

    // Read state is per user (§4.5), so the badge is correct for each person
    // rather than being cleared for the whole office by whoever looks first.
    const ids = (data || []).map((n) => n.id);
    const { data: reads } = ids.length
      ? await supabase
          .from('fleet_notification_reads')
          .select('notification_id')
          .eq('user_id', auth.user.id)
          .in('notification_id', ids)
      : { data: [] };

    const notifications = markReadState(data, (reads || []).map((r) => r.notification_id));

    return NextResponse.json({ notifications, unread: unreadCount(notifications) });
  } catch (err) {
    return serverError(err);
  }
}
