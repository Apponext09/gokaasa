import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Star } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle, Skeleton, Badge } from '@/components/ui/surfaces.jsx';
import { Button } from '@/components/ui/button.jsx';
import { ConfirmDialog } from '@/components/ui/dialog.jsx';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table.jsx';
import { BackLink, EmptyState, PageHeader, formatMoney } from '@/components/shared/index.jsx';
import { BOOKING_STATUS_LABEL } from '@/features/booking/bookingFormat.js';
import { adminApi } from '@/services/endpoints.js';
import { normalizeError } from '@/services/api.js';
import { useAuth } from '@/features/auth/AuthContext.jsx';

export function CustomerDetailPage() {
  const { id } = useParams();
  const { isAdmin } = useAuth();
  const [customer, setCustomer] = useState(null);
  const [error, setError] = useState(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [statusBusy, setStatusBusy] = useState(false);

  const load = () => {
    setError(null);
    adminApi.getCustomer(id).then(setCustomer).catch((err) => setError(normalizeError(err).message));
  };
  useEffect(load, [id]);

  const toggleStatus = async () => {
    setStatusBusy(true);
    try {
      const next = !customer.isActive;
      const updated = await adminApi.setCustomerStatus(id, next);
      setCustomer(updated);
      setConfirmOpen(false);
      toast.success(next ? 'Account reactivated' : 'Account deactivated');
    } catch (err) {
      toast.error(normalizeError(err).message);
    } finally {
      setStatusBusy(false);
    }
  };

  if (error) {
    return (
      <div className="space-y-4">
        <BackLink to="/admin/customers">Back to customers</BackLink>
        <EmptyState title="We couldn't load this customer" description={error} action={<Button onClick={load}>Try again</Button>} />
      </div>
    );
  }
  if (!customer) return <Skeleton className="h-64" />;

  return (
    <div className="space-y-6">
      <BackLink to="/admin/customers">Back to customers</BackLink>
      <PageHeader
        title={customer.name || customer.email}
        description={customer.email}
        actions={
          <>
            {!customer.isActive && <Badge tone="danger">Inactive</Badge>}
            {isAdmin && (
              <Button variant={customer.isActive ? 'danger-outline' : 'secondary'} size="sm" onClick={() => setConfirmOpen(true)}>
                {customer.isActive ? 'Deactivate account' : 'Reactivate account'}
              </Button>
            )}
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="p-4"><p className="text-xs text-[var(--text-muted)]">Bookings</p><p className="text-xl font-semibold text-[var(--text-strong)]">{customer.bookings.length}</p></Card>
        <Card className="p-4"><p className="text-xs text-[var(--text-muted)]">Total spend</p><p className="text-xl font-semibold text-[var(--text-strong)]">{formatMoney(customer.bookings.reduce((sum, b) => sum + b.amounts.paid, 0))}</p></Card>
        <Card className="p-4"><p className="text-xs text-[var(--text-muted)]">Last booking</p><p className="text-xl font-semibold text-[var(--text-strong)]">{customer.bookings[0] ? new Date(customer.bookings[0].createdAt).toLocaleDateString('en-IN') : '—'}</p></Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Profile</CardTitle></CardHeader>
        <CardContent className="grid gap-2 pt-0 sm:grid-cols-2">
          <p className="text-sm"><span className="text-[var(--text-muted)]">Phone: </span><span className="font-medium text-[var(--text-strong)]">{customer.phone ?? '—'}</span></p>
          <p className="text-sm"><span className="text-[var(--text-muted)]">Joined: </span><span className="font-medium text-[var(--text-strong)]">{new Date(customer.joinedAt).toLocaleDateString('en-IN')}</span></p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Bookings</CardTitle></CardHeader>
        <CardContent className="pt-0">
          {customer.bookings.length === 0 ? (
            <p className="text-sm text-[var(--text-muted)]">No bookings yet.</p>
          ) : (
            <Table minWidth="520px">
              <caption className="sr-only">Bookings</caption>
              <TableHeader>
                <tr>
                  <TableHead>Booking</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </tr>
              </TableHeader>
              <TableBody>
                {customer.bookings.map((b) => (
                  <TableRow key={b.id}>
                    <TableCell>
                      <Link to={`/admin/bookings/${b.id}`} className="font-medium text-[var(--text-strong)] hover:text-brand-700">{b.bookingRef}</Link>
                      <p className="text-xs text-[var(--text-muted)]">{b.hotel.name} · {b.checkIn} → {b.checkOut}</p>
                    </TableCell>
                    <TableCell><Badge tone={BOOKING_STATUS_LABEL[b.status]?.tone ?? 'neutral'}>{BOOKING_STATUS_LABEL[b.status]?.label ?? b.status}</Badge></TableCell>
                    <TableCell className="text-right text-[var(--text-strong)]">{formatMoney(b.amounts.total, b.amounts.currency)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {customer.refunds.length > 0 && (
        <Card>
          <CardHeader><CardTitle>Refunds</CardTitle></CardHeader>
          <CardContent className="pt-0">
            <Table minWidth="320px">
              <caption className="sr-only">Refunds</caption>
              <TableHeader>
                <tr>
                  <TableHead>Booking</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </tr>
              </TableHeader>
              <TableBody>
                {customer.refunds.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="text-[var(--text-body)]">{r.bookingRef}</TableCell>
                    <TableCell className="text-right text-[var(--text-strong)]">{formatMoney(r.amountMinor)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle>Reviews</CardTitle></CardHeader>
        <CardContent className="pt-0">
          {customer.reviews.length === 0 ? (
            <p className="text-sm text-[var(--text-muted)]">No reviews written yet.</p>
          ) : (
            <div className="divide-y divide-[var(--border-subtle)]">
              {customer.reviews.map((review) => (
                <div key={review.id} className="py-3 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-medium text-[var(--text-strong)]">{review.hotelName}</span>
                    <Badge tone={review.status === 'APPROVED' ? 'success' : review.status === 'REJECTED' ? 'danger' : 'neutral'}>{review.status}</Badge>
                  </div>
                  <p className="mt-1 flex items-center gap-1 text-xs text-[var(--text-muted)]">
                    {Array.from({ length: 5 }, (_, i) => (
                      <Star key={i} className={`h-3 w-3 ${i < review.rating ? 'fill-accent-500 text-accent-500' : 'text-[var(--border-subtle)]'}`} aria-hidden="true" />
                    ))}
                  </p>
                  {review.title && <p className="mt-1 font-medium text-[var(--text-strong)]">{review.title}</p>}
                  <p className="text-[var(--text-body)]">{review.body}</p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <ConfirmDialog
        open={confirmOpen}
        title={customer.isActive ? `Deactivate ${customer.name || customer.email}?` : `Reactivate ${customer.name || customer.email}?`}
        description={customer.isActive ? 'They will be signed out everywhere and unable to sign in again until reactivated. Existing bookings are not affected.' : 'They will be able to sign in again.'}
        confirmLabel={customer.isActive ? 'Deactivate account' : 'Reactivate account'}
        tone={customer.isActive ? 'danger' : 'primary'}
        loading={statusBusy}
        onConfirm={toggleStatus}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  );
}
