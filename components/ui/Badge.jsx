import { cn } from '@/lib/cn';

// Every tone pairs with its own -foreground token. `text-warning` on a pale
// background fails contrast — a real bug already hit in nawasoft-pwa (§8.1).
const TONES = {
  neutral: 'bg-muted text-muted-foreground',
  primary: 'bg-primary/12 text-primary',
  success: 'bg-success/14 text-success',
  danger: 'bg-danger/12 text-danger',
  warning: 'bg-warning/25 text-warning-foreground',
  info: 'bg-info/14 text-info',
};

export default function Badge({ tone = 'neutral', className, children, ...props }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold leading-none',
        TONES[tone] ?? TONES.neutral,
        className
      )}
      {...props}
    >
      {children}
    </span>
  );
}
