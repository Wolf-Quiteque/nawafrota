'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Small GET-fetch hook: { data, loading, error, refetch }. Re-fetches when
 * `url` changes.
 *
 * Pass `initialData` when a Server Component already loaded this exact URL's
 * payload and rendered it into the page. The hook then starts with real data
 * and skips the first fetch, so the screen paints its content immediately
 * instead of showing a skeleton while the browser boots JS, hydrates and makes
 * a second round trip for data the server already had.
 */
export function useApi(url, { skip = false, initialData = null } = {}) {
  const [data, setData] = useState(initialData);
  const [loading, setLoading] = useState(!skip && initialData == null);
  const [error, setError] = useState(null);
  const requestId = useRef(0);
  // Which URL the server-rendered payload belongs to. Cleared after the first
  // effect run, so changing filters (or hitting refresh) still fetches.
  const seededUrl = useRef(initialData == null ? null : url);

  const refetch = useCallback(() => {
    if (!url || skip) return;
    const id = (requestId.current += 1);
    setLoading(true);
    setError(null);
    fetch(url)
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.error || 'Falha ao carregar dados');
        if (id === requestId.current) setData(body);
      })
      .catch((err) => {
        if (id === requestId.current) setError(err.message);
      })
      .finally(() => {
        if (id === requestId.current) setLoading(false);
      });
  }, [url, skip]);

  useEffect(() => {
    if (seededUrl.current === url) {
      seededUrl.current = null;
      return;
    }
    refetch();
  }, [url, refetch]);

  return { data, loading, error, refetch };
}
