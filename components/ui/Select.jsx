'use client';

import { forwardRef } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/cn';

const Select = forwardRef(function Select({ className, children, ...props }, ref) {
  return (
    <div className="relative flex items-center">
      <select
        ref={ref}
        className={cn(
          'h-12 w-full appearance-none rounded-2xl border border-border bg-surface px-4 pr-10 text-[15px] text-foreground outline-none transition-shadow focus:ring-2 focus:ring-ring/40',
          className
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        size={16}
        className="pointer-events-none absolute right-3.5 text-muted-foreground"
      />
    </div>
  );
});

export default Select;
