'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Bus, Plus, Search } from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import BusCard from '@/components/BusCard';
import Input from '@/components/ui/Input';
import Button from '@/components/ui/Button';
import EmptyState from '@/components/ui/EmptyState';
import { cn } from '@/lib/cn';
import { filterBuses, countByState, BUS_STATES, BUS_STATE_ORDER } from '@/lib/fleet';
import { useDebounce } from '@/lib/useDebounce';

export default function FrotaView({ initialBuses }) {
  const [search, setSearch] = useState('');
  const [state, setState] = useState('all');
  const debounced = useDebounce(search, 200);

  const counts = useMemo(() => countByState(initialBuses), [initialBuses]);
  const visible = useMemo(
    () => filterBuses(initialBuses, { search: debounced, state }),
    [initialBuses, debounced, state]
  );

  const chips = [
    { key: 'all', label: 'Todos', count: initialBuses.length },
    ...BUS_STATE_ORDER.map((key) => ({
      key,
      label: BUS_STATES[key].label,
      count: counts[key],
    })),
  ];

  return (
    <div>
      <PageHeader
        title="Frota"
        subtitle={`${initialBuses.length} autocarros`}
        action={
          <Link href="/frota/novo">
            <Button size="sm">
              <Plus size={15} />
              Adicionar
            </Button>
          </Link>
        }
      />

      <div className="filters">
        <Input
          icon={<Search size={16} />}
          placeholder="Pesquisar por matrícula ou modelo"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Pesquisar autocarro"
        />

        <div className="no-scrollbar -mx-4 mt-3 flex gap-2 overflow-x-auto px-4 pb-1">
          {chips.map((chip) => (
            <button
              key={chip.key}
              onClick={() => setState(chip.key)}
              className={cn(
                'press-scale shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold',
                state === chip.key
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border bg-surface text-muted-foreground'
              )}
            >
              {chip.label}
              <span className="ml-1.5 opacity-70">{chip.count}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-3">
        {visible.length ? (
          visible.map((bus, i) => (
            <BusCard
              key={bus.bus_id}
              bus={bus}
              style={{ animationDelay: `${Math.min(i, 10) * 25}ms` }}
            />
          ))
        ) : (
          <EmptyState
            icon={Bus}
            title="Nenhum autocarro encontrado"
            description={
              debounced
                ? 'Tente outra matrícula ou modelo.'
                : 'Não há autocarros neste estado.'
            }
          />
        )}
      </div>
    </div>
  );
}
