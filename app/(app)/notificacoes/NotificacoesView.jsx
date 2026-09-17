'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCheck } from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import Button from '@/components/ui/Button';
import NotificationList from '@/components/NotificationList';
import { mergeIncoming, unreadCount } from '@/lib/notifications';

export default function NotificacoesView({ initialNotifications }) {
  const [items, setItems] = useState(initialNotifications);
  const [marking, setMarking] = useState(false);
  const router = useRouter();
  const held = useRef(null);

  // Same realtime subscription as the bell (§7.1) — the feed is the screen
  // somebody leaves open, so it must not go stale while they watch it.
  useEffect(() => {
    let cancelled = false;

    (async () => {
      const { getSupabaseBrowserClient } = await import('@/lib/supabase-browser');
      if (cancelled) return;
      const supabase = getSupabaseBrowserClient();
      const channel = supabase
        .channel('fleet-notifications-feed')
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'fleet_notifications' },
          ({ new: row }) => setItems((current) => mergeIncoming(current, row))
        )
        .subscribe();
      held.current = { supabase, channel };
    })();

    return () => {
      cancelled = true;
      if (held.current) held.current.supabase.removeChannel(held.current.channel);
    };
  }, []);

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

  return (
    <div>
      <PageHeader
        title="Notificações"
        subtitle={unread ? `${unread} por ler` : 'Tudo lido'}
        action={
          unread ? (
            <Button size="sm" variant="secondary" onClick={markAllRead} loading={marking}>
              <CheckCheck size={15} />
              Marcar lidas
            </Button>
          ) : null
        }
      />

      <NotificationList
        notifications={items}
        onSelect={(n) => router.push(n.bus_id ? `/frota/${n.bus_id}` : '/notificacoes')}
        emptyTitle="Sem notificações"
        emptyDescription="Os abastecimentos e as avarias aparecem aqui assim que forem registados."
      />
    </div>
  );
}
