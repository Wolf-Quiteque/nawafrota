// CSV for Excel in a pt-PT locale (§6.5).
//
// Two non-negotiables, both learned the hard way with Portuguese spreadsheets:
//   ';' as the delimiter — Excel in a pt locale reads ',' as the decimal mark,
//     so a comma-delimited file lands every row in a single column.
//   a UTF-8 BOM — without it Excel guesses Latin-1 and "Combustível" arrives
//     as "Combustï¿½vel".

export const CSV_DELIMITER = ';';
export const UTF8_BOM = '\uFEFF';

function escapeCell(value) {
  if (value === null || value === undefined) return '';
  const text = String(value);
  if (text.includes('"') || text.includes(CSV_DELIMITER) || /[\r\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

/** Decimal numbers in a pt-PT sheet use ',' — plain numbers stay plain. */
export function csvNumber(value, digits = 2) {
  if (value === null || value === undefined || value === '') return '';
  const n = Number(value);
  if (!Number.isFinite(n)) return '';
  return n.toFixed(digits).replace('.', ',');
}

export function toCsv(headers, rows) {
  const lines = [headers.map(escapeCell).join(CSV_DELIMITER)];
  for (const row of rows) lines.push(row.map(escapeCell).join(CSV_DELIMITER));
  // CRLF: Excel is the target reader, and it is the one that cares.
  return UTF8_BOM + lines.join('\r\n') + '\r\n';
}

/** A filename staff can tell apart in a downloads folder six months later. */
export function csvFilename(prefix, fromYmd, toYmd) {
  return `${prefix}_${fromYmd}_${toYmd}.csv`;
}
