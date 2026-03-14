/**
 * Input
 * Recessed industrial-style text input with label, icon slot,
 * error and hint messages.
 */

import type { InputHTMLAttributes, ReactNode } from 'react';
import { cn } from '@/utils/helpers';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
  /** Material Symbols icon name, e.g. "person" */
  iconName?: string;
  /** Full ReactNode icon (overrides iconName) */
  icon?: ReactNode;
  isRequired?: boolean;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function Input({
  label,
  error,
  hint,
  iconName,
  icon,
  isRequired = false,
  id,
  className,
  ...props
}: InputProps) {
  const inputId = id ?? label?.toLowerCase().replace(/\s+/g, '-');
  const hasIcon = icon || iconName;

  return (
    <div className="space-y-1.5 w-full">
      {/* Label */}
      {label && (
        <label
          htmlFor={inputId}
          className="block label text-slate-400 px-0.5"
        >
          {label}
          {isRequired && <span className="text-primary ml-1">*</span>}
        </label>
      )}

      {/* Input wrapper */}
      <div className="relative">
        {/* Icon */}
        {(icon || iconName) && (
          <span
            className={cn(
              'absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none flex items-center',
              icon ? '' : 'material-symbols-outlined',
            )}
            style={iconName ? { fontSize: 16 } : undefined}
          >
            {icon ?? iconName}
          </span>
        )}

        <input
          id={inputId}
          className={cn(
            'w-full bg-bg-base rounded px-4 py-3 text-[13px] text-text-warm',
            'placeholder:text-slate-600 focus:outline-none focus:ring-1 transition-all duration-150',
            'depth-input',
            hasIcon ? 'pl-10' : '',
            error
              ? 'border-status-err/50 focus:ring-status-err/50'
              : 'focus:ring-primary focus:border-primary',
            className,
          )}
          {...props}
        />
      </div>

      {/* Error / hint */}
      {error && (
        <p className="text-status-err text-[11px] px-0.5">{error}</p>
      )}
      {hint && !error && (
        <p className="text-slate-500 text-[11px] px-0.5">{hint}</p>
      )}
    </div>
  );
}
