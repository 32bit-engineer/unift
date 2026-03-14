/**
 * Loading Spinner Component
 */

import { cn } from '@/utils/helpers';

export interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const sizes = {
  sm: 'w-4 h-4',
  md: 'w-8 h-8',
  lg: 'w-12 h-12',
};

export function LoadingSpinner({ size = 'md', className }: LoadingSpinnerProps) {
  return (
    <div className={cn('inline-flex items-center justify-center', className)}>
      <div
        className={cn(
          'border-2 border-[#E07B39]/20 border-t-[#E07B39] rounded-full animate-spin',
          sizes[size]
        )}
      />
    </div>
  );
}
