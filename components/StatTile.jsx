import { cn } from '@/lib/cn';

const TONES = {
  neutral: 'bg-muted text-muted-foreground',
  primary: 'bg-primary/12 text-primary',
  success: 'bg-success/14 text-success',
  warning: 'bg-warning/25 text-warning-foreground',
  danger: 'bg-danger/12 text-danger',
  info: 'bg-info/14 text-info',
};

export default function StatTile({ icon: Icon, label, value, hint, tone = 'neutral', className }) {
  return (
    <div className={cn('avoid-break rounded-2xl border border-border bg-surface p-3.5', className)}>
      <div className="flex items-center gap-2">
        {Icon ? (
          <span
            className={cn(
              'flex h-8 w-8 items-center justify-center rounded-xl',
              TONES[tone] ?? TONES.neutral
            )}
          >
            <Icon size={16} />
          </span>
        ) : null}
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
      </div>
      <p className="mt-2 text-[22px] font-extrabold leading-none tracking-tight">{value}</p>
      {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
