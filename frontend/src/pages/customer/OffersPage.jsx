import { useEffect, useMemo, useState } from 'react';
import { Sparkles, Tag } from 'lucide-react';
import { Skeleton } from '@/components/ui/surfaces.jsx';
import { EmptyState, Pagination } from '@/components/shared/index.jsx';
import { OfferCard } from '@/features/offers/OfferCard.jsx';
import { useDocumentMeta } from '@/hooks/useDocumentMeta.js';
import { offerApi } from '@/services/endpoints.js';
import { normalizeError } from '@/services/api.js';
import { cn } from '@/lib/utils.js';

/** Only categories the actual data can support -- no filter is shown if nothing would match it. */
const CATEGORIES = [
  { key: 'all', label: 'All' },
  { key: 'percent', label: 'Percentage Off', test: (o) => o.discountType === 'PERCENT' },
  { key: 'flat', label: 'Flat Discount', test: (o) => o.discountType === 'FIXED' },
  { key: 'limited', label: 'Limited Time', test: (o) => { const d = (new Date(o.validUntil) - Date.now()) / 86_400_000; return d >= 0 && d <= 7; } },
  { key: 'destination', label: 'Destination Offers', test: (o) => o.destinations?.length > 0 },
];

const OFFERS_HERO_IMAGE =
  'https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=2000&q=88';
const OFFERS_PAGE_SIZE = 9;

export function OffersPage() {
  const [offers, setOffers] = useState(null);
  const [error, setError] = useState(null);
  const [category, setCategory] = useState('all');
  const [page, setPage] = useState(1);

  useDocumentMeta({
    title: 'Gokaasa Offers & Hotel Deals',
    description: 'Discover exclusive Gokaasa hotel offers, discounts and special deals for your next stay.',
    canonicalPath: '/offers',
  });

  useEffect(() => {
    let cancelled = false;
    offerApi.list().then((items) => !cancelled && setOffers(items)).catch((err) => !cancelled && setError(normalizeError(err).message));
    return () => { cancelled = true; };
  }, []);

  const availableCategories = useMemo(
    () => CATEGORIES.filter((c) => c.key === 'all' || (offers ?? []).some(c.test)),
    [offers],
  );
  const visible = useMemo(() => {
    if (!offers) return [];
    const active = CATEGORIES.find((c) => c.key === category);
    return !active || active.key === 'all' ? offers : offers.filter(active.test);
  }, [offers, category]);
  const totalPages = Math.max(1, Math.ceil(visible.length / OFFERS_PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pagedOffers = visible.slice((currentPage - 1) * OFFERS_PAGE_SIZE, currentPage * OFFERS_PAGE_SIZE);

  return (
    <div>
      <section className="offers-hero relative isolate overflow-hidden bg-slate-900">
        <img
          src={OFFERS_HERO_IMAGE}
          alt=""
          aria-hidden="true"
          fetchPriority="high"
          className="offers-hero-image absolute inset-0 -z-20 h-full w-full object-cover"
        />
        <div className="offers-hero-overlay absolute inset-0 -z-10" />
        <div className="offers-hero-content relative mx-auto max-w-5xl px-4 py-16 text-center sm:px-6">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full border border-white/20 bg-black/20 backdrop-blur-sm">
            <Sparkles className="h-6 w-6 text-white" aria-hidden="true" />
          </div>
          <h1 className="font-[var(--font-display)] text-3xl font-semibold tracking-tight text-white drop-shadow-md sm:text-4xl">Exclusive Offers</h1>
          <p className="mt-3 text-sm leading-6 text-white drop-shadow-sm sm:text-base">Unlock more value on your next stay with Gokaasa.</p>
        </div>
      </section>

      <div className="mx-auto max-w-7xl space-y-6 px-4 py-10 sm:px-6">
        {offers && offers.length > 0 && (
          <div className="flex flex-wrap gap-2" role="group" aria-label="Offer categories">
            {availableCategories.map((c) => (
              <button
                key={c.key}
                type="button"
                aria-pressed={category === c.key}
                onClick={() => { setCategory(c.key); setPage(1); }}
                className={cn(
                  'inline-flex items-center rounded-full border px-4 py-1.5 text-sm font-medium transition-colors',
                  category === c.key ? 'border-brand-600 bg-brand-50 text-brand-700' : 'border-[var(--border-subtle)] bg-[var(--surface-card)] text-[var(--text-body)] hover:bg-[var(--surface-muted)]',
                )}
              >
                {c.label}
              </button>
            ))}
          </div>
        )}

        {error && <p className="text-sm text-danger-600">{error}</p>}

        {!offers && !error && (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-64 rounded-2xl" />)}
          </div>
        )}

        {offers && offers.length === 0 && (
          <EmptyState icon={Tag} title="Offers are coming soon." description="Check back later for exclusive savings on your next stay." />
        )}

        {offers && offers.length > 0 && (
          <>
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {pagedOffers.map((offer) => <OfferCard key={offer.id} offer={offer} />)}
            </div>
            <Pagination page={currentPage} totalPages={totalPages} onPageChange={setPage} />
          </>
        )}
      </div>
    </div>
  );
}
