'use client';

import { useEffect } from 'react';
import { AlertTriangle, RotateCw } from 'lucide-react';
import Button from '@/components/ui/Button';

export default function AppError({ error, reset }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="mt-10 rounded-3xl border border-danger/30 bg-surface p-6 text-center card-shadow">
      <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-danger/10 text-danger">
        <AlertTriangle size={24} />
      </span>
      <h1 className="mt-4 text-lg font-bold">Não foi possível carregar esta página</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Verifique a ligação e tente novamente. Nenhuma alteração foi perdida.
      </p>
      <Button className="mt-5 w-full" onClick={reset}>
        <RotateCw size={16} />
        Tentar novamente
      </Button>
    </div>
  );
}
