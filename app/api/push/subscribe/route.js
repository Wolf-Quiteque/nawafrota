import { NextResponse } from 'next/server';
import { requireFleetUser } from '@/lib/auth';
import { createSupabaseAdminClient } from '@/lib/supabase-admin';
import { denied, badRequest } from '@/lib/api';

export async function POST(request) {
  const auth = await requireFleetUser();
  if (auth.error) return denied(auth);

  const sub = await request.json().catch(() => ({}));
  if (!sub?.endpoint || !sub?.keys?.p256dh || !sub?.keys?.auth) {
    return badRequest('Subscrição inválida.');
  }

  const supabase = createSupabaseAdminClient();
  // endpoint is unique: re-subscribing on the same device updates, never
  // duplicates — and re-assigns the row if a different person signs in on a
  // shared counter phone.
  const { error } = await supabase.from('push_subscriptions').upsert(
    {
      user_id: auth.user.id,
      endpoint: sub.endpoint,
      p256dh: sub.keys.p256dh,
      auth: sub.keys.auth,
      user_agent: request.headers.get('user-agent'),
    },
    { onConflict: 'endpoint' }
  );

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(request) {
  const auth = await requireFleetUser();
  if (auth.error) return denied(auth);

  const { endpoint } = await request.json().catch(() => ({}));
  if (!endpoint) return badRequest('Subscrição inválida.');

  const supabase = createSupabaseAdminClient();
  await supabase
    .from('push_subscriptions')
    .delete()
    .eq('endpoint', endpoint)
    .eq('user_id', auth.user.id);

  return NextResponse.json({ ok: true });
}
