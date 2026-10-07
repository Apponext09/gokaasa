import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { AlertTriangle, ShieldCheck, User } from 'lucide-react';
import { Button } from '@/components/ui/button.jsx';
import { Card, Alert } from '@/components/ui/surfaces.jsx';
import { EmptyState, FullPageSpinner } from '@/components/shared/index.jsx';
import { BookingProgress } from '@/features/booking/components/BookingProgress.jsx';
import { HoldCountdown } from '@/features/booking/components/HoldCountdown.jsx';
import { HoldExpiredPanel } from '@/features/booking/components/HoldExpiredPanel.jsx';
import { StaySummary } from '@/features/booking/components/StaySummary.jsx';
import { SimulatedCheckoutDialog } from '@/features/booking/components/SimulatedCheckoutDialog.jsx';
import { openRazorpayCheckout } from '@/features/booking/razorpayCheckout.js';
import { formatMoneyMinor, occupancyLabel, EXPIRED_MESSAGE } from '@/features/booking/bookingFormat.js';
import { useHold } from '@/features/booking/useHold.js';
import { useDocumentMeta } from '@/hooks/useDocumentMeta.js';
import { normalizeError } from '@/services/api.js';
import { bookingApi, paymentApi } from '@/services/endpoints.js';

/**
 * Step 4: check everything, then pay. The price is re-read from the server on arrival. Paying creates a server
 * order for the stored total; the booking becomes CONFIRMED only after the server verifies the payment.
 */
