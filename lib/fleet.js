// Bus state, labels and the capacity guard. Pure — no imports — so the state
// precedence can be unit-tested against the same rules the SQL view applies.

/**
 * Mirrors the CASE in public.fleet_bus_status (§4.6). Keep the two in step:
 * this exists so the UI can classify a bus it has only just written (a fresh
 * maintenance issue, a deactivation) without re-querying the view.
 *
 * Precedence is deliberate and not alphabetical:
 *   inactive > open maintenance > on a trip > idle
 * A bus that is out of service is out of service whatever else is true of it,
 * and an open fault outranks "currently driving" because the fault is the thing
 * somebody has to act on.
 */
export function busState({ is_active, open_issues, trip_id } = {}) {
  if (is_active === false) return 'out_of_service';
  if (Number(open_issues || 0) > 0) return 'needs_maintenance';
  if (trip_id) return 'on_trip';
  return 'idle';
}

export const BUS_STATES = {
  on_trip: { label: 'Em viagem', tone: 'info' },
  idle: { label: 'Disponível', tone: 'success' },
  needs_maintenance: { label: 'Manutenção', tone: 'warning' },
  out_of_service: { label: 'Fora de serviço', tone: 'neutral' },
};

export const BUS_STATE_ORDER = ['on_trip', 'idle', 'needs_maintenance', 'out_of_service'];

export function busStateLabel(state) {
  return BUS_STATES[state]?.label ?? 'Desconhecido';
}

export function busStateTone(state) {
  return BUS_STATES[state]?.tone ?? 'neutral';
}

/**
 * §2.1 — capacity may never drop below a seat already sold on a future trip.
 * `maxSoldSeat` is the answer to the query in the spec; null means nothing is
 * sold and any capacity is fine.
 *
 * Returns the refusal in Portuguese, naming the seat that blocks it, because
 * "não é possível" with no reason is the version staff cannot act on.
 */
export function checkCapacityChange(newCapacity, maxSoldSeat) {
  const capacity = Number(newCapacity);
  if (!Number.isFinite(capacity) || capacity < 1) {
    return { allowed: false, error: 'A lotação tem de ser pelo menos 1.' };
  }

  const sold = maxSoldSeat === null || maxSoldSeat === undefined ? null : Number(maxSoldSeat);
  if (sold === null || Number.isNaN(sold)) return { allowed: true, error: null };

  if (capacity < sold) {
    return {
      allowed: false,
      error: `Não é possível reduzir a lotação para ${capacity}: o lugar ${sold} já está vendido numa viagem futura.`,
    };
  }
  return { allowed: true, error: null };
}

/** Free-text + state filtering for the fleet list (§6.2). */
export function filterBuses(buses, { search = '', state = 'all' } = {}) {
  const needle = search.trim().toLowerCase();
  return (buses || []).filter((bus) => {
    if (state !== 'all' && bus.state !== state) return false;
    if (!needle) return true;
    return [bus.license_plate, bus.make, bus.model]
      .filter(Boolean)
      .some((field) => String(field).toLowerCase().includes(needle));
  });
}

/** Counts per state, for the dashboard tiles — always all four keys. */
export function countByState(buses) {
  const counts = { on_trip: 0, idle: 0, needs_maintenance: 0, out_of_service: 0 };
  for (const bus of buses || []) {
    if (counts[bus.state] !== undefined) counts[bus.state] += 1;
  }
  return counts;
}

export function busLabel(bus) {
  if (!bus) return '—';
  const model = [bus.make, bus.model].filter(Boolean).join(' ');
  return model ? `${bus.license_plate} · ${model}` : bus.license_plate;
}
