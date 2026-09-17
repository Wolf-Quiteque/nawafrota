import { cn } from '@/lib/cn';

const HINT_TONES = {
  error: 'text-danger',
  warning: 'text-warning-foreground',
  hint: 'text-muted-foreground',
  ok: 'text-muted-foreground',
};

export default function Field({ label, hint, hintTone = 'hint', error, children, className }) {
  const message = error || hint;
  const tone = error ? 'error' : hintTone;

  return (
    <label className={cn('flex flex-col gap-1.5', className)}>
      {label ? (
        <span className="text-xs font-semibold text-muted-foreground">{label}</span>
      ) : null}
      {children}
      {message ? (
        <span className={cn('text-xs', HINT_TONES[tone] ?? HINT_TONES.hint)}>{message}</span>
      ) : null}
    </label>
  );
}

export function Textarea({ className, ...props }) {
  return (
    <textarea
      className={cn(
        'min-h-[80px] w-full rounded-2xl border border-border bg-surface px-4 py-3 text-[15px] text-foreground placeholder:text-muted-foreground outline-none transition-shadow focus:ring-2 focus:ring-ring/40',
        className
      )}
      {...props}
    />
  );
}

export function Toggle({ checked, onChange, label, description }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between gap-3 rounded-2xl border border-border bg-surface px-4 py-3 text-left"
    >
      <span>
        <span className="block text-sm font-medium text-foreground">{label}</span>
        {description ? (
          <span className="mt-0.5 block text-xs text-muted-foreground">{description}</span>
        ) : null}
      </span>
      <span
        className={cn(
          'relative h-6 w-11 shrink-0 rounded-full transition-colors',
          checked ? 'bg-primary' : 'bg-muted'
        )}
      >
        <span
          className={cn(
            'absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-[left]',
            checked ? 'left-[22px]' : 'left-0.5'
          )}
        />
      </span>
    </button>
  );
}