export function BookingReviewPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const holdId = params.get('holdId');
  const { hold, loading, error, reload, setHold } = useHold(holdId);
  const [phase, setPhase] = useState('idle'); // idle | creating | checkout | verifying
  const [priceChange, setPriceChange] = useState(null);
  const [failure, setFailure] = useState(null);
  const [expiredMessage, setExpiredMessage] = useState(null);
  const [simOrder, setSimOrder] = useState(null);
  const [gateway, setGateway] = useState(null);
  const repricedRef = useRef(false);

  useDocumentMeta({ title: 'Review your booking | Gokaasa', description: 'Review your stay and pay to confirm your booking.' });

  useEffect(() => {
    paymentApi.config().then(setGateway).catch(() => setGateway({ simulated: false, keyId: null }));
  }, []);

  useEffect(() => {
    if (!holdId) navigate('/', { replace: true });
  }, [holdId, navigate]);

  // Re-price once on arrival, so the total on screen is the server's current one before the guest pays.
  useEffect(() => {
    if (!hold || hold.status !== 'HELD' || repricedRef.current) return;
    repricedRef.current = true;
    bookingApi
      .requote(hold.id)
      .then((result) => {
        setHold(result.hold);
        if (result.changed) setPriceChange({ previousTotal: result.previousTotal, total: result.hold.quote.totals.total });
      })
      .catch((err) => {
        const normalized = normalizeError(err);
        if (normalized.details?.code === 'HOLD_EXPIRED') reload();
        else toast.error(normalized.message);
      });
  }, [hold, setHold, reload]);

  useEffect(() => {
    if (!hold) return;
    if (hold.guestDetails == null && hold.status === 'HELD') navigate(`/booking/guest-details?holdId=${hold.id}`, { replace: true });
    if (hold.status === 'CONVERTED' && hold.bookingId) navigate(`/booking/confirmation/${hold.bookingId}`, { replace: true });
  }, [hold, navigate]);

  if (!holdId) return null;
  if (loading) return <FullPageSpinner label="Loading your booking" />;
  if (error) {
    return (
      <div className="mx-auto max-w-xl px-4 py-16">
        <EmptyState title="We couldn't load your booking" description={error.message} action={<Button onClick={reload}>Try again</Button>} />
      </div>
    );
  }
  if (!hold) return null;

  const ended = expiredMessage || hold.status === 'EXPIRED' || hold.status === 'RELEASED';
  const busy = phase !== 'idle';

  const handleCreateError = (err) => {
    const normalized = normalizeError(err);
    const code = normalized.details?.code;
    if (code === 'PRICE_CHANGED') {
      setPriceChange({ previousTotal: normalized.details.previousTotal, total: normalized.details.total });
      return;
    }
    if (code === 'HOLD_EXPIRED') {
      setExpiredMessage(EXPIRED_MESSAGE);
      return;
    }
    if (code === 'ALREADY_PAID') {
      navigate(`/booking/confirmation/${hold.bookingId}`, { replace: true });
      return;
    }
    toast.error(normalized.message);
  };

  const completePayment = async (payload) => {
    setPhase('verifying');
    try {
      const result = await paymentApi.verify(payload);
      navigate(`/booking/confirmation/${result.booking.id}`, { replace: true });
    } catch (err) {
      const normalized = normalizeError(err);
      if (normalized.details?.code === 'HOLD_EXPIRED_REFUNDED') {
        setExpiredMessage(normalized.message);
      } else {
        setFailure(normalized.message);
        toast.error(normalized.message);
      }
    } finally {
      setPhase('idle');
    }
  };

  const reportFailed = (orderId, reason) => {
    paymentApi.failed(orderId, reason).catch(() => {});
    setPhase('idle');
    setFailure('The payment was not completed. Your rooms are still held, so you can try again.');
  };

  const startPayment = async () => {
    setFailure(null);
    setPhase('creating');
    let order;
    try {
      order = await paymentApi.createOrder(hold.id);
    } catch (err) {
      setPhase('idle');
      handleCreateError(err);
      return;
    }
    if (order.simulated) {
      setPhase('checkout');
      setSimOrder(order);
      return;
    }
    setPhase('checkout');
    try {
      await openRazorpayCheckout({
        scriptUrl: gateway?.checkoutScriptUrl,
        keyId: order.keyId,
        orderId: order.orderId,
        amount: order.amount,
        currency: order.currency,
        description: order.description,
        prefill: order.prefill,
        onSuccess: completePayment,
        onFailure: (reason) => reportFailed(order.orderId, reason),
        onDismiss: () => reportFailed(order.orderId, 'CHECKOUT_DISMISSED'),
      });
    } catch (err) {
      setPhase('idle');
      toast.error(normalizeError(err).message);
    }
  };

  const acceptNewPrice = async () => {
    setPhase('creating');
    try {
      const result = await bookingApi.requote(hold.id);
      setHold(result.hold);
      setPriceChange(null);
      toast.success('Updated to the new total.');
    } catch (err) {
      handleRequoteError(err);
    } finally {
      setPhase('idle');
    }
  };

  const handleRequoteError = (err) => {
    const normalized = normalizeError(err);
    if (normalized.details?.code === 'HOLD_EXPIRED') setExpiredMessage(EXPIRED_MESSAGE);
    else toast.error(normalized.message);
  };

  const release = async () => {
    try {
      await bookingApi.release(hold.id);
    } finally {
      navigate('/', { replace: true });
    }
  };

  const primary = hold.guestDetails?.primaryContact;
  const cta = priceChange ? 'Accept the new total' : failure ? 'Retry payment' : `Pay ${formatMoneyMinor(hold.quote.totals.total, hold.quote.totals.currency)}`;
  const onCta = priceChange ? acceptNewPrice : startPayment;

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-6 pb-28 sm:px-6 lg:pb-10">
      <BookingProgress current={busy ? 4 : 3} />
      {ended ? (
        <HoldExpiredPanel message={expiredMessage ?? EXPIRED_MESSAGE} />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <div className="min-w-0 space-y-4">
            <HoldCountdown expiresAt={hold.expiresAt} onExpire={reload} />

            {priceChange && (
              <Alert tone="warning" title="The price for your stay has changed">
                It was {formatMoneyMinor(priceChange.previousTotal, hold.quote.totals.currency)} and is now{' '}
                <strong>{formatMoneyMinor(priceChange.total, hold.quote.totals.currency)}</strong>. Accept the new total to continue to payment.
              </Alert>
            )}
            {failure && !priceChange && (
              <Alert tone="error" title="Payment not completed">
                {failure}
              </Alert>
            )}

            <Card className="space-y-4 p-5 sm:p-6">
              <h2 className="text-base font-semibold text-[var(--text-strong)]">Guests</h2>
              {primary && (
                <p className="flex items-start gap-2 text-sm text-[var(--text-body)]">
                  <User className="mt-0.5 h-4 w-4 shrink-0 text-[var(--text-muted)]" aria-hidden="true" />
                  <span>
                    {primary.firstName} {primary.lastName} · {primary.email} · {primary.mobile}
                  </span>
                </p>
              )}
              <ul className="space-y-1 text-sm text-[var(--text-body)]">
                {(hold.guestDetails?.rooms ?? []).map((room) => (
                  <li key={room.roomIndex}>
                    <span className="font-medium">Room {room.roomIndex + 1}:</span>{' '}
                    {room.guests.map((guest) => `${guest.firstName} ${guest.lastName} (${guest.age})`).join(', ')}
                  </li>
                ))}
              </ul>
              {hold.guestDetails?.companyName && <p className="text-sm text-[var(--text-body)]">Company: {hold.guestDetails.companyName}</p>}
              {hold.guestDetails?.gstNumber && <p className="text-sm text-[var(--text-body)]">GST: {hold.guestDetails.gstNumber}</p>}
              {hold.guestDetails?.specialRequest && <p className="text-sm text-[var(--text-body)]">Requests: {hold.guestDetails.specialRequest}</p>}
              <Button variant="link" size="sm" onClick={() => navigate(`/booking/guest-details?holdId=${hold.id}`)}>
                Edit guest details
              </Button>
            </Card>

            <Card className="space-y-3 p-5 sm:p-6">
              <h2 className="flex items-center gap-2 text-base font-semibold text-[var(--text-strong)]">
                <ShieldCheck className="h-4 w-4 text-brand-600" aria-hidden="true" /> Cancellation policy
              </h2>
              <p className="text-sm text-[var(--text-body)]">{hold.quote.cancellationPolicy.description}</p>
              <p className="flex items-start gap-2 text-xs text-[var(--text-muted)]">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                Cancellation refunds follow the policy shown here, as it was when you booked. {occupancyLabel(hold.quote.stay.occupancy)}.
              </p>
            </Card>

            <div className="hidden flex-wrap items-center gap-3 lg:flex">
              <Button size="lg" className="flex-1" onClick={onCta} loading={busy} disabled={busy}>
                {busy ? (phase === 'verifying' ? 'Confirming your payment…' : 'Opening secure checkout…') : cta}
              </Button>
              <Button variant="ghost" onClick={release} disabled={busy}>
                Cancel and release rooms
              </Button>
            </div>
          </div>

          <aside className="lg:sticky lg:top-24 lg:self-start">
            <StaySummary quote={hold.quote} />
          </aside>
        </div>
      )}

      {!ended && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-[var(--border-subtle)] bg-[var(--surface-card)] p-3 shadow-lg lg:hidden">
          <Button size="lg" className="w-full" onClick={onCta} loading={busy} disabled={busy}>
            {busy ? (phase === 'verifying' ? 'Confirming…' : 'Opening checkout…') : cta}
          </Button>
        </div>
      )}

      {simOrder && (
        <SimulatedCheckoutDialog
          order={simOrder}
          onClose={() => {
            setSimOrder(null);
            setPhase('idle');
          }}
          onPaid={async (payload) => {
            setSimOrder(null);
            await completePayment(payload);
          }}
          onFailed={() => {
            setSimOrder(null);
            reportFailed(simOrder.orderId, 'SIMULATED_DECLINE');
          }}
        />
      )}
    </div>
  );
}
