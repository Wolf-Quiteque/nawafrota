'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { LogOut, Settings, Bus, RefreshCw } from 'lucide-react';
import Sheet from '@/components/ui/Sheet';
import Button from '@/components/ui/Button';
import NotificationBell from '@/components/NotificationBell';
import { initials } from '@/lib/format';

const ROLE_LABELS = {
  admin: 'Administrador',
  agent: 'Agente',
  driver: 'Motorista',
};

export default function TopBar({ profile }) {
  const [open, setOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [refreshing, startRefresh] = useTransition();
  const router = useRouter();

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      // Loaded on demand: supabase-js is ~35kB and signing out is the only
      // thing every authenticated screen would otherwise need it for.
      const { getSupabaseBrowserClient } = await import('@/lib/supabase-browser');
      await getSupabaseBrowserClient().auth.signOut();
    } finally {
      router.replace('/login');
      router.refresh();
    }
  };

  return (
    <header className="app-bar sticky top-0 z-30 border-b border-border bg-background/85 pt-safe-top backdrop-blur-lg">
      <div className="mx-auto flex h-14 max-w-md items-center justify-between px-4">
        <Link href="/" className="flex items-center gap-2">
          <span className="fleet-gradient flex h-8 w-8 items-center justify-center rounded-xl text-white shadow-sm">
            <Bus size={17} strokeWidth={2.4} />
          </span>
          <span className="text-[15px] font-bold tracking-tight">Nawa-frotas</span>
        </Link>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => startRefresh(() => router.refresh())}
            disabled={refreshing}
            className="press-scale flex h-9 w-9 items-center justify-center rounded-full bg-muted text-foreground disabled:opacity-60"
            aria-label={refreshing ? 'A atualizar dados' : 'Atualizar dados'}
          >
            <RefreshCw size={17} className={refreshing ? 'animate-spin' : ''} />
          </button>
          <NotificationBell />
          <button
            onClick={() => setOpen(true)}
            className="press-scale flex h-9 w-9 items-center justify-center rounded-full bg-muted text-sm font-semibold text-foreground"
            aria-label="Conta"
          >
            {initials(profile?.first_name, profile?.last_name)}
          </button>
        </div>
      </div>

      <Sheet open={open} onClose={() => setOpen(false)}>
        <div className="flex flex-col items-center gap-3 pb-6 pt-2 text-center">
          <span className="fleet-gradient flex h-16 w-16 items-center justify-center rounded-2xl text-2xl font-black text-white">
            {initials(profile?.first_name, profile?.last_name)}
          </span>
          <div>
            <p className="text-lg font-bold">
              {profile?.first_name} {profile?.last_name}
            </p>
            <p className="text-sm text-muted-foreground">
              {ROLE_LABELS[profile?.role] ?? profile?.role}
            </p>
          </div>
          <Button
            variant="secondary"
            className="mt-2 w-full"
            onClick={() => {
              setOpen(false);
              router.push('/configuracoes');
            }}
          >
            <Settings size={16} />
            Configurações
          </Button>
          <Button variant="ghost" className="w-full" onClick={handleLogout} loading={loggingOut}>
            <LogOut size={16} />
            Terminar sessão
          </Button>
        </div>
      </Sheet>
    </header>
  );
}
