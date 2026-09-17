// Report period maths, in Africa/Luanda wall-clock time (§2.4).
//
// Angola is UTC+1 year-round with no DST, so a Luanda day boundary is a fixed
// offset from UTC. That constant is what makes this pure and testable — no
// timezone database, and no chance of a report silently covering 23 or 25
// hours on a DST edge that does not exist here.

export const LUANDA_OFFSET_HOURS = 1;
const MS_PER_HOUR = 3600_000;

/** The instant at which a Luanda calendar day starts, as a Date. */
export function luandaDayStart(ymd) {
  return new Date(`${ymd}T00:00:00+01:00`);
}

/** Luanda calendar date (YYYY-MM-DD) for an instant. */
export function luandaDate(instant) {
  const d = instant instanceof Date ? instant : new Date(instant);
  return new Date(d.getTime() + LUANDA_OFFSET_HOURS * MS_PER_HOUR).toISOString().slice(0, 10);
}

function addMonths(ymd, months) {
  const [y, m, d] = ymd.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1 + months, d));
  return date.toISOString().slice(0, 10);
}

function firstOfMonth(ymd) {
  return `${ymd.slice(0, 7)}-01`;
}

function addDays(ymd, days) {
  const date = new Date(`${ymd}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export const PERIODS = {
  this_month: 'Este mês',
  last_month: 'Mês passado',
  last_90: 'Últimos 90 dias',
  this_year: 'Este ano',
  custom: 'Personalizado',
};

/**
 * Resolves a period key into the half-open range [from, to) the SQL functions
 * expect. Half-open is what keeps a fill at exactly midnight from being counted
 * in both the month that ends and the month that starts.
 */
export function resolvePeriod(key, { now = new Date(), from, to } = {}) {
  const today = luandaDate(now);

  switch (key) {
    case 'last_month': {
      const start = firstOfMonth(addMonths(firstOfMonth(today), -1));
      const end = firstOfMonth(today);
      return range(start, end, 'Mês passado');
    }
    case 'last_90': {
      const start = addDays(today, -89);
      const end = addDays(today, 1);
      return range(start, end, 'Últimos 90 dias');
    }
    case 'this_year': {
      const start = `${today.slice(0, 4)}-01-01`;
      const end = addDays(today, 1);
      return range(start, end, `Ano de ${today.slice(0, 4)}`);
    }
    case 'custom': {
      const start = from || firstOfMonth(today);
      // `to` is the last day the user picked, inclusive on screen — so the
      // half-open range has to reach the day after it.
      const end = addDays(to || today, 1);
      return range(start, end, 'Período personalizado');
    }
    case 'this_month':
    default: {
      const start = firstOfMonth(today);
      const end = addDays(today, 1);
      return range(start, end, 'Este mês');
    }
  }
}

function range(startYmd, endYmd, label) {
  return {
    fromYmd: startYmd,
    toYmd: endYmd,
    from: luandaDayStart(startYmd).toISOString(),
    to: luandaDayStart(endYmd).toISOString(),
    label,
  };
}

/** The same month a year-on-year comparison needs: the period immediately before. */
export function previousMonthRange(now = new Date()) {
  return resolvePeriod('last_month', { now });
}

export function currentMonthRange(now = new Date()) {
  const today = luandaDate(now);
  const start = firstOfMonth(today);
  const end = firstOfMonth(addMonths(start, 1));
  return range(start, end, 'Este mês');
}

/** Percentage change, or null when there is no base to compare against. */
export function percentChange(current, previous) {
  const a = Number(current) || 0;
  const b = Number(previous) || 0;
  if (b === 0) return null;
  return Math.round(((a - b) / b) * 100);
}
