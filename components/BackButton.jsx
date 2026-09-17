'use client';

import { useRouter } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';

export default function BackButton({ fallbackHref }) {
  const router = useRouter();
  return (
    <button
      onClick={() => (fallbackHref ? router.push(fallbackHref) : router.back())}
      className="press-scale mb-2 -ml-2 flex h-9 w-9 items-center justify-center rounded-xl text-muted-foreground"
      aria-label="Voltar"
    >
      <ChevronLeft size={22} />
    </button>
  );
}
