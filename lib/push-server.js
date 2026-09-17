import webpush from 'web-push';
import { createSupabaseAdminClient } from '@/lib/supabase-admin';

let configured = false;

/**
 * Configured lazily rather than at import time: web-push throws if the keys
 * are missing, and that would take down every route that merely *imports* this
 * module — including the refuelling write, which must never fail because push
 * is misconfigured.
 */
function ensureConfigured() {
  if (configured) return true;
  const subject = process.env.VAPID_SUBJECT;
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!subject || !publicKey || !privateKey) return false;
  webpush.setVapidDetails(subject, publicKey, privateKey);
  configured = true;
  return true;
}

async function send(subs, payload) {
  const dead = [];
  const failures = [];
  let delivered = 0;
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          payload
        );
        delivered += 1;
      } catch (err) {
        // 404/410 = the browser threw the subscription away. Anything else is
        // transient (offline device, push service hiccup) — leave it alone.
        if (err?.statusCode === 404 || err?.statusCode === 410) {
          dead.push(s.id);
          return;
        }
        // Counting a throw as delivered made the test push (§7.2f) report
        // "Enviada para 1 dispositivo(s)" when nothing had left the building,
        // which is the one thing that feature exists to rule out. Record it,
        // and log it — a silently swallowed error leaves nothing to diagnose.
        failures.push(err?.statusCode ? `HTTP ${err.statusCode}` : err?.message || 'erro desconhecido');
        console.error('push falhou', s.endpoint, err?.statusCode ?? err?.message);
      }
    })
  );
  return { dead, delivered, failures };
}

async function prune(supabase, dead) {
  if (dead.length) await supabase.from('push_subscriptions').delete().in('id', dead);
}

/** Sends to every registered device, dropping the ones that are gone. */
export async function pushToAll({ title, body, url, tag }, { exceptUserId } = {}) {
  if (!ensureConfigured()) return { sent: 0, pruned: 0, skipped: 'vapid-missing' };

  const supabase = createSupabaseAdminClient();
  let query = supabase.from('push_subscriptions').select('id, endpoint, p256dh, auth');
  // Don't notify the person who just did the thing.
  if (exceptUserId) query = query.neq('user_id', exceptUserId);

  const { data: subs, error } = await query;
  if (error) throw error;

  const { dead, delivered, failures } = await send(subs || [], JSON.stringify({ title, body, url, tag }));
  await prune(supabase, dead);
  return { devices: subs?.length || 0, sent: delivered, pruned: dead.length, failed: failures.length, failures };
}

/** The test push (§7.2f): this user's own devices only. */
export async function pushToUser(userId, { title, body, url, tag }) {
  if (!ensureConfigured()) return { sent: 0, pruned: 0, skipped: 'vapid-missing' };

  const supabase = createSupabaseAdminClient();
  const { data: subs, error } = await supabase
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .eq('user_id', userId);
  if (error) throw error;

  const { dead, delivered, failures } = await send(subs || [], JSON.stringify({ title, body, url, tag }));
  await prune(supabase, dead);
  return { devices: subs?.length || 0, sent: delivered, pruned: dead.length, failed: failures.length, failures };
}

/**
 * Fire-and-forget wrapper. Every caller is in the same position: the write
 * already succeeded, and a failed push must never turn it into an error.
 */
export async function pushQuietly(payload, options) {
  try {
    return await pushToAll(payload, options);
  } catch (err) {
    console.error('push falhou', err);
    return { sent: 0, pruned: 0, error: err?.message };
  }
}
