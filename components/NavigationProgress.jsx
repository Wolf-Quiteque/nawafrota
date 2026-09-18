'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { cn } from '@/lib/cn';

/**
 * App Router keeps the previous screen visible while a new server route is in
 * flight. On a slow mobile connection that looks like a dead tap. This small
 * global indicator starts on same-origin navigation and clears when the route
 * actually changes (with a safety timeout for failed/aborted navigations).
 */
export default function NavigationProgress() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, setPending] = useState(false);
  const timeoutRef = useRef(null);

  useEffect(() => {
    setPending(false);
    clearTimeout(timeoutRef.current);
  }, [pathname, searchParams]);

  useEffect(() => {
    const start = (event) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
        return;
      }
      const anchor = event.target.closest?.('a[href]');
      if (!anchor || anchor.target === '_blank' || anchor.hasAttribute('download')) return;

      const target = new URL(anchor.href, window.location.href);
      if (target.origin !== window.location.origin) return;
      if (`${target.pathname}${target.search}` === `${window.location.pathname}${window.location.search}`) return;

      setPending(true);
      clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => setPending(false), 12_000);
    };

    document.addEventListener('click', start, true);
    return () => {
      document.removeEventListener('click', start, true);
      clearTimeout(timeoutRef.current);
    };
  }, []);

  return (
    <div
      aria-hidden="true"
      className={cn(
        'pointer-events-none fixed inset-x-0 top-0 z-[110] h-1 overflow-hidden transition-opacity',
        pending ? 'opacity-100' : 'opacity-0'
      )}
    >
      <span className="navigation-progress block h-full w-2/5 rounded-r-full bg-primary" />
    </div>
  );
}
