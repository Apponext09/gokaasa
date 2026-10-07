import { useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { BadgeCheck, Building2, Globe2, MapPin, ShieldCheck, Star, Users, Wallet } from 'lucide-react';
import { Skeleton } from '@/components/ui/surfaces.jsx';
import { SafeImage } from '@/components/shared/SafeImage.jsx';
import { FullPageSpinner, homePathFor } from '@/components/shared/index.jsx';
import { SearchWidget } from '@/features/search/components/SearchWidget.jsx';
import { useAuth } from '@/features/auth/AuthContext.jsx';
import { useDocumentMeta } from '@/hooks/useDocumentMeta.js';
import { discoveryApi } from '@/services/endpoints.js';
import { normalizeError } from '@/services/api.js';
import { slugifyPlace } from '@/features/search/searchParams.js';

const STATS = [
  { icon: Building2, value: '50,000+', label: 'Hotels' },
  { icon: Users, value: '2M+', label: 'Happy customers' },
  { icon: Globe2, value: '180+', label: 'Countries' },
  { icon: Star, value: '15+', label: 'Years of excellence' },
];

const REASONS = [
  { icon: BadgeCheck, title: 'Verified details', text: 'Photos, amenities and policies are checked by our team before a hotel goes live.' },
  { icon: Wallet, title: 'Honest prices', text: 'Taxes and fees are shown with every price. The total you see is the total we confirm.' },
  { icon: ShieldCheck, title: 'Clear cancellation', text: 'Every rate states its cancellation policy up front, before you choose it.' },
];

function Section({ title, children, id }) {
  return (
    <section aria-labelledby={id} className="mx-auto w-full max-w-7xl px-4 py-12 sm:px-6">
      <h2 id={id} className="mb-6 text-2xl font-semibold tracking-tight text-[var(--text-strong)]">{title}</h2>
      {children}
    </section>
  );
}

export function HomePage() {
  const { status, user, isStaff } = useAuth();
  const [popular, setPopular] = useState(null);
  const [featured, setFeatured] = useState(null);
  const [error, setError] = useState(null);

  useDocumentMeta({
    title: 'Gokaasa | Find your perfect stay',
    description: 'Search hotels across 180+ countries. Compare rooms, rates and cancellation policies, with taxes and fees shown up front.',
    canonicalPath: '/',
  });

  useEffect(() => {
    if (isStaff) return;
    let cancelled = false;
    Promise.all([discoveryApi.popularDestinations(), discoveryApi.featuredHotels()])
      .then(([places, hotels]) => {
        if (cancelled) return;
        setPopular(places);
        setFeatured(hotels);
      })
      .catch((err) => !cancelled && setError(normalizeError(err).message));
    return () => {
      cancelled = true;
    };
  }, [isStaff]);

  if (status === 'loading') return <FullPageSpinner label="Loading Gokaasa" />;
  if (isStaff) return <Navigate to={homePathFor(user)} replace />;

  return (
    <div>
      <section className="relative overflow-hidden border-b border-[var(--border-subtle)] bg-[var(--surface-card)]">
        <div className="mx-auto max-w-7xl px-4 pb-10 pt-12 sm:px-6 lg:pb-14 lg:pt-20">
          <div className="max-w-2xl space-y-4">
            <p className="text-sm font-semibold uppercase tracking-wider text-brand-600">Making travel accessible and extraordinary</p>
            <h1 className="text-4xl font-semibold tracking-tight text-[var(--text-strong)] sm:text-5xl">Find Your Perfect Stay</h1>
            <p className="text-base text-[var(--text-muted)]">
              Compare rooms and rates from hotels worldwide. Prices include taxes and fees, and every cancellation policy is shown before you book.
            </p>
          </div>
          <div className="mt-8">
            <SearchWidget variant="hero" />
          </div>
        </div>
      </section>

      <Section id="popular-heading" title="Popular destinations">
        {error && <p className="text-sm text-danger-600">We couldn't load destinations right now.</p>}
        {!popular && !error && (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
            {[0, 1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-20" />)}
          </div>
        )}
        {popular?.length > 0 && (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
            {popular.map((place) => (
              <Link
                key={place.destination}
                to={`/hotels/${place.destination}`}
                className="group flex flex-col justify-between rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] p-4 transition-shadow hover:shadow-md focus-visible:outline-2 focus-visible:outline-brand-500"
              >
                <MapPin className="h-4 w-4 text-brand-700" aria-hidden="true" />
                <span className="mt-3 text-base font-semibold text-[var(--text-strong)] group-hover:text-brand-700">{place.label}</span>
                <span className="text-xs text-[var(--text-muted)]">
                  {place.hotelCount} hotel{place.hotelCount === 1 ? '' : 's'}
                </span>
              </Link>
            ))}
          </div>
        )}
      </Section>

      {featured?.length > 0 && (
        <Section id="featured-heading" title="Featured hotels">
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {featured.map((hotel) => (
              <Link
                key={hotel.id}
                to={`/hotels/${slugifyPlace(hotel.city)}/${hotel.slug}`}
                className="group overflow-hidden rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] transition-shadow hover:shadow-md focus-visible:outline-2 focus-visible:outline-brand-500"
              >
                <SafeImage src={hotel.image?.url} alt={hotel.name} className="aspect-[16/10] w-full" fallbackLabel={`${hotel.name}: photos coming soon`} />
                <div className="space-y-1 p-4">
                  <p className="truncate text-base font-semibold text-[var(--text-strong)] group-hover:text-brand-700">{hotel.name}</p>
                  <p className="truncate text-sm text-[var(--text-muted)]">{[hotel.area, hotel.city].filter(Boolean).join(', ')}</p>
                </div>
              </Link>
            ))}
          </div>
        </Section>
      )}

      <Section id="why-heading" title="Why Gokaasa?">
        <div className="grid gap-5 md:grid-cols-3">
          {REASONS.map(({ icon: Icon, title, text }) => (
            <div key={title} className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] p-6">
              <Icon className="mb-3 h-5 w-5 text-brand-700" aria-hidden="true" />
              <h3 className="mb-1 text-base font-semibold text-[var(--text-strong)]">{title}</h3>
              <p className="text-sm text-[var(--text-muted)]">{text}</p>
            </div>
          ))}
        </div>
        <dl className="mt-8 grid grid-cols-2 gap-6 border-t border-[var(--border-subtle)] pt-8 md:grid-cols-4">
          {STATS.map(({ icon: Icon, value, label }) => (
            <div key={label} className="flex items-start gap-3">
              <Icon className="mt-1 h-4 w-4 text-brand-700" aria-hidden="true" />
              <div>
                <dt className="text-xs text-[var(--text-muted)]">{label}</dt>
                <dd className="text-xl font-semibold tracking-tight text-[var(--text-strong)]">{value}</dd>
              </div>
            </div>
          ))}
        </dl>
      </Section>
    </div>
  );
}
