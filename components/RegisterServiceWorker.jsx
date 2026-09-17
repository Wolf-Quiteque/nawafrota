'use client';

import { useEffect } from 'react';

export default function RegisterServiceWorker() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    // Registering during hydration makes the browser fetch and boot the worker
    // while it is still busy rendering the first screen. Waiting for `load`
    // keeps it off the critical path — the worker only matters from the *next*
    // launch onwards anyway.
    const register = () => {
      navigator.serviceWorker
        .register('/sw.js')
        .then((registration) => {
          // A new build is live: swap it in on the next navigation rather than
          // leaving staff on stale JS for the rest of their shift.
          registration.addEventListener('updatefound', () => {
            const installing = registration.installing;
            if (!installing) return;
            installing.addEventListener('statechange', () => {
              if (installing.state === 'installed' && navigator.serviceWorker.controller) {
                registration.update().catch(() => {});
              }
            });
          });
        })
        .catch(() => {});
    };

    if (document.readyState === 'complete') {
      register();
      return;
    }
    window.addEventListener('load', register, { once: true });
    return () => window.removeEventListener('load', register);
  }, []);

  return null;
}
