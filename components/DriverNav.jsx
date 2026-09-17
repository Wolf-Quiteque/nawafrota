'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Fuel, Wrench } from 'lucide-react';
import { cn } from '@/lib/cn';

// §6.7 — a driver logs a refuelling and reports an avaria. Nothing else is
// theirs to see, so nothing else is in the bar.
const ITEMS = [
  { href: '/combustivel', label: 'Abastecer', icon: Fuel },
  { href: '/manutencao', label: 'Avarias', icon: Wrench },
];

export default function DriverNav() {
  const pathname = usePathname();

  return (
    <nav className="bottom-nav fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface/90 pb-safe-bottom backdrop-blur-lg">
      <div className="mx-auto flex max-w-md items-stretch justify-around px-1.5 pt-1.5">
        {ITEMS.map((item) => {
          const active = pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className="press-scale flex flex-1 flex-col items-center gap-1 rounded-xl px-1 py-1.5"
            >
              <span
                className={cn(
                  'flex h-9 w-9 items-center justify-center rounded-xl transition-colors',
                  active ? 'bg-primary/14 text-primary' : 'text-muted-foreground'
                )}
              >
                <Icon size={20} strokeWidth={active ? 2.4 : 2} />
              </span>
              <span
                className={cn(
                  'text-[10.5px] font-medium leading-none',
                  active ? 'text-primary' : 'text-muted-foreground'
                )}
              >
                {item.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
