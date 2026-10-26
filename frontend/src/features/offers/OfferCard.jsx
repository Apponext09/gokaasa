import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, Copy, Tag } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/surfaces.jsx';
import { Button } from '@/components/ui/button.jsx';
import { SafeImage } from '@/components/shared/SafeImage.jsx';
import { destinationSearchPath } from '@/features/search/searchParams.js';
import { discountLabel, formatValidUntil, daysUntilExpiry } from '@/features/offers/offerHelpers.js';

async function copyToClipboard(text) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fall through to the legacy copy path for non-secure deployments.
  }

  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    const copied = document.execCommand('copy');
    textarea.remove();
    return copied;
  } catch {
    return false;
  }
}

/** Shared promotional card used on the homepage, offers page and hotel details. */
export function OfferCard({ offer, compact = false, dense = false, showUse = true }) {
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
    navigate(destinationSearchPath(destination, new Date(), { coupon: offer.code }));
  };

  return (
    <article className={`customer-offer-card flex overflow-hidden rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] shadow-sm transition hover:border-brand-300 hover:shadow-md ${dense ? 'h-[108px] w-[272px] max-w-[78vw] shrink-0' : compact ? 'h-[172px] w-[320px] max-w-[86vw] shrink-0' : 'h-[224px] w-full'}`}>
      <div className={`offer-card-media relative shrink-0 overflow-hidden bg-brand-950 ${dense ? 'w-[34%]' : compact ? 'w-[35%]' : 'w-[36%]'}`}>
        <SafeImage
          src={offer.imageUrl}
          alt={`${offer.title} promotional offer`}
          className="h-full w-full"
          sizes={compact ? '120px' : '(min-width: 1024px) 145px, 35vw'}
          fallbackLabel="Offer image coming soon"
        />
      </div>

      <div className={`offer-card-body flex min-w-0 flex-1 flex-col ${dense ? 'p-2' : compact ? 'p-3' : 'p-4'}`}>
        {!compact && (
          <div className="flex items-start justify-between gap-2">
            <Badge tone="premium" className="shrink-0 text-xs">{discountLabel(offer)}</Badge>
            {endingSoon && <Badge tone="warning" className="text-[10px]">{daysLeft <= 0 ? 'Ending soon' : `${daysLeft}d left`}</Badge>}
          </div>
        )}
        <h3 className={`${dense ? 'line-clamp-1 text-xs' : compact ? 'line-clamp-2 text-sm' : 'mt-3 line-clamp-2 text-base'} font-bold leading-snug text-[var(--text-strong)]`}>{offer.title}</h3>
        {!compact && <p className="mt-1 line-clamp-2 text-xs leading-5 text-[var(--text-muted)]">{offer.description}</p>}
        <div className={`offer-card-meta text-[var(--text-muted)] ${dense ? 'mt-1 text-[10px]' : 'mt-2 text-xs'}`}>
          <p>Valid till: {formatValidUntil(offer.validUntil)}</p>
          {!compact && offer.minBookingAmount > 0 && <p>Min booking: ₹{offer.minBookingAmount.toLocaleString('en-IN')}</p>}
        </div>

        <div className={`offer-card-actions mt-auto flex items-stretch gap-2 ${dense ? 'pt-1' : compact ? 'pt-2' : 'pt-3'}`}>
          <button
            type="button"
            onClick={copyCode}
            aria-label={`Copy coupon code ${offer.code}`}
            title="Click to copy coupon code"
            className={`group/code inline-flex min-w-0 flex-1 items-center justify-center gap-2 rounded-md border border-dashed border-brand-300 bg-brand-50 px-2 text-[11px] font-bold text-brand-700 transition-colors hover:border-brand-500 hover:bg-brand-100 ${dense ? 'py-1' : 'py-2'}`}
          >
            {copied ? (
              <><Check className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /> Copied!</>
            ) : (
              <>
                <span className="offer-card-code truncate font-mono tracking-wide">{offer.code}</span>
                <span className="inline-flex shrink-0 items-center gap-1 font-sans font-semibold text-brand-600">
                  <Copy className="h-3.5 w-3.5" aria-hidden="true" /> Copy
                </span>
              </>
            )}
          </button>
          {showUse && (
            <Button type="button" size="sm" variant="secondary" className="min-h-9 border-brand-200 px-3 text-xs text-brand-700" onClick={useOffer}>
              {!compact && <Tag className="h-3.5 w-3.5" aria-hidden="true" />} {compact ? 'Apply Offer' : 'Use Offer'}
            </Button>
          )}
        </div>
      </div>
    </article>
  );
}
