import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, Copy, Tag } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/surfaces.jsx';
import { Button } from '@/components/ui/button.jsx';
import { slugifyPlace } from '@/features/search/searchParams.js';
import { discountLabel, formatValidUntil, daysUntilExpiry } from '@/features/offers/offerHelpers.js';

async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/**
 * One offer, shared by the Offers page, the homepage section, and the hotel-details section. `compact`
 * trims it to fit a horizontal scroller; `showUse` controls whether the "Use Offer" CTA appears (the
 * Booking Review page shows these as a plain Apply list instead, via a different component).
 */
export function OfferCard({ offer, compact = false, showUse = true }) {
  const navigate = useNavigate();
  const [copied, setCopied] = useState(false);
  const daysLeft = daysUntilExpiry(offer.validUntil);
  const endingSoon = daysLeft >= 0 && daysLeft <= 3;

  const copyCode = async () => {
    const ok = await copyToClipboard(offer.code);
    if (ok) {
      setCopied(true);
      toast.success('Code copied');
      setTimeout(() => setCopied(false), 2000);
    } else {
      toast.error('Could not copy the code -- select and copy it manually.');
    }
  };

  const useOffer = () => {
    const destination = offer.destinations?.[0];
    const path = destination ? `/hotels/${slugifyPlace(destination)}` : '/destinations';
    navigate(`${path}?coupon=${encodeURIComponent(offer.code)}`);
  };

  return (
    <article className={`customer-offer-card flex flex-col gap-3 rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-card)] p-5 shadow-sm transition-shadow hover:shadow-md ${compact ? 'w-72 shrink-0' : ''}`}>
      <div className="flex items-start justify-between gap-3">
        <Badge tone="premium" className="text-sm">{discountLabel(offer)}</Badge>
        {endingSoon && <Badge tone="warning">{daysLeft <= 0 ? 'Ending soon' : `Ends in ${daysLeft} day${daysLeft === 1 ? '' : 's'}`}</Badge>}
      </div>

      <div>
        <h3 className="text-base font-semibold text-[var(--text-strong)]">{offer.title}</h3>
        <p className="mt-0.5 text-sm text-[var(--text-muted)]">{offer.description}</p>
      </div>

      <dl className="space-y-1 text-xs text-[var(--text-muted)]">
        {offer.minBookingAmount > 0 && <div>Min booking: ₹{offer.minBookingAmount.toLocaleString('en-IN')}</div>}
        {offer.minNights && <div>Minimum {offer.minNights}-night stay</div>}
        {offer.destinations?.length > 0 && <div>Valid in: {offer.destinations.join(', ')}</div>}
        {offer.hotels?.length > 0 && <div>Valid on selected hotels</div>}
        <div>Valid until {formatValidUntil(offer.validUntil)}</div>
      </dl>

      <div className="mt-auto flex items-center gap-2 pt-1">
        <button
          type="button"
          onClick={copyCode}
          className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-[var(--radius-control)] border border-dashed border-brand-300 bg-brand-50 px-3 py-2 font-mono text-sm font-semibold text-brand-700 transition-colors hover:bg-brand-100"
        >
          {copied ? <><Check className="h-3.5 w-3.5" aria-hidden="true" /> Copied</> : <><Copy className="h-3.5 w-3.5" aria-hidden="true" /> {offer.code}</>}
        </button>
        {showUse && (
          <Button type="button" size="sm" onClick={useOffer}>
            <Tag className="h-3.5 w-3.5" aria-hidden="true" /> Use Offer
          </Button>
        )}
      </div>
    </article>
  );
}
