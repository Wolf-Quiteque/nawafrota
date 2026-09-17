import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { SESSION_COOKIE } from '@/lib/session';
import { invalidateProfile } from '@/lib/auth';

export async function POST() {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            try { cookieStore.set(name, value, options); } catch {}
          });
        },
      },
    }
  );

  // Drop this user's cached profile so a sign-out is not papered over by the
  // in-process cache in lib/auth.js.
  const { data: claims } = await supabase.auth.getClaims();
  invalidateProfile(claims?.claims?.sub);

  await supabase.auth.signOut();
  cookieStore.delete(SESSION_COOKIE);

  return NextResponse.json({ success: true });
}
