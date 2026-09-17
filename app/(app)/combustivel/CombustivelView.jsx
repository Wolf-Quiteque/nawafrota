'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Fuel, Plus, Search, CloudOff, Paperclip } from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import EmptyState from '@/components/ui/EmptyState';
import FuelLogSheet from '@/components/FuelLogSheet';
import { useToast } from '@/components/ui/Toast';
import { useDebounce } from '@/lib/useDebounce';
import { formatKz, formatKzPrecise, formatLitres, formatDateTime, formatKm } from '@/lib/format';
import { pendingFuelEntries } from '@/lib/offline-queue';

export default function CombustivelView({ initialLogs, buses, drivers, currentPrice }) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [busId, setBusId] = useState('');
  const [pending, setPending] = useState([]);
  const debounced = useDebounce(search, 200);
  const router = useRouter();
  const toast = useToast();

  // Entries made with no signal, still waiting to be sent (§8.2). Shown as
  // such so nobody enters the same fill twice thinking the first was lost.
  useEffect(() => {
    let alive = true;
    pendingFuelEntries().then((rows) => {
      if (alive) setPending(rows);
    });
    return () => {
      alive = false;
    };
  }, [initialLogs]);

  const visible = useMemo(() => {
    const needle = debounced.trim().toLowerCase();
    return initialLogs.filter((log) => {
      if (busId && log.bus_id !== busId) return false;
      if (!needle) return true;
      return [log.bus?.license_plate, log.station]
        .filter(Boolean)
        .some((f) => String(f).toLowerCase().includes(needle));
    });
  }, [initialLogs, debounced, busId]);

  const totals = useMemo(
    () =>
      visible.reduce(
        (acc, l) => ({
          cost: acc.cost + Number(l.total_cost_kz || 0),
          litres: acc.litres + Number(l.litres || 0),
        }),
        { cost: 0, litres: 0 }
      ),
    [visible]
  );

  return (
    <div>
      <PageHeader
        title="Combustível"
        subtitle={
          currentPrice
            ? `Gasóleo a ${formatKzPrecise(currentPrice)}/L`
            : 'Sem preço de gasóleo configurado'
        }
        action={
          <Button size="sm" onClick={() => setSheetOpen(true)}>
            <Plus size={15} />
            Registar
          </Button>
        }
      />

      {pending.length ? (
        <div className="mb-3 flex items-center gap-2 rounded-2xl border border-warning/40 bg-warning/15 px-4 py-3 text-xs text-warning-foreground">
          <CloudOff size={15} className="shrink-0" />
          {pending.length === 1
            ? '1 abastecimento por enviar. Será enviado assim que houver rede.'
            : `${pending.length} abastecimentos por enviar. Serão enviados assim que houver rede.`}
        </div>
      ) : null}

      <div className="filters flex flex-col gap-2.5">
        <Input
          icon={<Search size={16} />}
          placeholder="Pesquisar por matrícula ou posto"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Pesquisar abastecimento"
        />
        <Select value={busId} onChange={(e) => setBusId(e.target.value)} aria-label="Filtrar por autocarro">
          <option value="">Todos os autocarros</option>
          {buses.map((bus) => (
            <option key={bus.bus_id} value={bus.bus_id}>
              {bus.license_plate}
            </option>
          ))}
        </Select>
      </div>

      {visible.length ? (
        <>
          <div className="mt-4 flex items-center justify-between rounded-2xl bg-muted px-4 py-3 text-sm">
            <span className="text-muted-foreground">
              {visible.length} {visible.length === 1 ? 'abastecimento' : 'abastecimentos'}
            </span>
            <span className="font-semibold">
              {formatKz(totals.cost)} · {formatLitres(totals.litres)}
            </span>
          </div>

          <ul className="mt-3 flex flex-col gap-2">
            {visible.map((log, i) => (
              <li key={log.id}>
                <Link
                  href={`/frota/${log.bus_id}`}
                  style={{ animationDelay: `${Math.min(i, 10) * 25}ms` }}
                  className="animate-rise-in press-scale block rounded-2xl border border-border bg-surface p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold">{log.bus?.license_plate}</p>
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        {formatDateTime(log.filled_at)}
                        {log.station ? ` · ${log.station}` : ''}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-sm font-bold">{formatKz(log.total_cost_kz)}</p>
                      <p className="text-xs text-muted-foreground">{formatLitres(log.litres)}</p>
                    </div>
                  </div>

                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-muted-foreground">
                    <span>{formatKzPrecise(log.price_per_litre_kz)}/L</span>
                    {log.odometer_km ? <span>{formatKm(log.odometer_km)}</span> : null}
                    {!log.is_full_tank ? <Badge tone="neutral">Parcial</Badge> : null}
                    {log.receipt_url ? (
                      <span className="flex items-center gap-1">
                        <Paperclip size={11} />
                        Recibo
                      </span>
                    ) : null}
                    {log.driver ? (
                      <span>
                        {[log.driver.first_name, log.driver.last_name].filter(Boolean).join(' ')}
                      </span>
                    ) : null}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <div className="mt-4">
          <EmptyState
            icon={Fuel}
            title="Nenhum abastecimento registado"
            description={
              search || busId
                ? 'Nenhum registo corresponde ao filtro.'
                : 'Registe o primeiro abastecimento para começar a acompanhar o consumo.'
            }
            action={
              <Button size="sm" onClick={() => setSheetOpen(true)}>
                <Plus size={15} />
                Registar abastecimento
              </Button>
            }
          />
        </div>
      )}

      <FuelLogSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        buses={buses}
        drivers={drivers}
        currentPrice={currentPrice}
        defaultBusId={busId}
        onSaved={(saved) => {
          if (saved) router.refresh();
          else pendingFuelEntries().then(setPending);
          if (!saved) toast('Guardado localmente.', 'info');
        }}
      />
    </div>
  );
}
