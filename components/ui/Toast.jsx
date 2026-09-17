'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { CheckCircle2, AlertCircle, Info } from 'lucide-react';
import { cn } from '@/lib/cn';

const ToastContext = createContext(null);

const ICONS = { success: CheckCircle2, error: AlertCircle, info: Info };
const TONES = {
  success: 'border-success/30 text-success',
  error: 'border-danger/30 text-danger',
  info: 'border-border text-foreground',
};

const VISIBLE_MS = 3000;
const EXIT_MS = 200;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const timers = useRef(new Set());

  useEffect(() => {
    const pending = timers.current;
    return () => {
      pending.forEach(clearTimeout);
      pending.clear();
    };
  }, []);

  const push = useCallback((message, tone = 'info') => {
    const id = Math.random().toString(36).slice(2);
    setToasts((t) => [...t, { id, message, tone, leaving: false }]);

    // Two-stage removal so the toast can animate out with CSS — this is the
    // bit framer-motion's AnimatePresence used to handle.
    const fade = setTimeout(() => {
      setToasts((t) => t.map((x) => (x.id === id ? { ...x, leaving: true } : x)));
      timers.current.delete(fade);
    }, VISIBLE_MS);
    const drop = setTimeout(() => {
      setToasts((t) => t.filter((x) => x.id !== id));
      timers.current.delete(drop);
    }, VISIBLE_MS + EXIT_MS);

    timers.current.add(fade);
    timers.current.add(drop);
  }, []);

  return (
    <ToastContext.Provider value={push}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-0 top-0 z-[100] flex flex-col items-center gap-2 px-4 pt-safe-top"
        role="status"
        aria-live="polite"
      >
        {toasts.map((t) => {
          const Icon = ICONS[t.tone] || Info;
          return (
            <div
              key={t.id}
              className={cn(
                'animate-drop-in pointer-events-auto mt-2 flex max-w-sm items-center gap-2 rounded-2xl border bg-surface px-4 py-3 text-sm font-medium shadow-lg card-shadow',
                'transition-all duration-200 motion-reduce:transition-none',
                t.leaving && '-translate-y-3 scale-95 opacity-0',
                TONES[t.tone] || TONES.info
              )}
            >
              <Icon size={18} className="shrink-0" />
              <span className="text-foreground">{t.message}</span>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}
