import { cva } from 'class-variance-authority';
import {
  AlertCircle,
  CheckCircle2,
  Info,
  TriangleAlert,
} from 'lucide-react';
import { cn } from '@/lib/utils.js';

// -----------------------------------------------------------------------------
// Card
// -----------------------------------------------------------------------------

export function Card({ className, ...props }) {
  return (
    <div
      className={cn(
        'ui-card rounded-[var(--radius-card)] border border-[var(--border-subtle)] bg-[var(--surface-card)]',
        className,
      )}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }) {
  return (
    <div
      className={cn(
        'ui-card-header flex flex-col gap-1 p-5 pb-3',
        className,
      )}
      {...props}
    />
  );
}

export function CardTitle({ className, ...props }) {
  return (
    <h2
      className={cn(
        'ui-card-title text-base font-semibold text-[var(--text-strong)]',
        className,
      )}
      {...props}
    />
  );
}

export function CardDescription({
  className,
  ...props
}) {
  return (
    <p
      className={cn(
        'ui-card-description text-sm text-[var(--text-muted)]',
        className,
      )}
      {...props}
    />
  );
}

export function CardContent({
  className,
  ...props
}) {
  return (
    <div
      className={cn(
        'ui-card-content p-5 pt-2',
        className,
      )}
      {...props}
    />
  );
}

export function CardFooter({
  className,
  ...props
}) {
  return (
    <div
      className={cn(
        'ui-card-footer flex items-center justify-end gap-3 border-t border-[var(--border-subtle)] px-5 py-4',
        className,
      )}
      {...props}
    />
  );
}

// -----------------------------------------------------------------------------
// Badge
// -----------------------------------------------------------------------------

export const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap',
  {
    variants: {
      tone: {
        neutral:
          'bg-[var(--surface-muted)] text-[var(--text-body)]',

        brand:
          'bg-brand-50 text-brand-700',

        premium:
          'bg-accent-50 text-accent-700',

        success:
          'bg-success-50 text-success-600',

        warning:
          'bg-warning-50 text-warning-600',

        danger:
          'bg-danger-50 text-danger-600',
      },
    },

    defaultVariants: {
      tone: 'neutral',
    },
  },
);

export function Badge({
  tone,
  className,
  ...props
}) {
  return (
    <span
      className={cn(
        'ui-badge',
        badgeVariants({ tone }),
        className,
      )}
      {...props}
    />
  );
}

// -----------------------------------------------------------------------------
// Alert
// -----------------------------------------------------------------------------

const alertIcons = {
  neutral: Info,
  error: AlertCircle,
  success: CheckCircle2,
  warning: TriangleAlert,
  info: Info,
};

const alertTones = {
  neutral:
    'border-[var(--border-subtle)] bg-[var(--surface-muted)] text-[var(--text-body)]',

  error:
    'border-danger-600/30 bg-danger-50 text-danger-700',

  success:
    'border-success-600/30 bg-success-50 text-success-600',

  warning:
    'border-warning-600/30 bg-warning-50 text-warning-600',

  info:
    'border-brand-200 bg-brand-50 text-brand-700',
};

/**
 * Inline message.
 *
 * Uses role="alert" for errors so screen readers announce
 * them immediately.
 *
 * Supported tones:
 * - neutral
 * - info
 * - success
 * - warning
 * - error
 */
export function Alert({
  tone = 'info',
  title,
  children,
  className,
}) {
  // Defensive fallback:
  // If a future component accidentally passes an unsupported tone,
  // we don't want React to try rendering an undefined component.
  const safeTone = alertIcons[tone]
    ? tone
    : 'info';

  const Icon =
    alertIcons[safeTone];

  return (
    <div
      role={
        safeTone === 'error'
          ? 'alert'
          : 'status'
      }
      className={cn(
        'ui-alert flex gap-3 rounded-[var(--radius-control)] border p-3 text-sm',
        alertTones[safeTone],
        className,
      )}
    >
      <Icon
        className="mt-0.5 h-4 w-4 shrink-0"
        aria-hidden="true"
      />

      <div className="space-y-0.5">
        {title && (
          <p className="font-medium">
            {title}
          </p>
        )}

        {children && (
          <div>
            {children}
          </div>
        )}
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Skeleton
// -----------------------------------------------------------------------------

export function Skeleton({
  className,
  ...props
}) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        'animate-pulse rounded-md bg-[var(--surface-muted)]',
        className,
      )}
      {...props}
    />
  );
}
