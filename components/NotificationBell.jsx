'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Bell, CheckCheck } from 'lucide-react';
import Sheet from '@/components/ui/Sheet';
import Button from '@/components/ui/Button';
import NotificationList from '@/components/NotificationList';
import { mergeIncoming, unreadCount } from '@/lib/notifications';

/**
 * In-app realtime feed (§7.1). This is the layer that works everywhere —
 * push only adds the app-closed case, and iOS only delivers it to an installed
 * PWA, so the bell must never depend on push being available.
 */
export default function NotificationBell() {
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const [marking, setMarking] = useState(false);
  const router = useRouter();
  const channelRef = useRef(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/notifications?limit=50');
      if (!res.ok) return;
      const body = await res.json();
      setItems(body.notifications || []);
    } catch {
      // Offline. The bell simply shows what it last had.
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    let cancelled = false;

    // supabase-js is ~35kB and the bell is the only thing on a normal screen
    // that needs it, so it is loaded after the screen has painted.
    (async () => {
      const { getSupabaseBrowserClient } = await import('@/lib/supabase-browser');
      if (cancelled) return;
      const supabase = getSupabaseBrowserClient();

      const channel = supabase
        .channel('fleet-notifications')
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'fleet_notifications' },
          ({ new: row }) => setItems((current) => mergeIncoming(current, row))
        )
        .subscribe();

      channelRef.current = { supabase, channel };
    })();

    return () => {
      cancelled = true;
      const held = channelRef.current;
      if (held) held.supabase.removeChannel(held.channel);
    };
  }, []);

  // A realtime connection can drop while the phone is asleep and silently miss
  // inserts. Re-fetching when the tab comes back is cheaper than trying to
  // detect that.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') load();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', load);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', load);
    };
  }, [load]);

  const unread = unreadCount(items);

  const markAllRead = async () => {
    setMarking(true);
    try {
      await fetch('/api/notifications/read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: items.filter((n) => !n.read).map((n) => n.id) }),
      });
      setItems((current) => current.map((n) => ({ ...n, read: true })));
    } finally {
      setMarking(false);
    }
  };

  const openNotification = (notification) => {
    setOpen(false);
    if (notification.bus_id) router.push(`/frota/${notification.bus_id}`);
    else router.push('/notificacoes');
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="press-scale relative flex h-9 w-9 items-center justify-center rounded-full bg-muted text-foreground"
        aria-label={unread ? `Notificações, ${unread} por ler` : 'Notificações'}
      >
        <Bell size={18} />
        {unread > 0 ? (
          <span className="absolute -right-0.5 -top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-danger px-1 text-[10px] font-bold leading-none text-danger-foreground">
            {unread > 99 ? '99+' : unread}
          </span>
        ) : null}
      </button>

      <Sheet open={open} onClose={() => setOpen(false)} title="Notificações">
        <div className="pb-6">
          {unread > 0 ? (
            <Button
              variant="secondary"
              size="sm"
              className="mb-3 w-full"
              onClick={markAllRead}
              loading={marking}
            >
              <CheckCheck size={15} />
              Marcar todas como lidas
            </Button>
          ) : null}
          <NotificationList
            notifications={items.slice(0, 20)}
            onSelect={openNotification}
            emptyTitle="Sem notificações"
            emptyDescription="Os abastecimentos e as avarias aparecem aqui."
          />
          <Button
            variant="ghost"
            size="sm"
            className="mt-3 w-full"
            onClick={() => {
              setOpen(false);
              router.push('/notificacoes');
            }}
          >
            Ver todas
          </Button>
        </div>
      </Sheet>
    </>
  );
}
