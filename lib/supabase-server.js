import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

// Server-side client that reads the caller's identity from cookies. Used to
// find out *who* is asking (their profile / role), never for privileged
// writes — those go through supabase-admin.js instead.
export async function createSupabaseServerClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            try {
              cookieStore.set(name, value, options);
            } catch {
              // Called from a Server Component render — cookies are read-only there.
            }
          });
        },
      },
    }
  );
}
