const LUANDA_TZ = 'Africa/Luanda';
const LOCALE = 'pt-PT';

/** 42.000 Kz — '.' groups thousands, ',' is the decimal mark (§2.4). */
export function formatKz(value) {
  const n = Number(value) || 0;
  return `${n.toLocaleString(LOCALE, { maximumFractionDigits: 0 })} Kz`;
}

/** 420,50 Kz — for a price per litre, where the cents genuinely matter. */
export function formatKzPrecise(value) {
  const n = Number(value) || 0;
  return `${n.toLocaleString(LOCALE, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Kz`;
}

/** 150,5 L */
export function formatLitres(value) {
  const n = Number(value) || 0;
  return `${n.toLocaleString(LOCALE, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} L`;
}

/** 12,00 L/100 km — null when there is not enough data to say (§4.7). */
export function formatConsumption(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '—';
  return `${Number(value).toLocaleString(LOCALE, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} L/100 km`;
}

export function formatKm(value) {
  if (value === null || value === undefined || value === '') return '—';
  return `${Number(value).toLocaleString(LOCALE, { maximumFractionDigits: 0 })} km`;
}

export function formatNumber(value, digits = 0) {
  const n = Number(value) || 0;
  return n.toLocaleString(LOCALE, { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function formatTime(dateString) {
  if (!dateString) return '—';
  return new Date(dateString).toLocaleTimeString(LOCALE, {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: LUANDA_TZ,
  });
}

export function formatDate(dateString) {
  if (!dateString) return '—';
  return new Date(dateString).toLocaleDateString(LOCALE, {
    day: '2-digit',
    month: 'short',
    timeZone: LUANDA_TZ,
  });
}

export function formatLongDate(dateString) {
  if (!dateString) return '—';
  return new Date(dateString).toLocaleDateString(LOCALE, {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    timeZone: LUANDA_TZ,
  });
}

export function formatDateTime(dateString) {
  if (!dateString) return '—';
  return `${formatDate(dateString)} · ${formatTime(dateString)}`;
}

/** 17 set 2026, 09:41 — the generated-at stamp on a printed report (§6.5). */
export function formatStamp(date = new Date()) {
  return new Intl.DateTimeFormat(LOCALE, {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: LUANDA_TZ,
  }).format(date instanceof Date ? date : new Date(date));
}

/** Today's date as YYYY-MM-DD in Africa/Luanda, matching the DB's trip dates. */
export function todayInLuanda() {
  return dateInLuanda(new Date());
}

export function dateInLuanda(date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: LUANDA_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date instanceof Date ? date : new Date(date));
  const map = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  return `${map.year}-${map.month}-${map.day}`;
}

/** The value an <input type="datetime-local"> needs, in Luanda wall-clock time. */
export function toLocalInputValue(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: LUANDA_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(d);
  const m = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  // Intl renders midnight as hour '24' in some ICU versions; normalise it.
  const hour = m.hour === '24' ? '00' : m.hour;
  return `${m.year}-${m.month}-${m.day}T${hour}:${m.minute}`;
}

/**
 * Turns "2026-09-17T08:30" typed in a Luanda-local field into a real instant.
 * Angola is UTC+1 all year with no DST, so the offset is a constant — no
 * timezone library needed, and no chance of a DST-shifted fill.
 */
export const LUANDA_UTC_OFFSET = '+01:00';

export function fromLocalInputValue(value) {
  if (!value) return null;
  return new Date(`${value}:00${LUANDA_UTC_OFFSET}`).toISOString();
}

export function initials(firstName, lastName) {
  const a = (firstName || '').trim()[0] || '';
  const b = (lastName || '').trim()[0] || '';
  return (a + b).toUpperCase() || '?';
}

export function fullName(profile) {
  if (!profile) return '—';
  const name = `${profile.first_name || ''} ${profile.last_name || ''}`.trim();
  return name || '—';
}
