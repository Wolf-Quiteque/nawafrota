'use client';

import { forwardRef } from 'react';
import { cn } from '@/lib/cn';

const Input = forwardRef(function Input({ className, icon, ...props }, ref) {
  return (
    <div className="relative flex items-center">
      {icon ? (
        <span className="pointer-events-none absolute left-3.5 text-muted-foreground">{icon}</span>
      ) : null}
      <input
        ref={ref}
        className={cn(
          'h-12 w-full rounded-2xl border border-border bg-surface px-4 text-[15px] text-foreground placeholder:text-muted-foreground outline-none transition-shadow focus:ring-2 focus:ring-ring/40',
          icon && 'pl-11',
          className
        )}
        {...props}
      />
    </div>
  );
});

export default Input;
