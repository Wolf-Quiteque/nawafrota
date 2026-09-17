import Link from 'next/link';
import { Users, Fuel, Wrench, MapPin, Clock } from 'lucide-react';
import BusStateBadge from '@/components/BusStateBadge';
import { formatDateTime, formatKz, formatTime } from '@/lib/format';
import { severityLabel } from '@/lib/maintenance';

export default function BusCard({ bus, style }) {
  return (
    <Link
      href={`/frota/${bus.bus_id}`}
      style={style}
      className="animate-rise-in press-scale card-shadow block rounded-2xl border border-border bg-surface p-4"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-base font-bold tracking-tight">{bus.license_plate}</p>
          <p className="truncate text-sm text-muted-foreground">
            {[bus.make, bus.model].filter(Boolean).join(' ') || 'Sem modelo'}
            {bus.year ? ` · ${bus.year}` : ''}
          </p>
        </div>
        <BusStateBadge state={bus.state} />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <Users size={13} />
          {bus.capacity} lugares
        </span>
        {bus.last_filled_at ? (
          <span className="flex items-center gap-1.5">
            <Fuel size={13} />
            {formatKz(bus.last_cost_kz)} · {formatDateTime(bus.last_filled_at)}
          </span>
        ) : (
          <span className="flex items-center gap-1.5">
            <Fuel size={13} />
            Sem abastecimentos
          </span>
        )}
      </div>

      {bus.state === 'on_trip' && bus.origin_city ? (
        <p className="mt-2 flex items-center gap-1.5 text-xs font-medium text-info">
          <MapPin size={13} />
          {bus.origin_city} → {bus.destination_city}
          {bus.arrival_time ? ` · chega ${formatTime(bus.arrival_time)}` : ''}
        </p>
      ) : null}

      {bus.open_issues > 0 ? (
        <p className="mt-2 flex items-center gap-1.5 text-xs font-medium text-warning-foreground">
          <Wrench size={13} />
          {bus.open_issues} {bus.open_issues === 1 ? 'avaria aberta' : 'avarias abertas'}
          {bus.worst_severity ? ` · ${severityLabel(bus.worst_severity)}` : ''}
        </p>
      ) : null}

      {bus.state === 'idle' && bus.next_departure ? (
        <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
          <Clock size={13} />
          Próxima viagem {formatDateTime(bus.next_departure)}
        </p>
      ) : null}
    </Link>
  );
}
