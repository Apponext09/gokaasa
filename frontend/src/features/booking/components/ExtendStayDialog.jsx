import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { CalendarPlus, CheckCircle2, AlertTriangle, Loader2 } from 'lucide-react';
import { Modal } from '@/components/ui/dialog.jsx';
import { Button } from '@/components/ui/button.jsx';
import { Alert } from '@/components/ui/surfaces.jsx';
import { bookingApi, paymentApi } from '@/services/endpoints.js';
import { normalizeError } from '@/services/api.js';
import { formatMoneyMinor, formatStayDate } from '../bookingFormat.js';
import { openRazorpayCheckout } from '../razorpayCheckout.js';

function addDaysIso(isoDate, days) {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function ExtendStayDialog({ booking, open, onClose, onExtended }) {
  const [selectedExtraNights, setSelectedExtraNights] = useState(1);
  const [checking, setChecking] = useState(false);
  const [preview, setPreview] = useState(null);
  const [checkError, setCheckError] = useState(null);
  const [paying, setPaying] = useState(false);
  const [gatewayConfig, setGatewayConfig] = useState(null);

  const currentCheckOut = booking?.stay?.checkOut || booking?.checkOut;
  const newCheckOut = currentCheckOut ? addDaysIso(currentCheckOut, selectedExtraNights) : '';

  useEffect(() => {
    paymentApi.config().then(setGatewayConfig).catch(() => {});
  }, []);

  useEffect(() => {
    if (!open || !booking?.id || !newCheckOut) return;
    let cancelled = false;
    setChecking(true);
    setCheckError(null);
    setPreview(null);

    bookingApi
      .checkExtension(booking.id, { newCheckOut })
      .then((res) => {
        if (cancelled) return;
        setPreview(res);
      })
      .catch((err) => {
        if (cancelled) return;
        setCheckError(normalizeError(err).message);
      })
      .finally(() => {
        if (!cancelled) setChecking(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, booking?.id, newCheckOut]);

  const handlePayAndExtend = async () => {
    if (!preview?.available) return;
    setPaying(true);

    try {
      const order = await bookingApi.createExtensionOrder(booking.id, { newCheckOut });

      if (order.simulated) {
        // Dev / Simulated checkout
        const simResult = await paymentApi.devCheckout({
          razorpayOrderId: order.orderId,
          outcome: 'success',
        });
        if (simResult.status === 'SUCCESS' || simResult.paymentId) {
          const finalRes = await bookingApi.confirmExtension(booking.id, {
            razorpay_order_id: order.orderId,
            razorpay_payment_id: simResult.paymentId || `pay_sim_${Date.now()}`,
            razorpay_signature: 'simulated_signature_valid',
          });
          toast.success(`Stay extended till ${formatStayDate(newCheckOut)}!`);
          onExtended?.(finalRes.booking);
          onClose();
        }
        return;
      }

      // Real or Razorpay test checkout popup
      await openRazorpayCheckout({
        scriptUrl: gatewayConfig?.checkoutScriptUrl,
        keyId: order.keyId,
        orderId: order.orderId,
        amount: order.amount,
        currency: order.currency,
        description: order.description,
        prefill: order.prefill,
        onSuccess: async (payload) => {
          try {
            const finalRes = await bookingApi.confirmExtension(booking.id, payload);
            toast.success(`Stay extended till ${formatStayDate(newCheckOut)}!`);
            onExtended?.(finalRes.booking);
            onClose();
          } catch (confirmErr) {
            toast.error(normalizeError(confirmErr).message);
          }
        },
        onFailure: (reason) => {
          toast.error(reason || 'Extension payment was cancelled or failed.');
        },
        onDismiss: () => {
          toast.info('Payment window closed.');
        },
      });
    } catch (err) {
      toast.error(normalizeError(err).message);
    } finally {
      setPaying(false);
    }
  };

  if (!booking) return null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Extend Room Stay"
      description={`Current check-out: ${formatStayDate(currentCheckOut)}`}
    >
      <div className="space-y-4">
        {/* Step 1: Select Extra Nights */}
        <div>
          <label className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">
            Select Extension Duration
          </label>
          <div className="mt-2 flex flex-wrap gap-2">
            {[1, 2, 3, 4, 5].map((nights) => (
              <button
                key={nights}
                type="button"
                onClick={() => setSelectedExtraNights(nights)}
                className={`rounded-lg px-3 py-2 text-sm font-medium border transition-colors ${
                  selectedExtraNights === nights
                    ? 'border-brand-600 bg-brand-50 text-brand-700 shadow-sm'
                    : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                }`}
              >
                +{nights} Night{nights === 1 ? '' : 's'}
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs text-[var(--text-muted)]">
            New Check-out Date:{' '}
            <strong className="text-[var(--text-strong)]">{formatStayDate(newCheckOut)}</strong>
          </p>
        </div>

        {/* Step 2: Live Inventory & Pricing Check */}
        {checking && (
          <div className="flex items-center gap-2 rounded-lg border border-slate-100 bg-slate-50 p-4 text-sm text-[var(--text-muted)]">
            <Loader2 className="h-4 w-4 animate-spin text-brand-600" />
            <span>Checking room availability & live pricing...</span>
          </div>
        )}

        {checkError && (
          <Alert tone="error" title="Cannot Extend Stay">
            {checkError}
          </Alert>
        )}

        {preview && !checking && (
          <>
            {preview.available ? (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50/70 p-4 space-y-2">
                <div className="flex items-center gap-2 text-sm font-semibold text-emerald-800">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  <span>Room is available for this extension!</span>
                </div>
                <div className="border-t border-emerald-200/60 pt-2 text-xs space-y-1 text-slate-700">
                  <div className="flex justify-between">
                    <span>Extra Nights:</span>
                    <span className="font-medium">
                      {preview.extraNights} night{preview.extraNights === 1 ? '' : 's'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Base Fare:</span>
                    <span>{formatMoneyMinor(preview.subtotalMinor, preview.currency)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Taxes:</span>
                    <span>{formatMoneyMinor(preview.taxesMinor, preview.currency)}</span>
                  </div>
                  <div className="flex justify-between text-sm font-bold text-slate-900 pt-1 border-t border-emerald-200">
                    <span>Amount to Pay:</span>
                    <span className="text-emerald-700">
                      {formatMoneyMinor(preview.totalMinor, preview.currency)}
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 space-y-2">
                <div className="flex items-start gap-2 text-sm text-amber-900">
                  <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 mt-0.5" />
                  <div>
                    <p className="font-semibold">Room Not Available</p>
                    <p className="text-xs mt-1 text-amber-800">
                      {preview.message ||
                        'Sorry, this room is already booked by another guest for the selected dates.'}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {/* Step 3: Action Buttons */}
        <div className="flex items-center justify-end gap-2 pt-2 border-t">
          <Button variant="secondary" onClick={onClose} disabled={paying}>
            Cancel
          </Button>
          {preview?.available && (
            <Button
              onClick={handlePayAndExtend}
              loading={paying}
              className="bg-brand-600 text-white hover:bg-brand-700 shadow-sm"
            >
              <CalendarPlus className="mr-1.5 h-4 w-4" />
              Pay {formatMoneyMinor(preview.totalMinor, preview.currency)} &amp; Extend
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
}

