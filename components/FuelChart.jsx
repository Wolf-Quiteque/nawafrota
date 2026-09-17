import { formatKz } from '@/lib/format';

const MONTHS_PT = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

function monthLabel(ymd) {
  const month = Number(String(ymd).slice(5, 7));
  return MONTHS_PT[month - 1] ?? '';
}

/**
 * Monthly fuel spend, drawn as inline SVG rather than <canvas> (§6.5): canvas
 * frequently prints blank, and SVG also stays sharp in the saved PDF.
 *
 * Deliberately server-renderable — no chart library, no hydration, and it is
 * already in the DOM when window.print() runs.
 */
export default function FuelChart({ data, height = 160 }) {
  const rows = (data || []).filter((d) => Number(d.total_cost_kz) > 0);

  if (!rows.length) {
    return (
      <p className="rounded-2xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
        Sem dados suficientes para o gráfico.
      </p>
    );
  }

  const max = Math.max(...rows.map((d) => Number(d.total_cost_kz)));
  const barWidth = 100 / rows.length;
  const gap = Math.min(barWidth * 0.25, 2.5);

  return (
    <figure className="avoid-break m-0">
      <svg
        viewBox={`0 0 100 ${height}`}
        preserveAspectRatio="none"
        className="w-full"
        style={{ height }}
        role="img"
        aria-label="Gasto mensal em combustível"
      >
        {/* Three gridlines, enough to read a value off the chart without
            turning it into a spreadsheet. */}
        {[0.25, 0.5, 0.75].map((f) => (
          <line
            key={f}
            x1="0"
            x2="100"
            y1={height - height * f}
            y2={height - height * f}
            stroke="currentColor"
            strokeWidth="0.4"
            className="text-border"
          />
        ))}
        {rows.map((d, i) => {
          const value = Number(d.total_cost_kz);
          // A floor of 2px keeps a real but tiny month visible rather than
          // rendering as nothing at all.
          const barHeight = Math.max((value / max) * (height - 18), 2);
          return (
            <rect
              key={d.month}
              x={i * barWidth + gap / 2}
              y={height - barHeight}
              width={barWidth - gap}
              height={barHeight}
              rx="1"
              fill="currentColor"
              className="text-primary"
            >
              <title>{`${monthLabel(d.month)} · ${formatKz(value)}`}</title>
            </rect>
          );
        })}
      </svg>
      <figcaption className="mt-1 flex justify-between text-[10px] text-muted-foreground">
        {rows.map((d) => (
          <span key={d.month} className="flex-1 text-center">
            {monthLabel(d.month)}
          </span>
        ))}
      </figcaption>
      <p className="mt-1 text-center text-xs text-muted-foreground">
        Máximo mensal: {formatKz(max)}
      </p>
    </figure>
  );
}
