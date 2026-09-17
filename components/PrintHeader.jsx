import { formatStamp, fullName } from '@/lib/format';

/**
 * What a printed page needs and the screen does not (§6.5). Rendered with
 * className="print-only" so it is invisible on screen and appears on paper.
 */
export default function PrintHeader({ company, title, periodLabel, filterLabel, generatedBy }) {
  return (
    <div className="print-only mb-4 border-b border-black pb-3">
      <div className="flex items-start justify-between gap-4">
        <div>
          {company?.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element -- print-only;
            // next/image renders a lazy, sized wrapper that prints unreliably.
            <img src={company.logo_url} alt="" style={{ height: '36px', marginBottom: '6px' }} />
          ) : null}
          <p style={{ fontSize: '13pt', fontWeight: 800, margin: 0 }}>
            {company?.name || 'NAWABUS'}
          </p>
          <h2 style={{ fontSize: '12pt', fontWeight: 700, margin: '2px 0 0' }}>{title}</h2>
        </div>
        <div style={{ textAlign: 'right', fontSize: '9pt' }}>
          <p style={{ margin: 0 }}>{periodLabel}</p>
          {filterLabel ? <p style={{ margin: '2px 0 0' }}>{filterLabel}</p> : null}
          {/* Africa/Luanda, never a raw UTC timestamp (§2.4). */}
          <p style={{ margin: '2px 0 0' }}>Gerado em {formatStamp()}</p>
          {generatedBy ? (
            <p style={{ margin: '2px 0 0' }}>Por {fullName(generatedBy)}</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
