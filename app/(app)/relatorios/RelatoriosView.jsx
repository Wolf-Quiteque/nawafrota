'use client';

import { useMemo, useState } from 'react';
import { BarChart3, Download, Printer, TriangleAlert } from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import Select from '@/components/ui/Select';
import Input from '@/components/ui/Input';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import EmptyState from '@/components/ui/EmptyState';
import Skeleton from '@/components/ui/Skeleton';
import FuelChart from '@/components/FuelChart';
import PrintHeader from '@/components/PrintHeader';
import { useApi } from '@/lib/useApi';
import { PERIODS } from '@/lib/periods';
import {
  formatKz,
  formatKzPrecise,
  formatLitres,
  formatKm,
  formatConsumption,
  formatNumber,
} from '@/lib/format';

export default function RelatoriosView({ buses, company, profile, initialReport }) {
  const [period, setPeriod] = useState('this_month');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [busId, setBusId] = useState('');

  const query = useMemo(() => {
    const params = new URLSearchParams({ period });
    if (period === 'custom') {
      if (from) params.set('from', from);
      if (to) params.set('to', to);
    }
    if (busId) params.set('bus_id', busId);
    return params.toString();
  }, [period, from, to, busId]);

  const { data, loading, error } = useApi(`/api/reports/fuel?${query}`, {
    initialData: initialReport,
  });

  const exportHref = `/api/reports/export?${query}`;
  const selectedBus = buses.find((b) => b.bus_id === busId);
  const rows = data?.rows || [];

  return (
    <div>
      <div className="no-print">
        <PageHeader
          title="Relatórios"
          subtitle="Custo e consumo de combustível"
          action={
            <Button size="sm" variant="secondary" onClick={() => window.print()}>
              <Printer size={15} />
              Imprimir
            </Button>
          }
        />

        <div className="filters flex flex-col gap-2.5">
          <Select value={period} onChange={(e) => setPeriod(e.target.value)} aria-label="Período">
            {Object.entries(PERIODS).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </Select>

          {period === 'custom' ? (
            <div className="grid grid-cols-2 gap-2.5">
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="De" />
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} aria-label="Até" />
            </div>
          ) : null}

          <Select value={busId} onChange={(e) => setBusId(e.target.value)} aria-label="Autocarro">
            <option value="">Toda a frota</option>
            {buses.map((bus) => (
              <option key={bus.bus_id} value={bus.bus_id}>
                {bus.license_plate}
              </option>
            ))}
          </Select>
        </div>
      </div>

      <PrintHeader
        company={company}
        title="Relatório de combustível"
        periodLabel={data?.period?.label ? `Período: ${data.period.label}` : 'Período selecionado'}
        filterLabel={selectedBus ? `Apenas ${selectedBus.license_plate}` : 'Toda a frota'}
        generatedBy={profile}
      />

      {error ? (
        <p className="mt-4 rounded-2xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
          {error}
        </p>
      ) : null}

      {loading && !data ? (
        <div className="mt-4 flex flex-col gap-3">
          <Skeleton className="h-24" />
          <Skeleton className="h-40" />
          <Skeleton className="h-52" />
        </div>
      ) : null}

      {data ? (
        <>
          <div className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            <Summary label="Custo total" value={formatKz(data.totals.cost_kz)} />
            <Summary label="Litros" value={formatLitres(data.totals.litres)} />
            <Summary label="Abastecimentos" value={formatNumber(data.totals.fills)} />
            <Summary label="Quilómetros" value={formatKm(data.totals.km)} />
          </div>

          <section className="avoid-break mt-4 rounded-2xl border border-border bg-surface p-4">
            <h2 className="mb-3 text-sm font-bold">Gasto mensal</h2>
            <FuelChart data={data.monthly} />
          </section>

          {data.fleetAverage ? (
            <p className="mt-3 text-xs text-muted-foreground">
              Média da frota: {formatConsumption(data.fleetAverage)}. Assinalados a laranja os
              autocarros mais de 20 % acima — normalmente avaria mecânica ou desvio de combustível.
            </p>
          ) : null}

          {rows.length ? (
            <div className="avoid-break mt-3 overflow-x-auto rounded-2xl border border-border bg-surface">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-muted-foreground">
                    <th className="p-3 font-semibold">Matrícula</th>
                    <th className="p-3 font-semibold">Abast.</th>
                    <th className="p-3 font-semibold">Litros</th>
                    <th className="p-3 font-semibold">Custo</th>
                    <th className="p-3 font-semibold">Km</th>
                    <th className="p-3 font-semibold">L/100 km</th>
                    <th className="p-3 font-semibold">Kz/km</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr
                      key={row.bus_id}
                      className={
                        row.is_outlier
                          ? 'avoid-break border-b border-border bg-warning/15 last:border-0'
                          : 'avoid-break border-b border-border last:border-0'
                      }
                    >
                      <td className="p-3 font-medium">
                        {row.license_plate}
                        {row.is_outlier ? (
                          <Badge tone="warning" className="ml-2">
                            <TriangleAlert size={11} />
                            Acima da média
                          </Badge>
                        ) : null}
                      </td>
                      <td className="p-3">{row.fills}</td>
                      <td className="p-3">{formatLitres(row.total_litres)}</td>
                      <td className="p-3">
                        {formatKz(row.total_cost_kz)}
                        <span className="block text-xs text-muted-foreground">
                          {row.avg_price_per_litre_kz
                            ? `${formatKzPrecise(row.avg_price_per_litre_kz)}/L`
                            : ''}
                        </span>
                      </td>
                      <td className="p-3">{formatKm(row.km_travelled)}</td>
                      <td className="p-3">{formatConsumption(row.litres_per_100km)}</td>
                      <td className="p-3">
                        {row.cost_per_km_kz ? formatKz(row.cost_per_km_kz) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
                {/* In tfoot so it survives pagination sensibly (§6.5). */}
                <tfoot>
                  <tr className="bg-muted/50 font-semibold">
                    <td className="p-3">Total</td>
                    <td className="p-3">{data.totals.fills}</td>
                    <td className="p-3">{formatLitres(data.totals.litres)}</td>
                    <td className="p-3">{formatKz(data.totals.cost_kz)}</td>
                    <td className="p-3">{formatKm(data.totals.km)}</td>
                    <td className="p-3">{formatConsumption(data.fleetAverage)}</td>
                    <td className="p-3">—</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          ) : (
            <div className="mt-4">
              <EmptyState
                icon={BarChart3}
                title="Sem abastecimentos no período"
                description="Escolha outro período ou registe um abastecimento."
              />
            </div>
          )}

          <div className="no-print mt-4 flex flex-col gap-2">
            {/* A plain link, not fetch(): the browser handles the
                Content-Disposition attachment itself, which is what makes the
                file land in Downloads on Android rather than in memory. */}
            <a href={`${exportHref}&kind=summary`} download>
              <Button variant="secondary" className="w-full">
                <Download size={15} />
                Exportar resumo (CSV)
              </Button>
            </a>
            <a href={`${exportHref}&kind=logs`} download>
              <Button variant="ghost" className="w-full">
                <Download size={15} />
                Exportar abastecimentos (CSV)
              </Button>
            </a>
          </div>
        </>
      ) : null}
    </div>
  );
}

function Summary({ label, value }) {
  return (
    <div className="avoid-break rounded-2xl border border-border bg-surface p-3.5">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-1.5 text-lg font-extrabold leading-none tracking-tight">{value}</p>
    </div>
  );
}
