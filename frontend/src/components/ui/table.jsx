import { cn } from '@/lib/utils.js';
import { Skeleton } from '@/components/ui/surfaces.jsx';

/** Horizontal-scroll wrapper + the <table> element. Pair with TableHeader/TableBody/TableRow/TableHead/TableCell. */
export function Table({ className, minWidth = '820px', children, ...props }) {
  return (
    <div className="overflow-x-auto">
      <table className={cn('w-full text-left text-sm', className)} style={{ minWidth }} {...props}>
        {children}
      </table>
    </div>
  );
}

export function TableHeader({ className, ...props }) {
  return (
    <thead
      className={cn(
        'border-b border-[var(--border-subtle)] bg-[var(--surface-muted)]/60 text-xs uppercase tracking-wide text-[var(--text-muted)]',
        className,
      )}
      {...props}
    />
  );
}

export function TableBody({ className, ...props }) {
  return <tbody className={cn('divide-y divide-[var(--border-subtle)]', className)} {...props} />;
}

export function TableRow({ className, interactive = true, ...props }) {
  return <tr className={cn(interactive && 'hover:bg-[var(--surface-hover)]', className)} {...props} />;
}

export function TableHead({ className, ...props }) {
  return <th scope="col" className={cn('px-4 py-3 font-semibold', className)} {...props} />;
}

export function TableCell({ className, ...props }) {
  return <td className={cn('px-4 py-3', className)} {...props} />;
}

/** Loading placeholder matching a table's shape: `rows` skeleton bars, sized to `columns` (visual only — no real <td>s needed since nothing reads this data). */
export function TableSkeleton({ rows = 4, className }) {
  return (
    <div className={cn('space-y-3 p-5', className)}>
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-14 w-full" />
      ))}
    </div>
  );
}
