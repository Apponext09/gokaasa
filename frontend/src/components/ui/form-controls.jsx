import { forwardRef } from 'react';
import { cn } from '@/lib/utils.js';

const controlBase =
  'w-full rounded-[var(--radius-control)] border bg-[var(--surface-card)] px-3 text-sm text-[var(--text-strong)] placeholder:text-[var(--text-muted)] transition-colors focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 disabled:cursor-not-allowed disabled:bg-[var(--surface-muted)] disabled:opacity-70';

export const Input = forwardRef(function Input({ className, invalid = false, ...props }, ref) {
  return (
    <input
      ref={ref}
      aria-invalid={invalid || undefined}
      className={cn(
        controlBase,
        'h-10',
        invalid ? 'border-danger-600 focus:border-danger-600 focus:ring-danger-600/20' : 'border-[var(--border-subtle)]',
        className,
      )}
      {...props}
    />
  );
});

export const Select = forwardRef(function Select({ className, invalid = false, children, ...props }, ref) {
  return (
    <select
      ref={ref}
      aria-invalid={invalid || undefined}
      className={cn(
        controlBase,
        'h-10 pr-8',
        invalid ? 'border-danger-600' : 'border-[var(--border-subtle)]',
        className,
      )}
      {...props}
    >
      {children}
    </select>
  );
});

export function Label({ className, ...props }) {
  return <label className={cn('text-sm font-medium text-[var(--text-strong)]', className)} {...props} />;
}

export function Checkbox({ className, label, ...props }) {
  return (
    <label className={cn('inline-flex cursor-pointer items-center gap-2 text-sm text-[var(--text-body)]', className)}>
      <input
        type="checkbox"
        className="h-4 w-4 cursor-pointer rounded border-[var(--border-subtle)] text-brand-600 focus:ring-brand-500"
        {...props}
      />
      {label}
    </label>
  );
}

export const Textarea = forwardRef(function Textarea({ className, invalid = false, ...props }, ref) {
  return (
    <textarea
      ref={ref}
      aria-invalid={invalid || undefined}
      rows={4}
      className={cn(
        controlBase,
        'resize-y py-2',
        invalid ? 'border-danger-600' : 'border-[var(--border-subtle)]',
        className,
      )}
      {...props}
    />
  );
});
