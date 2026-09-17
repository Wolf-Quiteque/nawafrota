'use client';

import { forwardRef } from 'react';
import { cn } from '@/lib/cn';

const VARIANTS = {
  primary: 'bg-primary text-primary-foreground shadow-sm shadow-primary/20 active:brightness-95',
  secondary: 'bg-surface-2 text-foreground border border-border',
  ghost: 'bg-transparent text-foreground',
  danger: 'bg-danger text-danger-foreground shadow-sm shadow-danger/20',
  success: 'bg-success text-success-foreground shadow-sm shadow-success/20',
  outline: 'bg-transparent border border-border text-foreground',
};

const SIZES = {
  sm: 'h-9 px-3 text-sm rounded-xl gap-1.5',
  md: 'h-11 px-4 text-sm rounded-2xl gap-2',
  lg: 'h-[3.25rem] px-5 text-base rounded-2xl gap-2',
  icon: 'h-10 w-10 rounded-xl',
};

const Button = forwardRef(function Button(
  { className, variant = 'primary', size = 'md', loading = false, disabled, children, ...props },
  ref
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        'inline-flex items-center justify-center font-medium press-scale transition-colors disabled:opacity-50 disabled:pointer-events-none whitespace-nowrap',
        VARIANTS[variant],
        SIZES[size],
        className
      )}
      {...props}
    >
      {loading ? (
        <span className="h-4 w-4 rounded-full border-2 border-current border-t-transparent animate-spin" />
      ) : null}
      {children}
    </button>
  );
});

export default Button;
