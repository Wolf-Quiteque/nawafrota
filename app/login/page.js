'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Lock, Phone, AlertCircle, Eye, EyeOff, Bus } from 'lucide-react';
import { getSupabaseBrowserClient } from '@/lib/supabase-browser';
import Input from '@/components/ui/Input';
import Button from '@/components/ui/Button';

function LoginForm() {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const router = useRouter();
  const searchParams = useSearchParams();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    // Drivers and agents sign in with a phone number; the account behind it is
    // phone@nawabus.com. Typing a full email works too.
    const email = identifier.includes('@') ? identifier.trim() : `${identifier.trim()}@nawabus.com`;
    const supabase = getSupabaseBrowserClient();

    try {
      const { data, error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      if (signInError) throw signInError;

      const res = await fetch('/api/auth/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session: data.session }),
      });
      const body = await res.json();
      if (!res.ok) {
        await supabase.auth.signOut();
        throw new Error(body.error || 'Falha ao iniciar sessão.');
      }

      const next = searchParams.get('next') || '/';
      router.replace(next);
      router.refresh();
    } catch (err) {
      setError(err.message || 'Credenciais inválidas.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <div
        className="fleet-gradient relative flex flex-col items-center justify-end px-6 pb-12 pt-safe-top"
        style={{ minHeight: '38vh' }}
      >
        <div className="animate-rise-in flex flex-col items-center gap-3 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/20 text-white backdrop-blur">
            <Bus size={32} strokeWidth={2.2} />
          </div>
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight text-white">Nawa-frotas</h1>
            <p className="text-sm font-medium text-white/85">Gestão da frota NAWABUS</p>
          </div>
        </div>
      </div>

      <form
        onSubmit={handleSubmit}
        style={{ animationDelay: '100ms' }}
        className="animate-rise-in -mt-6 flex flex-1 flex-col gap-4 rounded-t-3xl bg-background px-6 pt-7"
      >
        <div>
          <h2 className="text-lg font-bold">Entrar</h2>
          <p className="text-sm text-muted-foreground">Use o seu telefone ou email de acesso.</p>
        </div>

        {error ? (
          <div className="flex items-center gap-2 rounded-2xl border border-danger/30 bg-danger/10 px-3.5 py-2.5 text-sm text-danger">
            <AlertCircle size={16} className="shrink-0" />
            {error}
          </div>
        ) : null}

        <div className="flex flex-col gap-3">
          <Input
            icon={<Phone size={17} />}
            placeholder="Telefone ou email"
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            autoComplete="username"
            inputMode="email"
            required
          />
          <div className="relative">
            <Input
              icon={<Lock size={17} />}
              placeholder="Palavra-passe"
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              className="pr-11"
              required
            />
            <button
              type="button"
              onClick={() => setShowPassword((s) => !s)}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground"
              aria-label={showPassword ? 'Ocultar palavra-passe' : 'Mostrar palavra-passe'}
              tabIndex={-1}
            >
              {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
            </button>
          </div>
        </div>

        <Button type="submit" size="lg" className="mt-2 w-full" loading={loading}>
          Entrar
        </Button>

        <p className="mt-auto pb-8 pt-6 text-center text-xs text-muted-foreground">
          A sessão mantém-se por 7 dias neste aparelho.
        </p>
      </form>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
