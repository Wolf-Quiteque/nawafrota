import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Bus, CircleCheck, Wrench, Ban, Fuel, Droplets, MapPin, Plus } from 'lucide-react';
import { requireFleetUser, companyScope } from '@/lib/auth';
import { createSupabaseAdminClient } from '@/lib/supabase-admin';
import { listBusStatus } from '@/lib/queries';
import { countByState } from '@/lib/fleet';
import { currentMonthRange, previousMonthRange, percentChange } from '@/lib/periods';
import { formatKz, formatLitres, formatDateTime, formatTime } from '@/lib/format';
import { severityLabel, severityTone, sortIssues } from '@/lib/maintenance';
import { isDriverRole } from '@/lib/session';
import PageHeader from '@/components/PageHeader';
import StatTile from '@/components/StatTile';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import EmptyState from '@/components/ui/EmptyState';

export const metadata = { title: 'Início' };
export const dynamic = 'force-dynamic';

async function monthSpend(supabase, range, companyId) {
  const { data, error } = await supabase.rpc('fleet_fuel_summary', {
    p_from: range.from,
    p_to: range.to,
    p_company_id: companyId,
  });
  if (error) throw error;
  return (data || []).reduce(
    (acc, r) => ({
      cost: acc.cost + Number(r.total_cost_kz || 0),
      litres: acc.litres + Number(r.total_litres || 0),
    }),
    { cost: 0, litres: 0 }
  );
}

export default async function DashboardPage() {
  const auth = await requireFleetUser();
  if (auth.error) redirect('/login');
  // A driver has no fleet-wide dashboard to see (§6.7).
  if (isDriverRole(auth.profile.role)) redirect('/combustivel');

  const companyId = companyScope(auth.profile);
  const supabase = createSupabaseAdminClient();

  let issuesQuery = supabase
    .from('bus_maintenance')
    .select('id, title, severity, status, reported_at, bus_id, bus:buses!inner(license_plate, company_id)')
    .in('status', ['open', 'in_progress'])
    .limit(50);
  let fillsQuery = supabase
    .from('bus_fuel_logs')
    .select('id, bus_id, filled_at, litres, total_cost_kz, bus:buses!inner(license_plate, company_id)')
    .order('filled_at', { ascending: false })
    .limit(20);
  if (companyId) {
    issuesQuery = issuesQuery.eq('bus.company_id', companyId);
    fillsQuery = fillsQuery.eq('bus.company_id', companyId);
  }

  const [buses, thisMonth, lastMonth, issuesResult, fillsResult] = await Promise.all([
    listBusStatus(companyId),
    monthSpend(supabase, currentMonthRange(), companyId),
    monthSpend(supabase, previousMonthRange(), companyId),
    issuesQuery,
    fillsQuery,
  ]);

  if (issuesResult.error) throw issuesResult.error;
  if (fillsResult.error) throw fillsResult.error;

  const counts = countByState(buses);
  const onTrip = buses.filter((b) => b.state === 'on_trip');
  const issues = sortIssues(issuesResult.data || []).slice(0, 5);
  const fills = (fillsResult.data || []).slice(0, 5);
  const change = percentChange(thisMonth.cost, lastMonth.cost);

  return (
    <div>
      <PageHeader
        title="Frota"
        subtitle={`${buses.length} autocarros · ${counts.idle + counts.on_trip} em serviço`}
      />

      <div className="grid grid-cols-2 gap-2.5">
        <StatTile icon={MapPin} tone="info" label="Em viagem" value={counts.on_trip} />
        <StatTile icon={CircleCheck} tone="success" label="Disponíveis" value={counts.idle} />
        <StatTile icon={Wrench} tone="warning" label="Manutenção" value={counts.needs_maintenance} />
        <StatTile icon={Ban} label="Fora de serviço" value={counts.out_of_service} />
      </div>

      <div className="mt-2.5 grid grid-cols-2 gap-2.5">
        <StatTile
          icon={Fuel}
          tone="primary"
          label="Combustível este mês"
          value={formatKz(thisMonth.cost)}
          hint={
            change === null
              ? 'Sem mês anterior para comparar'
              : `${change >= 0 ? '+' : ''}${change}% face ao mês passado`
          }
        />
        <StatTile
          icon={Droplets}
          tone="primary"
          label="Litros este mês"
          value={formatLitres(thisMonth.litres)}
        />
      </div>

      <section className="mt-6">
        <h2 className="mb-2 text-sm font-bold">Em viagem agora</h2>
        {onTrip.length ? (
          <ul className="flex flex-col gap-2">
            {onTrip.map((bus) => (
              <li key={bus.bus_id}>
                <Link
                  href={`/frota/${bus.bus_id}`}
                  className="press-scale flex items-center justify-between gap-3 rounded-2xl border border-border bg-surface p-3.5"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold">{bus.license_plate}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {bus.origin_city} → {bus.destination_city}
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    <Badge tone="info">Em viagem</Badge>
                    {bus.arrival_time ? (
                      <span className="mt-1 block text-[11px] text-muted-foreground">
                        Chega {formatTime(bus.arrival_time)}
                      </span>
                    ) : null}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState icon={Bus} title="Sem viagens a decorrer" description="Nenhum autocarro está na estrada neste momento." />
        )}
      </section>

      <section className="mt-6">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-bold">Manutenção em aberto</h2>
          <Link href="/manutencao" className="text-xs font-semibold text-primary">
            Ver tudo
          </Link>
        </div>
        {issues.length ? (
          <ul className="flex flex-col gap-2">
            {issues.map((issue) => (
              <li key={issue.id}>
                <Link
                  href={`/frota/${issue.bus_id}`}
                  className="press-scale flex items-center justify-between gap-3 rounded-2xl border border-border bg-surface p-3.5"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold">{issue.title}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {issue.bus?.license_plate} · {formatDateTime(issue.reported_at)}
                    </span>
                  </span>
                  <Badge tone={severityTone(issue.severity)}>{severityLabel(issue.severity)}</Badge>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState icon={Wrench} title="Nenhuma avaria em aberto" description="Toda a frota está sem avarias registadas." />
        )}
      </section>

      <section className="mt-6">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-bold">Últimos abastecimentos</h2>
          <Link href="/combustivel" className="text-xs font-semibold text-primary">
            Ver tudo
          </Link>
        </div>
        {fills.length ? (
          <ul className="flex flex-col gap-2">
            {fills.map((fill) => (
              <li
                key={fill.id}
                className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-surface p-3.5"
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold">
                    {fill.bus?.license_plate}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {formatDateTime(fill.filled_at)}
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="block text-sm font-semibold">{formatKz(fill.total_cost_kz)}</span>
                  <span className="block text-xs text-muted-foreground">
                    {formatLitres(fill.litres)}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            icon={Fuel}
            title="Nenhum abastecimento registado"
            description="Registe o primeiro abastecimento para começar a acompanhar o consumo."
            action={
              <Link href="/combustivel">
                <Button size="sm">
                  <Plus size={15} />
                  Registar abastecimento
                </Button>
              </Link>
            }
          />
        )}
      </section>
    </div>
  );
}
