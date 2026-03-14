/**
 * Layout primitives
 * Provides the outer shell (full-screen dark bg), scrollable main area,
 * and an optional padded content panel.
 */

import type { ReactNode } from 'react';
import { cn } from '@/utils/helpers';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface LayoutProps {
  children: ReactNode;
  className?: string;
}

export interface MainContentProps {
  children: ReactNode;
  className?: string;
}

export interface ContentPanelProps {
  children: ReactNode;
  className?: string;
  /** Extra top padding when rendered below a sticky header inside MainContent */
  padded?: boolean;
}

// ── Components ────────────────────────────────────────────────────────────────

/** Full-screen application shell */
export function Layout({ children, className }: LayoutProps) {
  return (
    <div
      className={cn(
        'h-screen w-full flex flex-col bg-bg-base text-text-warm overflow-hidden',
        className,
      )}
    >
      {children}
    </div>
  );
}

/** Flex-1 scrollable main area that sits below the header */
export function MainContent({ children, className }: MainContentProps) {
  return (
    <main
      className={cn(
        'flex-1 overflow-auto bg-bg-base custom-scrollbar',
        className,
      )}
    >
      {children}
    </main>
  );
}

/** Inner padded wrapper for page content */
export function ContentPanel({ children, className, padded = true }: ContentPanelProps) {
  return (
    <div className={cn(padded && 'p-6', className)}>
      {children}
    </div>
  );
}
