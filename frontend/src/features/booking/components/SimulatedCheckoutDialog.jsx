import { useState } from 'react';
import { Modal } from '@/components/ui/dialog.jsx';
import { Button } from '@/components/ui/button.jsx';
import { Alert } from '@/components/ui/surfaces.jsx';
import { paymentApi } from '@/services/endpoints.js';
import { normalizeError } from '@/services/api.js';
import { formatMoneyMinor } from '../bookingFormat.js';

/**
 * Stands in for Razorpay Checkout only when no Razorpay test keys are configured, and only in development.
 * It is clearly labelled, moves no money, and still goes through the server's signature verification.
 * The browser never decides the outcome itself: the server creates the simulated payment and signs it.
 */
export function SimulatedCheckoutDialog({ order, onPaid, onFailed, onClose }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const choose = async (outcome) => {
    setBusy(true);
    setError(null);
    try {
      const result = await paymentApi.devCheckout(order.orderId, outcome);
      if (outcome === 'failure') onFailed();
      else await onPaid({ razorpay_order_id: result.razorpay_order_id, razorpay_payment_id: result.razorpay_payment_id, razorpay_signature: result.razorpay_signature });
    } catch (err) {
      setError(normalizeError(err).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open title="Simulated payment (development)" onClose={busy ? () => {} : onClose}>
      <div className="space-y-4">
        <Alert tone="warning" title="No real payment is taken">
          Razorpay test keys are not configured, so this stands in for Checkout. The booking is confirmed only through the
          same server-side signature check used for real payments.
        </Alert>
        <p className="text-sm text-[var(--text-body)]">
          Amount: <strong>{formatMoneyMinor(order.amount, order.currency)}</strong> · Order <code className="text-xs">{order.orderId}</code>
        </p>
        {error && <Alert tone="error">{error}</Alert>}
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={() => choose('failure')} disabled={busy}>
            Simulate a failed payment
          </Button>
          <Button onClick={() => choose('success')} loading={busy}>
            Simulate a successful payment
          </Button>
        </div>
      </div>
    </Modal>
  );
}
