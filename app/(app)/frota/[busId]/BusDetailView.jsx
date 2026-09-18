'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Fuel,
  Wrench,
  Pencil,
  Power,
  PowerOff,
  Printer,
  Plus,
  Users,
  Gauge,
  Calendar,
  MapPin,
  Paperclip,
} from 'lucide-react';
import BackButton from '@/components/BackButton';
import BusStateBadge from '@/components/BusStateBadge';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import EmptyState from '@/components/ui/EmptyState';
import StatTile from '@/components/StatTile';
import FuelChart from '@/components/FuelChart';
import FuelLogSheet from '@/components/FuelLogSheet';
import MaintenanceSheet from '@/components/MaintenanceSheet';
import PrintHeader from '@/components/PrintHeader';
import { useToast } from '@/components/ui/Toast';
import { cn } from '@/lib/cn';
import {
  formatKz,
  formatKzPrecise,
  formatLitres,
  formatKm,
  formatConsumption,
  formatDate,
  formatDateTime,
} from '@/lib/format';
import { withConsumption, averageConsumption } from '@/lib/fuel';
import { severityLabel, severityTone, statusLabel, statusTone, sortIssues, OPEN_STATUSES } from '@/lib/maintenance';
import { sellableSeatCount } from '@/lib/seats';

const TABS = [
  { key: 'resumo', label: 'Resumo' },
  { key: 'combustivel', label: 'Combustível' },
  { key: 'manutencao', label: 'Manutenção' },
];

