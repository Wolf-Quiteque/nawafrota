'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Wrench, Plus, Calendar, Ban } from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import EmptyState from '@/components/ui/EmptyState';
import MaintenanceSheet from '@/components/MaintenanceSheet';
import { useToast } from '@/components/ui/Toast';
import { cn } from '@/lib/cn';
import { formatDate, formatDateTime, formatKz } from '@/lib/format';
import {
  sortIssues,
  severityLabel,
  severityTone,
  statusLabel,
  statusTone,
  OPEN_STATUSES,
} from '@/lib/maintenance';

const BOARDS = [
  { key: 'open', label: 'Abertas' },
  { key: 'scheduled', label: 'Agendadas' },
  { key: 'done', label: 'Concluídas' },
];

export default function ManutencaoView({ initialIssues, buses, canResolve }) {
  const [board, setBoard] = useState('open');
  const [sheetOpen, setSheetOpen] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const router = useRouter();
  const toast = useToast();

  const grouped = useMemo(() => {
    const sorted = sortIssues(initialIssues);
    return {
      open: sorted.filter((i) => OPEN_STATUSES.includes(i.status)),
      // "Agendada" is an open issue with a date attached — a separate column,
      // not a separate status, because the database has no such status and
      // inventing one in the UI would make the two disagree.
      scheduled: sorted.filter((i) => OPEN_STATUSES.includes(i.status) && i.scheduled_for),
      done: sorted.filter((i) => i.status === 'done' || i.status === 'cancelled'),
    };
  }, [initialIssues]);

  const visible = grouped[board] || [];

  const advance = async (issue, status) => {
    setBusyId(issue.id);
    try {
      const res = await fetch(`/api/maintenance/${issue.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || 'Não foi possível guardar.');
      toast(status === 'done' ? 'Manutenção concluída.' : 'Manutenção em curso.', 'success');
      router.refresh();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div>
      <PageHeader
        title="Manutenção"
        subtitle={`${grouped.open.length} em aberto`}
        action={
          <Button size="sm" onClick={() => setSheetOpen(true)}>
            <Plus size={15} />
            Reportar
          </Button>
        }
      />

      <div className="filters no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4">
        {BOARDS.map((b) => (
          <button
            key={b.key}
            onClick={() => setBoard(b.key)}
            className={cn(
              'press-scale shrink-0 rounded-full border px-4 py-2 text-sm font-semibold',
              board === b.key
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border bg-surface text-muted-foreground'
            )}
          >
            {b.label}
            <span className="ml-1.5 opacity-70">{grouped[b.key].length}</span>
          </button>
        ))}
      </div>

      <div className="mt-4 flex flex-col gap-2">
        {visible.length ? (
          visible.map((issue, i) => (
            <article
              key={issue.id}
              style={{ animationDelay: `${Math.min(i, 10) * 25}ms` }}
              className="animate-rise-in rounded-2xl border border-border bg-surface p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold">{issue.title}</p>
                  <Link
                    href={`/frota/${issue.bus_id}`}
                    className="mt-0.5 block truncate text-xs font-medium text-primary"
                  >
                    {issue.bus?.license_plate}
                  </Link>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <Badge tone={severityTone(issue.severity)}>{severityLabel(issue.severity)}</Badge>
                  <Badge tone={statusTone(issue.status)}>{statusLabel(issue.status)}</Badge>
                </div>
              </div>

              {issue.description ? (
                <p className="mt-2 line-clamp-3 text-sm text-muted-foreground">{issue.description}</p>
              ) : null}

              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-muted-foreground">
                <span>{formatDateTime(issue.reported_at)}</span>
                {issue.scheduled_for ? (
                  <span className="flex items-center gap-1">
                    <Calendar size={11} />
                    {formatDate(issue.scheduled_for)}
                  </span>
                ) : null}
                {issue.workshop ? <span>{issue.workshop}</span> : null}
                {issue.cost_kz ? <span>{formatKz(issue.cost_kz)}</span> : null}
                {issue.takes_bus_offline ? (
                  <span className="flex items-center gap-1 font-medium text-warning-foreground">
                    <Ban size={11} />
                    Impede circulação
                    {issue.bus?.is_active ? ' · ainda à venda' : ''}
                  </span>
                ) : null}
              </div>

              {canResolve && OPEN_STATUSES.includes(issue.status) ? (
                <div className="mt-3 flex gap-2">
                  {issue.status === 'open' ? (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => advance(issue, 'in_progress')}
                      loading={busyId === issue.id}
                    >
                      Em curso
                    </Button>
                  ) : null}
                  <Button
                    size="sm"
                    onClick={() => advance(issue, 'done')}
                    loading={busyId === issue.id}
                  >
                    Concluir
                  </Button>
                </div>
              ) : null}
            </article>
          ))
        ) : (
          <EmptyState
            icon={Wrench}
            title={
              board === 'open'
                ? 'Nenhuma avaria em aberto'
                : board === 'scheduled'
                  ? 'Nenhuma manutenção agendada'
                  : 'Nenhuma manutenção concluída'
            }
            description={
              board === 'open' ? 'Toda a frota está sem avarias registadas.' : undefined
            }
          />
        )}
      </div>

      <MaintenanceSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        buses={buses}
        onSaved={() => router.refresh()}
      />
    </div>
  );
}
