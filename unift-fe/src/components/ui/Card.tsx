/**
 * Card
 * Raised surface panel with optional hover state.
 * Three depth levels: raised (surface), flat (bg-panel), recessed (bg-panel darker).
 */

import type { ReactNode } from 'react';
import { cn } from '@/utils/helpers';

// ── Types ─────────────────────────────────────────────────────────────────────

export type CardDepth = 'raised' | 'flat' | 'recessed';

export interface CardProps {
  children: ReactNode;
  className?: string;
  depth?: CardDepth;
  hoverable?: boolean;
  /** Subtle left-border accent used on active/highlighted cards */
  accentLeft?: boolean;
}

// ── Depth map ─────────────────────────────────────────────────────────────────

const depthClasses: Record<CardDepth, string> = {
  raised:   'bg-surface border border-border-subtle',
  flat:     'bg-bg-panel border border-border-muted',
  recessed: 'depth-recessed',
};

// ── Component ─────────────────────────────────────────────────────────────────

export function Card({
  children,
  className,
  depth = 'raised',
  hoverable = false,
  accentLeft = false,
}: CardProps) {
  return (
    <div
      className={cn(
        depthClasses[depth],
        hoverable && 'hover:border-border-medium hover:bg-surface-hover transition-all duration-150 cursor-pointer',
        accentLeft && 'border-l-2 border-l-primary',
        className,
      )}
    >
      {children}
    </div>
  );
}