export default function BusDetailView({
  bus,
  fuelLogs,
  issues,
  maxSoldSeat,
  company,
  drivers,
  currentPrice,
  profile,
}) {
  const [fuelRows, setFuelRows] = useState(fuelLogs);
  const [issueRows, setIssueRows] = useState(issues);
  const [tab, setTab] = useState('resumo');
  const [fuelOpen, setFuelOpen] = useState(false);
  const [maintOpen, setMaintOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const router = useRouter();

  useEffect(() => setFuelRows(fuelLogs), [fuelLogs]);
  useEffect(() => setIssueRows(issues), [issues]);

  // Newest first on screen, but the consumption maths needs oldest-first pairs.
  const enriched = useMemo(() => withConsumption(fuelRows).reverse(), [fuelRows]);
  const avgConsumption = useMemo(() => averageConsumption(fuelRows), [fuelRows]);

  const lifetime = useMemo(
    () =>
      (fuelRows || []).reduce(
        (acc, f) => ({
          cost: acc.cost + Number(f.total_cost_kz || 0),
          litres: acc.litres + Number(f.litres || 0),
        }),
        { cost: 0, litres: 0 }
      ),
    [fuelRows]
  );

  const monthly = useMemo(() => {
    const byMonth = new Map();
    for (const f of fuelRows || []) {
      const month = `${String(f.filled_at).slice(0, 7)}-01`;
      byMonth.set(month, (byMonth.get(month) || 0) + Number(f.total_cost_kz || 0));
    }
    return [...byMonth.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(-12)
      .map(([month, total_cost_kz]) => ({ month, total_cost_kz }));
  }, [fuelRows]);

  const sortedIssues = useMemo(() => sortIssues(issueRows), [issueRows]);
  const openIssues = sortedIssues.filter((i) => OPEN_STATUSES.includes(i.status));

  /**
   * Retiring a bus has immediate commercial effect — website checks is_active
   * at checkout (§2.1) — so the warning says exactly that before anything
   * happens.
   */
  const toggleActive = async () => {
    const turningOff = bus.is_active;
    if (turningOff) {
      const confirmed = window.confirm(
        'Desativar remove este autocarro da venda de bilhetes imediatamente. Continuar?'
      );
      if (!confirmed) return;
    }

    setBusy(true);
    try {
      const res = turningOff
        ? await fetch(`/api/buses/${bus.bus_id}`, { method: 'DELETE' })
        : await fetch(`/api/buses/${bus.bus_id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ is_active: true }),
          });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || 'Não foi possível guardar. Tente novamente.');

      toast(
        turningOff
          ? payload.message || 'Autocarro desativado.'
          : 'Autocarro reativado e disponível para venda.',
        'success'
      );
      router.refresh();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const resolveIssue = async (issue) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/maintenance/${issue.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'done' }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || 'Não foi possível guardar.');
      toast('Manutenção concluída.', 'success');
      setIssueRows((current) =>
        current.map((row) => (row.id === issue.id ? { ...row, ...payload.issue } : row))
      );
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <div className="no-print">
        <BackButton fallbackHref="/frota" />
      </div>

      <PrintHeader
        company={company}
        title={`Histórico de combustível — ${bus.license_plate}`}
        periodLabel={`${fuelRows.length} abastecimentos registados`}
        generatedBy={profile}
      />

      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-[26px] font-extrabold leading-tight tracking-tight">
            {bus.license_plate}
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {[bus.make, bus.model].filter(Boolean).join(' ') || 'Sem modelo'}
            {bus.year ? ` · ${bus.year}` : ''}
          </p>
        </div>
        <BusStateBadge state={bus.state} />
      </div>

      {bus.state === 'on_trip' && bus.origin_city ? (
        <p className="mt-2 flex items-center gap-1.5 rounded-2xl bg-info/10 px-3.5 py-2.5 text-sm font-medium text-info">
          <MapPin size={15} />
          {bus.origin_city} → {bus.destination_city}
          {bus.arrival_time ? ` · chega ${formatDateTime(bus.arrival_time)}` : ''}
        </p>
      ) : null}

      <div className="no-print mt-4 flex flex-wrap gap-2">
        <Button size="sm" onClick={() => setFuelOpen(true)}>
          <Fuel size={15} />
          Abastecer
        </Button>
        <Button size="sm" variant="secondary" onClick={() => setMaintOpen(true)}>
          <Wrench size={15} />
          Reportar avaria
        </Button>
        <Link href={`/frota/${bus.bus_id}/editar`}>
          <Button size="sm" variant="secondary">
            <Pencil size={15} />
            Editar
          </Button>
        </Link>
        <Button
          size="sm"
          variant={bus.is_active ? 'outline' : 'success'}
          onClick={toggleActive}
          loading={busy}
        >
          {bus.is_active ? <PowerOff size={15} /> : <Power size={15} />}
          {bus.is_active ? 'Desativar' : 'Reativar'}
        </Button>
      </div>

      <div className="no-print no-scrollbar -mx-4 mt-5 flex gap-2 overflow-x-auto px-4">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              'press-scale shrink-0 rounded-full border px-4 py-2 text-sm font-semibold',
              tab === t.key
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border bg-surface text-muted-foreground'
            )}
          >
            {t.label}
            {t.key === 'manutencao' && openIssues.length ? (
              <span className="ml-1.5 opacity-70">{openIssues.length}</span>
            ) : null}
          </button>
        ))}
      </div>

      {tab === 'resumo' ? (
        <section className="mt-4">
          <div className="grid grid-cols-2 gap-2.5">
            <StatTile icon={Users} label="Lotação" value={bus.capacity} hint={`${sellableSeatCount(bus.capacity)} lugares à venda`} />
            <StatTile icon={Gauge} label="Quilometragem" value={formatKm(bus.last_odometer_km)} />
            <StatTile icon={Fuel} tone="primary" label="Combustível (total)" value={formatKz(lifetime.cost)} hint={formatLitres(lifetime.litres)} />
            <StatTile icon={Gauge} tone="primary" label="Consumo médio" value={formatConsumption(avgConsumption)} />
          </div>

          <dl className="mt-4 divide-y divide-border rounded-2xl border border-border bg-surface">
            <Row label="Próxima viagem" value={bus.next_departure ? formatDateTime(bus.next_departure) : 'Sem viagens agendadas'} />
            <Row label="Último abastecimento" value={bus.last_filled_at ? formatDateTime(bus.last_filled_at) : 'Nunca'} />
            <Row label="Avarias em aberto" value={bus.open_issues > 0 ? `${bus.open_issues} · ${severityLabel(bus.worst_severity)}` : 'Nenhuma'} />
            <Row
              label="Lugar mais alto vendido"
              value={
                maxSoldSeat
                  ? `${maxSoldSeat} (numa viagem futura)`
                  : 'Nenhum bilhete em viagens futuras'
              }
            />
          </dl>

          {maxSoldSeat ? (
            <p className="mt-2 text-xs text-muted-foreground">
              A lotação não pode ser reduzida abaixo de {maxSoldSeat} enquanto esse bilhete existir.
            </p>
          ) : null}
        </section>
      ) : null}

      {tab === 'combustivel' ? (
        <section className="mt-4">
          <div className="no-print mb-3 flex justify-end">
            <Button size="sm" variant="secondary" onClick={() => window.print()}>
              <Printer size={15} />
              Imprimir / Guardar como PDF
            </Button>
          </div>

          {monthly.length ? (
            <div className="mb-4 rounded-2xl border border-border bg-surface p-4">
              <h2 className="mb-3 text-sm font-bold">Gasto mensal</h2>
              <FuelChart data={monthly} />
            </div>
          ) : null}

          {enriched.length ? (
            <div className="overflow-x-auto rounded-2xl border border-border bg-surface">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-muted-foreground">
                    <th className="p-3 font-semibold">Data</th>
                    <th className="p-3 font-semibold">Litros</th>
                    <th className="p-3 font-semibold">Total</th>
                    <th className="p-3 font-semibold">Km</th>
                    <th className="p-3 font-semibold">Consumo</th>
                  </tr>
                </thead>
                <tbody>
                  {enriched.map((f) => (
                    <tr key={f.id} className="avoid-break border-b border-border last:border-0">
                      <td className="p-3">
                        {formatDate(f.filled_at)}
                        {f.station ? (
                          <span className="block text-xs text-muted-foreground">{f.station}</span>
                        ) : null}
                      </td>
                      <td className="p-3">
                        {formatLitres(f.litres)}
                        {!f.is_full_tank ? (
                          <span className="block text-xs text-muted-foreground">parcial</span>
                        ) : null}
                      </td>
                      <td className="p-3">
                        {formatKz(f.total_cost_kz)}
                        <span className="block text-xs text-muted-foreground">
                          {formatKzPrecise(f.price_per_litre_kz)}/L
                        </span>
                      </td>
                      <td className="p-3">{formatKm(f.odometer_km)}</td>
                      <td className="p-3">
                        {formatConsumption(f.litres_per_100km)}
                        {f.receipt_url ? (
                          <span className="no-print mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                            <Paperclip size={11} />
                            recibo
                          </span>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-muted/50 font-semibold">
                    <td className="p-3">Total</td>
                    <td className="p-3">{formatLitres(lifetime.litres)}</td>
                    <td className="p-3">{formatKz(lifetime.cost)}</td>
                    <td className="p-3">—</td>
                    <td className="p-3">{formatConsumption(avgConsumption)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          ) : (
            <EmptyState
              icon={Fuel}
              title="Nenhum abastecimento registado"
              description="Registe o primeiro para começar a acompanhar o consumo deste autocarro."
              action={
                <Button size="sm" onClick={() => setFuelOpen(true)}>
                  <Plus size={15} />
                  Registar abastecimento
                </Button>
              }
            />
          )}
        </section>
      ) : null}

      {tab === 'manutencao' ? (
        <section className="mt-4">
          {sortedIssues.length ? (
            <ul className="flex flex-col gap-2">
              {sortedIssues.map((issue) => (
                <li
                  key={issue.id}
                  className="avoid-break rounded-2xl border border-border bg-surface p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{issue.title}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {formatDateTime(issue.reported_at)}
                        {issue.reporter
                          ? ` · ${[issue.reporter.first_name, issue.reporter.last_name].filter(Boolean).join(' ')}`
                          : ''}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <Badge tone={severityTone(issue.severity)}>{severityLabel(issue.severity)}</Badge>
                      <Badge tone={statusTone(issue.status)}>{statusLabel(issue.status)}</Badge>
                    </div>
                  </div>

                  {issue.description ? (
                    <p className="mt-2 text-sm text-muted-foreground">{issue.description}</p>
                  ) : null}

                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    {issue.scheduled_for ? (
                      <span className="flex items-center gap-1">
                        <Calendar size={12} />
                        {formatDate(issue.scheduled_for)}
                      </span>
                    ) : null}
                    {issue.workshop ? <span>{issue.workshop}</span> : null}
                    {issue.cost_kz ? <span>{formatKz(issue.cost_kz)}</span> : null}
                    {issue.takes_bus_offline ? (
                      <span className="text-warning-foreground">Impede circulação</span>
                    ) : null}
                  </div>

                  {OPEN_STATUSES.includes(issue.status) ? (
                    <Button
                      size="sm"
                      variant="secondary"
                      className="no-print mt-3"
                      onClick={() => resolveIssue(issue)}
                      loading={busy}
                    >
                      Marcar como concluída
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              icon={Wrench}
              title="Sem histórico de manutenção"
              description="Nenhuma avaria foi registada para este autocarro."
              action={
                <Button size="sm" onClick={() => setMaintOpen(true)}>
                  <Plus size={15} />
                  Reportar avaria
                </Button>
              }
            />
          )}
        </section>
      ) : null}

      <FuelLogSheet
        open={fuelOpen}
        onClose={() => setFuelOpen(false)}
        buses={[bus]}
        drivers={drivers}
        currentPrice={currentPrice}
        defaultBusId={bus.bus_id}
        onSaved={(saved) => {
          if (!saved) return;
          setFuelRows((current) =>
            [saved, ...current.filter((row) => row.id !== saved.id)].sort(
              (a, b) => new Date(b.filled_at).getTime() - new Date(a.filled_at).getTime()
            )
          );
        }}
      />
      <MaintenanceSheet
        open={maintOpen}
        onClose={() => setMaintOpen(false)}
        buses={[bus]}
        defaultBusId={bus.bus_id}
        onSaved={(saved) =>
          setIssueRows((current) => [saved, ...current.filter((row) => row.id !== saved.id)])
        }
      />
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="text-right text-sm font-medium">{value}</dd>
    </div>
  );
}
