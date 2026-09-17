'use client';

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import Button from '@/components/ui/Button';
import { cn } from '@/lib/cn';

const EXIT_MS = 200;

/**
 * A blocking yes/no for something that cannot be undone.
 *
 * Built on the same mount-then-transition pattern as Sheet (§6.1) rather than
 * `window.confirm`, which on a phone renders as a browser chrome alert in the
 * device language — English on most handsets here — in the middle of an
 * otherwise Portuguese app.
 *
 * Cancel is the default: it takes focus on open, so Enter dismisses rather
 * than destroys, and Escape does the same.
 */
export default function ConfirmDialog({
  open,
  onCancel,
  onConfirm,
  title,
  description,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  busy = false,
}) {
  const [mounted, setMounted] = useState(open);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    if (open) {
      setMounted(true);
      const raf = requestAnimationFrame(() => requestAnimationFrame(() => setShown(true)));
      return () => cancelAnimationFrame(raf);
    }
    setShown(false);
    const timer = setTimeout(() => setMounted(false), EXIT_MS);
    return () => clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      // Never let Escape dismiss mid-delete: the request is already in flight
      // and the result still has to be reported.
      if (e.key === 'Escape' && !busy) onCancel?.();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onCancel, busy]);

  if (!mounted) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-5">
      <div
        className={cn(
          'absolute inset-0 bg-black/50 transition-opacity duration-200 motion-reduce:transition-none',
          shown ? 'opacity-100' : 'opacity-0'
        )}
        onClick={busy ? undefined : onCancel}
      />
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        className={cn(
          'relative z-10 w-full max-w-sm rounded-2xl border border-border bg-surface p-5',
          'transition-all duration-200 ease-out motion-reduce:transition-none',
          shown ? 'scale-100 opacity-100' : 'scale-95 opacity-0'
        )}
      >
        <h2 id="confirm-title" className="text-base font-semibold">
          {title}
        </h2>
        {description ? (
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{description}</p>
        ) : null}

        <div className="mt-5 flex gap-2">
          <Button variant="secondary" className="flex-1" onClick={onCancel} disabled={busy} autoFocus>
            {cancelLabel}
          </Button>
          <Button variant="danger" className="flex-1" onClick={onConfirm} disabled={busy}>
            {busy ? <Loader2 size={15} className="animate-spin" /> : null}
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
