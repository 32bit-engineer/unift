/**
 * Sidebar
 * Dense folder-tree style navigation with active indicator,
 * optional badges, and a footer slot (e.g., storage usage bar).
 */

import type { ReactNode } from 'react';
import { cn } from '@/utils/helpers';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SidebarItem {
  id: string;
  label: string;
  /** Material Symbols icon name */
  icon: string;
  href?: string;
  active?: boolean;
  /** Small string badge rendered on the right */
  badge?: string;
}

export interface SidebarProps {
  /** Section header label, e.g. "Navigation" */
  heading?: string;
  items: SidebarItem[];
  onItemClick?: (item: SidebarItem) => void;
  /** Content rendered at the bottom (e.g., storage bar) */
  footer?: ReactNode;
  className?: string;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function Sidebar({ heading = 'Navigation', items, onItemClick, footer, className }: SidebarProps) {
  return (
    <aside
      className={cn(
        'w-60 bg-surface border-r border-border-subtle flex flex-col overflow-y-auto custom-scrollbar shrink-0',
        className,
      )}
    >
      {/* Heading */}
      <div className="px-3 pt-3 pb-1">
        <p className="label text-slate-500">{heading}</p>
      </div>

      {/* Nav items */}
      <nav className="flex flex-col flex-1">
        {items.map((item) => (
          <button
            key={item.id}
            onClick={() => onItemClick?.(item)}
            className={cn(
              'group flex items-center gap-2 px-3 py-2 text-[13px] transition-all text-left w-full',
              item.active
                ? 'border-l-[3px] border-primary bg-white/5 text-text-warm pl-[9px]'
                : 'border-l-[3px] border-transparent text-slate-400 hover:text-text-warm hover:bg-white/[0.03] hover:border-l-primary/30',
            )}
          >
            <span
              className={cn(
                'material-symbols-outlined shrink-0 transition-colors',
                item.active ? 'text-text-warm' : 'text-slate-500 group-hover:text-slate-300',
              )}
              style={{ fontSize: 18 }}
            >
              {item.icon}
            </span>
            <span className="truncate">{item.label}</span>
            {item.badge && (
              <span className="ml-auto bg-primary text-bg-base text-[10px] font-bold px-1.5 py-0.5 rounded-full shrink-0">
                {item.badge}
              </span>
            )}
          </button>
        ))}
      </nav>

      {/* Footer */}
      {footer && (
        <div className="mt-auto border-t border-border-subtle">
          {footer}
        </div>
      )}
    </aside>
  );
}

// ── Storage bar (commonly used in sidebar footer) ─────────────────────────────

export function StorageBar({ usedPercent }: { usedPercent: number }) {
  const color =
    usedPercent >= 90 ? 'bg-status-err' :
    usedPercent >= 75 ? 'bg-primary' :
    'bg-status-ok';

  return (
    <div className="p-4">
      <div className="flex justify-between items-center mb-1.5">
        <span className="label text-slate-500">Storage</span>
        <span className="label text-primary">{usedPercent}%</span>
      </div>
      <div className="h-1.5 bg-bg-base rounded-full overflow-hidden depth-input">
        <div
          className={cn('h-full rounded-full transition-all duration-300', color)}
          style={{ width: `${usedPercent}%` }}
        />
      </div>
    </div>
  );
}
