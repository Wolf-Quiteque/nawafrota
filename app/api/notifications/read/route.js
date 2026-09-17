import { NextResponse } from 'next/server';
import { requireFleetUser, companyScope } from '@/lib/auth';
import { createSupabaseAdminClient } from '@/lib/supabase-admin';
import { denied, serverError, scopeToCompany } from '@/lib/api';

/**
 * Marks notifications read for the caller. With no ids, marks everything
 * currently visible to them — the "marcar todas como lidas" action.
 */
export async function POST(request) {
  const auth = await requireFleetUser();
  if (auth.error) return denied(auth);

  const body = await request.json().catch(() => ({}));
  const supabase = createSupabaseAdminClient();

  try {
    let ids = Array.isArray(body.ids) ? body.ids.filter(Boolean) : null;

    if (!ids?.length) {
      let query = supabase
        .from('fleet_notifications')
        .select('id')
        .order('created_at', { ascending: false })
        .limit(500);
      query = scopeToCompany(query, companyScope(auth.profile));
      const { data, error } = await query;
      if (error) throw error;
      ids = (data || []).map((n) => n.id);
    }

    if (!ids.length) return NextResponse.json({ ok: true, marked: 0 });

    // Upsert, not insert: the primary key is (notification_id, user_id), so
    // re-marking something already read must be a no-op rather than a 23505.
    const { error } = await supabase.from('fleet_notification_reads').upsert(
      ids.map((notification_id) => ({ notification_id, user_id: auth.user.id })),
      { onConflict: 'notification_id,user_id', ignoreDuplicates: true }
    );
    if (error) throw error;

    return NextResponse.json({ ok: true, marked: ids.length });
  } catch (err) {
    return serverError(err);
  }
}
