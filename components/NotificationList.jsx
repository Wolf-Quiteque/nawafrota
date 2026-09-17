'use client';

import { Bell, Fuel, Wrench, CircleCheck } from 'lucide-react';
import EmptyState from '@/components/ui/EmptyState';
import Badge from '@/components/ui/Badge';
import { cn } from '@/lib/cn';
import { formatDateTime } from '@/lib/format';
import { kindLabel, kindTone } from '@/lib/notifications';

const ICONS = {
  fuel_logged: Fuel,
  maintenance_opened: Wrench,
  maintenance_resolved: CircleCheck,
  bus_status_changed: Bell,
};

export default function NotificationList({
  notifications,
  onSelect,
  emptyTitle = 'Sem notificações',
  emptyDescription,
}) {
  if (!notifications?.length) {
    return <EmptyState icon={Bell} title={emptyTitle} description={emptyDescription} />;
  }

  return (
    <ul className="flex flex-col gap-2">
      {notifications.map((n, i) => {
        const Icon = ICONS[n.kind] || Bell;
        return (
          <li key={n.id}>
            <button
              onClick={() => onSelect?.(n)}
              style={{ animationDelay: `${Math.min(i, 8) * 25}ms` }}
              className={cn(
                'animate-rise-in press-scale flex w-full items-start gap-3 rounded-2xl border p-3 text-left',
                n.read ? 'border-border bg-surface' : 'border-primary/30 bg-primary/5'
              )}
            >
              <span
                className={cn(
                  'mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl',
                  n.read ? 'bg-muted text-muted-foreground' : 'bg-primary/12 text-primary'
                )}
              >
                <Icon size={17} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="truncate text-sm font-semibold">{n.title}</span>
                  {!n.read ? <span className="h-2 w-2 shrink-0 rounded-full bg-primary" /> : null}
                </span>
                {/* The database already emits pt-AO text with the right
                    separators (§4.5) — shown as-is rather than reformatted. */}
                <span className="mt-0.5 block truncate text-sm text-muted-foreground">{n.body}</span>
                <span className="mt-1.5 flex items-center gap-2">
                  <Badge tone={kindTone(n.kind)}>{kindLabel(n.kind)}</Badge>
                  <span className="text-xs text-muted-foreground">{formatDateTime(n.created_at)}</span>
                </span>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
