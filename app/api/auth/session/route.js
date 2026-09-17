import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase-admin';
import { SESSION_COOKIE, SESSION_MAX_AGE_SECONDS, FLEET_ROLES } from '@/lib/session';

// Called right after a successful client-side sign-in. Syncs the Supabase
// auth cookies onto the server response, checks the profile has a staff
// role, and stamps the 7-day session marker the middleware enforces.
export async function POST(request) {
  try {
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

    const { session } = await request.json();
    if (!session) {
      return NextResponse.json({ error: 'Sessão em falta.' }, { status: 400 });
    }

    const { error: setError } = await supabase.auth.setSession(session);
    if (setError) {
      return NextResponse.json({ error: setError.message }, { status: 401 });
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Não foi possível confirmar a sessão.' }, { status: 401 });
    }

    const admin = createSupabaseAdminClient();
    const { data: profile } = await admin
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .maybeSingle();

    if (!profile || !FLEET_ROLES.includes(profile.role)) {
      await supabase.auth.signOut();
      return NextResponse.json({ error: 'Esta conta não tem acesso ao Nawa-frotas.' }, { status: 403 });
    }

    cookieStore.set(SESSION_COOKIE, new Date().toISOString(), {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: SESSION_MAX_AGE_SECONDS,
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: err?.message || 'Falha ao iniciar sessão.' }, { status: 500 });
  }
}
