'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/components/ui/Toast';
import { flushFuelQueue } from '@/lib/offline-queue';

/**
 * Drains the offline refuelling queue (§8.2) on load and whenever the browser
 * comes back online. Background Sync covers the app-closed case on Chromium;
 * this covers everything else, including iOS, where Background Sync does not
 * exist at all.
 */
export default function OfflineQueueFlusher() {
  const toast = useToast();
  const router = useRouter();

  useEffect(() => {
    let running = false;

    const flush = async () => {
      if (running) return;
      running = true;
      try {
        const { sent, dropped } = await flushFuelQueue();
        if (sent > 0) {
          toast(
            sent === 1
              ? 'Abastecimento pendente enviado.'
              : `${sent} abastecimentos pendentes enviados.`,
            'success'
          );
          router.refresh();
        }
        if (dropped > 0) {
          toast(
            'Um abastecimento pendente foi recusado pelo servidor e removido.',
            'error'
          );
        }
      } finally {
        running = false;
      }
    };

    // Background Sync wakes the service worker, which cannot reach IndexedDB
    // through the page's own module — so it posts a message and the flush
    // happens here, where the queue logic already lives.
    const onMessage = (event) => {
      if (event.data?.type === 'flush-fuel-queue') flush();
    };

    flush();
    window.addEventListener('online', flush);
    navigator.serviceWorker?.addEventListener('message', onMessage);
    return () => {
      window.removeEventListener('online', flush);
      navigator.serviceWorker?.removeEventListener('message', onMessage);
    };
  }, [toast, router]);

  return null;
}
