import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * Shadcn-style Input component styled for the Obsidian Flux dark theme.
 *
 * Default: bg-[#0F0F1A] border border-[#1E1E2E] h-8 rounded-md px-3 text-[12px]
 * Focus:   border-[#2A2A3F] + subtle violet shadow — no white ring
 *
 * For bare usage inside icon-wrapper divs, override with:
 *   className="bg-transparent border-0 shadow-none h-auto py-0 focus:shadow-none focus:border-0 rounded-none"
 */
const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<'input'>>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          // Layout
          'flex h-8 w-full min-w-0 rounded-md',
          // Colours
          'border border-[#1E1E2E] bg-[#0F0F1A]',
          'text-[12px] font-sans text-[#EEEEF8]',
          'placeholder:text-[#52526A]',
          // Remove all browser / @tailwindcss/forms focus rings
          'outline-none ring-0',
          'focus:outline-none focus:ring-0 focus-visible:ring-0 focus-visible:outline-none',
          // Subtle focus border + glow
          'focus:border-[#2A2A3F] focus:shadow-[0_0_0_1px_rgba(124,109,250,0.18)]',
          // Transition
          'transition-[border-color,box-shadow] duration-150',
          // Disabled
          'disabled:cursor-not-allowed disabled:opacity-50',
          // Padding
          'px-3 py-1.5',
          // File inputs
          'file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-[#EEEEF8]',
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);

Input.displayName = 'Input';

export { Input };
