'use client';

import { createBrowserClient } from '@supabase/ssr';

let client;

// Single shared browser client so realtime/auth listeners aren't duplicated
// across components.
export function getSupabaseBrowserClient() {
  if (!client) {
    client = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    );
  }
  return client;
}
