/**
 * Badge
 * Inline status pill. Uses the CSS utility classes defined in index.css
 * so it renders identically to the reference HTML designs.
 */

import type { ReactNode } from 'react';
import { cn } from '@/utils/helpers';

// ── Types ─────────────────────────────────────────────────────────────────────

export type BadgeVariant = 'active' | 'done' | 'fail' | 'queue' | 'info' | 'default';

export interface BadgeProps {
  children: ReactNode;
  variant?: BadgeVariant;
  className?: string;
}

// ── Variant map ───────────────────────────────────────────────────────────────

const variantClass: Record<BadgeVariant, string> = {
  active:  'badge-active',
  done:    'badge-done',
  fail:    'badge-fail',
  queue:   'badge-queue',
  info:    'badge-info',
  default: 'badge-queue',
};

// ── Component ─────────────────────────────────────────────────────────────────

export function Badge({ children, variant = 'default', className }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center px-2 py-[2px]',
        'font-mono text-[10px] font-medium tracking-[0.06em] uppercase',
        variantClass[variant],
        className,
      )}
    >
      {children}
    </span>
  );
}
