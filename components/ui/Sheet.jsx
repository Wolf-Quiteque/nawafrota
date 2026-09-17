'use client';

import { X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { cn } from '@/lib/cn';

const EXIT_MS = 260;

export default function Sheet({ open, onClose, title, children, maxHeight = '85vh' }) {
  // `mounted` keeps the sheet in the DOM long enough to play its slide-out;
  // `shown` drives the CSS transition. This is what framer-motion's
  // AnimatePresence did for us, minus the dependency.
  const [mounted, setMounted] = useState(open);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    if (open) {
      setMounted(true);
      // Two frames: the first paints the off-screen state, the second flips it
      // so the browser has something to transition *from*.
      const raf = requestAnimationFrame(() => requestAnimationFrame(() => setShown(true)));
      return () => cancelAnimationFrame(raf);
    }
    setShown(false);
    const timer = setTimeout(() => setMounted(false), EXIT_MS);
    return () => clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const original = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = original;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!mounted) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <div
        className={cn(
          'absolute inset-0 bg-black/45 transition-opacity duration-200 motion-reduce:transition-none',
          shown ? 'opacity-100' : 'opacity-0'
        )}
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        style={{ maxHeight }}
        className={cn(
          'relative z-10 flex w-full max-w-md flex-col rounded-t-3xl border-t border-border bg-surface pb-safe-bottom',
          'transition-transform duration-[260ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none',
          shown ? 'translate-y-0' : 'translate-y-full'
        )}
      >
        <div className="mx-auto mt-2.5 h-1.5 w-10 rounded-full bg-border" />
        {title ? (
          <div className="flex items-center justify-between px-5 pt-3">
            <h2 className="text-base font-semibold">{title}</h2>
            <button
              onClick={onClose}
              className="press-scale flex h-8 w-8 items-center justify-center rounded-full bg-muted text-muted-foreground"
              aria-label="Fechar"
            >
              <X size={16} />
            </button>
          </div>
        ) : null}
        <div className={cn('overflow-y-auto px-5', title ? 'pt-3' : 'pt-5')}>{children}</div>
      </div>
    </div>
  );
}
