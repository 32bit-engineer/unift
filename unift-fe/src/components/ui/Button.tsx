/**
 * Button
 * Industrial-style action button.
 * Primary = orange fill, secondary = ghost panel, ghost = text-only, danger = red tint.
 */

import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from '@/utils/helpers';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
  icon?: ReactNode;
  children: ReactNode;
}

// ── Variant / size maps ───────────────────────────────────────────────────────

const variantClasses: Record<NonNullable<ButtonProps['variant']>, string> = {
  primary:
    'bg-primary hover:bg-primary/90 text-bg-base font-bold shadow-sm',
  secondary:
    'bg-white/5 hover:bg-white/10 text-text-warm border border-border-subtle',
  ghost:
    'hover:bg-white/5 text-slate-400 hover:text-text-warm',
  danger:
    'bg-status-err/10 hover:bg-status-err/20 text-status-err border border-status-err/30',
};

const sizeClasses: Record<NonNullable<ButtonProps['size']>, string> = {
  sm: 'h-7  px-3 text-[11px] gap-1.5',
  md: 'h-9  px-5 text-[11px] gap-2',
  lg: 'h-11 px-7 text-[12px] gap-2',
};

// ── Component ─────────────────────────────────────────────────────────────────

export function Button({
  variant = 'primary',
  size = 'md',
  isLoading = false,
  disabled,
  icon,
  children,
  className,
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center font-mono uppercase tracking-widest',
        'transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed',
        variantClasses[variant],
        sizeClasses[size],
        className,
      )}
      disabled={isLoading || disabled}
      {...props}
    >
      {isLoading ? (
        <>
          <span className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin shrink-0" />
          <span>Processing…</span>
        </>
      ) : (
        <>
          {icon && (
            <span className="flex items-center justify-center shrink-0 material-symbols-outlined" style={{ fontSize: 16 }}>
              {icon}
            </span>
          )}
          {children}
        </>
      )}
    </button>
  );
}
