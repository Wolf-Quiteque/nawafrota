'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutGrid, Bus, Fuel, Wrench, BarChart3 } from 'lucide-react';
import { cn } from '@/lib/cn';

const ITEMS = [
  { href: '/', label: 'Início', icon: LayoutGrid },
  { href: '/frota', label: 'Frota', icon: Bus },
  { href: '/combustivel', label: 'Combustível', icon: Fuel },
  { href: '/manutencao', label: 'Manutenção', icon: Wrench },
  { href: '/relatorios', label: 'Relatórios', icon: BarChart3 },
];

export default function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="bottom-nav fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface/90 pb-safe-bottom backdrop-blur-lg">
      <div className="mx-auto flex max-w-md items-stretch justify-between px-1.5 pt-1.5">
        {ITEMS.map((item) => {
          const active = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
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
