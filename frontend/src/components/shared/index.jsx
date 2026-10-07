import { Link, Navigate, Outlet, useLocation } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Inbox, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/surfaces.jsx';
import { Button } from '@/components/ui/button.jsx';
import { Label } from '@/components/ui/form-controls.jsx';
import { cn } from '@/lib/utils.js';
import { ADMIN_ROLES, useAuth } from '@/features/auth/AuthContext.jsx';

export function Logo({ className, to = '/' }) {
  return (
    <Link to={to} className={cn('inline-flex items-center gap-2 font-semibold text-[var(--text-strong)]', className)}>
      <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand-600 text-sm font-bold text-white" aria-hidden="true">
        G
      </span>
      <span className="text-[17px] tracking-tight">Gokaasa</span>
    </Link>
  );
}

export function FullPageSpinner({ label = 'Loading' }) {
  return (
    <div className="grid min-h-[60vh] place-items-center text-[var(--text-muted)]" role="status">
      <div className="flex items-center gap-2 text-sm">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        {label}
      </div>
    </div>
  );
}

/** Guards a route. Anonymous users go to login and return here afterwards. */
export function RequireAuth({ children, staff = false }) {
  const { status, isStaff } = useAuth();
  const location = useLocation();

  if (status === 'loading') return <FullPageSpinner label="Checking your session" />;
  if (status !== 'authenticated') {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  if (staff && !isStaff) return <Navigate to="/" replace />;
  return children ?? <Outlet />;
}

export function homePathFor(user) {
  return user?.roles?.some((role) => ADMIN_ROLES.includes(role)) ? '/admin/dashboard' : '/';
}

export function PageHeader({ title, description, actions, className }) {
  return (
    <div className={cn('flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between', className)}>
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--text-strong)]">{title}</h1>
        {description && <p className="max-w-2xl text-sm text-[var(--text-muted)]">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function FormField({ id, label, error, hint, children, className }) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <Label htmlFor={id}>{label}</Label>
      {children}
      {error ? (
        <p id={`${id}-error`} className="text-xs text-danger-600">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-xs text-[var(--text-muted)]">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function EmptyState({ icon: Icon = Inbox, title, description, action, className }) {
  return (
    <div className={cn('flex flex-col items-center gap-3 px-6 py-12 text-center', className)}>
      <span className="grid h-12 w-12 place-items-center rounded-full bg-[var(--surface-muted)] text-[var(--text-muted)]">
        <Icon className="h-5 w-5" aria-hidden="true" />
      </span>
      <div className="space-y-1">
        <p className="font-medium text-[var(--text-strong)]">{title}</p>
        {description && <p className="max-w-sm text-sm text-[var(--text-muted)]">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function Pagination({ page, totalPages, onPageChange }) {
  if (totalPages <= 1) return null;
  return (
    <nav aria-label="Pagination" className="flex items-center justify-between gap-3 text-sm">
      <span className="text-[var(--text-muted)]">
        Page {page} of {totalPages}
      </span>
      <div className="flex items-center gap-2">
        <Button variant="secondary" size="sm" onClick={() => onPageChange(page - 1)} disabled={page <= 1}>
          <ChevronLeft className="h-4 w-4" aria-hidden="true" /> Previous
        </Button>
        <Button variant="secondary" size="sm" onClick={() => onPageChange(page + 1)} disabled={page >= totalPages}>
          Next <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </Button>
      </div>
    </nav>
  );
}

const HOTEL_STATUS = {
  DRAFT: { label: 'Draft', tone: 'neutral' },
  PENDING_REVIEW: { label: 'Pending review', tone: 'warning' },
  READY_TO_PUBLISH: { label: 'Ready to publish', tone: 'brand' },
  PUBLISHED: { label: 'Published', tone: 'success' },
  UNPUBLISHED: { label: 'Unpublished', tone: 'danger' },
  ARCHIVED: { label: 'Archived', tone: 'neutral' },
};

export function HotelStatusBadge({ status }) {
  const config = HOTEL_STATUS[status] ?? { label: status, tone: 'neutral' };
  return <Badge tone={config.tone}>{config.label}</Badge>;
}

export const HOTEL_STATUS_OPTIONS = Object.entries(HOTEL_STATUS).map(([value, { label }]) => ({ value, label }));

export const PROPERTY_TYPE_OPTIONS = [
  { value: 'HOTEL', label: 'Hotel' },
  { value: 'RESORT', label: 'Resort' },
  { value: 'VILLA', label: 'Villa' },
  { value: 'APARTMENT', label: 'Apartment' },
  { value: 'HOSTEL', label: 'Hostel' },
  { value: 'GUEST_HOUSE', label: 'Guest house' },
];

export function formatDateTime(value) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

/** Display only. Amounts are stored as integer minor units (paise) and converted here, never before. */
export function formatMoney(amountMinor, currency = 'INR') {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency, maximumFractionDigits: 0 }).format(amountMinor / 100);
}
