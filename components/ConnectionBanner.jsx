'use client';

import { useEffect, useState } from 'react';
import { WifiOff } from 'lucide-react';

export default function ConnectionBanner() {
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    const update = () => setOffline(!navigator.onLine);
    update();
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);

  if (!offline) return null;

  return (
    <div className="sticky top-[calc(3.5rem+env(safe-area-inset-top)+0.75rem)] z-20 border-b border-warning/40 bg-warning px-4 py-2 text-center text-xs font-semibold text-warning-foreground">
      <span className="inline-flex items-center gap-1.5">
        <WifiOff size={14} />
        Sem ligação. Os abastecimentos podem ser guardados para enviar depois.
      </span>
    </div>
  );
}
