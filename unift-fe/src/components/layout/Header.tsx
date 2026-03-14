/**
 * AppHeader
 * Sticky top bar with UniFT branding, optional breadcrumb path,
 * search input, and user avatar area.
 * Matches the design from main_file_browser_refined_industrial/code.html
 */

import type { ReactNode } from 'react';
import { cn } from '@/utils/helpers';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface BreadcrumbSegment {
  label: string;
  href?: string;
}

export interface HeaderProps {
  /** Breadcrumb path segments rendered after the logo */
  breadcrumb?: BreadcrumbSegment[];
  /** Slot for additional right-side content (e.g., search + user avatar) */
  rightContent?: ReactNode;
  className?: string;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function Header({ breadcrumb, rightContent, className }: HeaderProps) {
  return (
    <header
      className={cn(
        'h-14 border-b border-border-subtle bg-surface flex items-center px-4 justify-between shrink-0 z-30',
        className,
      )}
    >
      {/* ── Left: Logo + breadcrumb ── */}
      <div className="flex items-center gap-4 min-w-0">
        {/* Logo */}
        <div className="flex items-center gap-2 shrink-0">
          <div className="flex h-6 w-6 items-center justify-center bg-primary shrink-0">
            <span
              className="material-symbols-outlined text-bg-base font-bold"
              style={{ fontSize: 14, fontVariationSettings: "'FILL' 1" }}
            >
              terminal
            </span>
          </div>
          <span className="font-mono text-[13px] font-bold tracking-tight text-text-warm">
            UniFT
            <span className="text-primary">//</span>
            OS
          </span>
        </div>

        {/* Breadcrumb */}
        {breadcrumb && breadcrumb.length > 0 && (
          <nav
            aria-label="breadcrumb"
            className="hidden sm:flex items-center gap-1 depth-input bg-bg-base/50 px-3 py-1 text-[12px] min-w-0"
          >
            <span className="material-symbols-outlined text-slate-500 shrink-0" style={{ fontSize: 14 }}>
              storage
            </span>
            {breadcrumb.map((segment, idx) => (
              <span key={idx} className="flex items-center gap-1 min-w-0">
                {idx > 0 && <span className="text-slate-600 shrink-0">/</span>}
                {segment.href ? (
                  <a
                    href={segment.href}
                    className="text-slate-400 hover:text-text-warm transition-colors truncate"
                  >
                    {segment.label}
                  </a>
                ) : (
                  <span className="text-text-warm truncate">{segment.label}</span>
                )}
              </span>
            ))}
          </nav>
        )}
      </div>

      {/* ── Right slot ── */}
      {rightContent && (
        <div className="flex items-center gap-3 shrink-0 ml-4">
          {rightContent}
        </div>
      )}
    </header>
  );
}

// ── Convenience sub-components ────────────────────────────────────────────────

/** Reusable search bar for the header right slot */
export function HeaderSearch({
  value,
  onChange,
  placeholder = 'Search...',
  className,
}: {
  value?: string;
  onChange?: (v: string) => void;
  placeholder?: string;
  className?: string;
}) {
  return (
    <div className={cn('relative hidden sm:block', className)}>
      <span
        className="material-symbols-outlined absolute left-2 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none"
        style={{ fontSize: 16 }}
      >
        search
      </span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        placeholder={placeholder}
        className="depth-input bg-bg-base rounded pl-8 pr-3 py-1.5 text-[12px] w-56 text-slate-300 placeholder:text-slate-700 focus:outline-none focus:ring-1 focus:ring-primary transition-all"
      />
    </div>
  );
}

/** Simple user avatar chip */
export function HeaderAvatar({
  username,
  nodeLabel,
}: {
  username?: string;
  nodeLabel?: string;
}) {
  return (
    <div className="flex items-center gap-2">
      {nodeLabel && (
        <span className="label hidden lg:block">
          {nodeLabel} <span className="text-primary">●</span>
        </span>
      )}
      <div
        className="h-7 w-7 rounded-full bg-surface border border-border-subtle flex items-center justify-center overflow-hidden shrink-0"
        title={username}
      >
        <span className="material-symbols-outlined text-slate-400" style={{ fontSize: 16 }}>
          person
        </span>
      </div>
    </div>
  );
}
