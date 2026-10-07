import { forwardRef } from 'react';
import { cva } from 'class-variance-authority';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils.js';

/** Primary: main actions (Search, Import, Publish). Secondary: Edit, Cancel, Save Draft. Danger: Delete, Unpublish. Premium: rare gold CTA for a single standout action (e.g. a featured deal) — don't use for routine actions. */
export const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[var(--radius-control)] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 disabled:pointer-events-none disabled:opacity-50 cursor-pointer',
  {
    variants: {
      variant: {
        primary: 'bg-brand-600 text-white shadow-sm hover:bg-brand-700',
        secondary: 'border border-[var(--border-subtle)] bg-[var(--surface-card)] text-[var(--text-strong)] hover:bg-[var(--surface-muted)]',
        premium: 'bg-accent-500 text-brand-900 shadow-sm hover:bg-accent-600',
        danger: 'bg-danger-600 text-white hover:bg-danger-700',
        'danger-outline': 'border border-danger-600 text-danger-600 hover:bg-danger-50',
        ghost: 'text-[var(--text-body)] hover:bg-[var(--surface-muted)]',
        link: 'text-brand-600 underline-offset-4 hover:underline px-0',
      },
      size: {
        sm: 'h-8 px-3 text-sm',
        md: 'h-10 px-4 text-sm',
        lg: 'h-12 px-6 text-base',
        icon: 'h-9 w-9',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
);

export const Button = forwardRef(function Button(
  { className, variant, size, loading = false, disabled, children, type = 'button', ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
      {children}
    </button>
  );
});
