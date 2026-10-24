import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import {
  Award,
  ArrowRight,
  CalendarCheck,
  CheckCircle2,
  ChevronRight,
  Globe2,
  Headphones,
  Mail,
  MapPin,
  Phone,
  ShieldCheck,
  Sparkles,
  Star,
  Users,
} from 'lucide-react';

import { Button } from '@/components/ui/button.jsx';
import { Input } from '@/components/ui/form-controls.jsx';
import {
  Carousel,
  CarouselItem,
} from '@/components/ui/carousel.jsx';

import {
  FullPageSpinner,
  homePathFor,
} from '@/components/shared/index.jsx';
import { SafeImage } from '@/components/shared/SafeImage.jsx';
import { SearchWidget } from '@/features/search/components/SearchWidget.jsx';
import { NearbyHotelsSection } from '@/features/home/NearbyHotelsSection.jsx';
import { HotelsFilterPanel } from '@/features/search/components/HotelsFilterPanel.jsx';
import { HotelCard, HotelCardSkeleton } from '@/features/search/components/HotelCard.jsx';
import { cn } from '@/lib/utils.js';
import { OfferCard } from '@/features/offers/OfferCard.jsx';

import { useAuth } from '@/features/auth/AuthContext.jsx';
import { useDocumentMeta } from '@/hooks/useDocumentMeta.js';

import {
  discoveryApi,
  offerApi,
} from '@/services/endpoints.js';

import { normalizeError } from '@/services/api.js';
import { addDays, destinationSearchPath, todayIso, toSearchParams } from '@/features/search/searchParams.js';

const WHY_GOKAASA = [
  {
    icon: Award,
    title: 'Thoughtfully Selected',
    text: 'Discover stays chosen for comfort, character, and quality.',
  },
  {
    icon: ShieldCheck,
    title: 'Secure Booking',
    text: 'A smoother booking experience with secure payment processing.',
  },
  {
    icon: Headphones,
    title: 'Here When You Need Us',
    text: 'Get support and guidance throughout your journey.',
  },
  {
    icon: Users,
    title: 'Made for Travellers',
    text: 'A simpler way to find a stay that fits your plans.',
  },
];

const TESTIMONIALS = [
  {
    name: 'Priya Verma',
    quote: 'Loved the stay. Easy booking and great support from Gokaasa.',
    rating: 5,
  },
  {
    name: 'Rahul Sharma',
    quote: 'Amazing experience! Rooms were clean and service was top-notch.',
    rating: 5,
  },
  {
    name: 'Anshu Yadav',
    quote: 'The booking process was smooth, simple and completely hassle-free.',
    rating: 5,
  },
  {
    name: 'Amit Patel',
    quote: 'Loved the stay. Easy booking and great support.',
    rating: 5,
  },
  {
    name: 'Amit Singh',
    quote: 'Best hotel deals I found. Highly recommended!',
    rating: 5,
  },
];

const TRUST_STRIP = [
  { icon: Users, label: 'Happy Travelers' },
  { icon: Headphones, label: 'On-Trip Assistance' },
  { icon: CalendarCheck, label: 'Flexible Bookings' },
  { icon: Award, label: 'Thoughtful Curation' },
  { icon: ShieldCheck, label: 'Booking Support' },
];

function buildStats(stats) {
  if (!stats) return [];

  const items = [];

  if (stats.hotels?.published > 0) {
    items.push({
      icon: Globe2,
      value: stats.hotels.published.toLocaleString('en-IN'),
      label: 'Available hotels',
    });
  }

  if (stats.destinations?.countries > 0) {
    items.push({
      icon: Globe2,
      value: stats.destinations.countries.toLocaleString('en-IN'),
      label: 'Countries',
    });
  }

  if (stats.destinations?.cities > 0) {
    items.push({
      icon: MapPin,
      value: stats.destinations.cities.toLocaleString('en-IN'),
      label: 'Destinations',
    });
  }

  if (stats.bookings?.confirmed > 0) {
    items.push({
      icon: CalendarCheck,
      value: stats.bookings.confirmed.toLocaleString('en-IN'),
      label: 'Confirmed stays',
    });
  }

  return items;
}

function SectionHeading({ eyebrow, title, subtitle, action }) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="max-w-2xl">
        {eyebrow && (
          <p className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.22em] text-brand-700">
            <span className="h-px w-7 bg-brand-700" />
            {eyebrow}
          </p>
        )}

        <h2 className="font-[var(--font-display)] text-2xl font-semibold tracking-tight text-[var(--text-strong)] sm:text-3xl lg:text-4xl">
          {title}
        </h2>

        {subtitle && (
          <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--text-muted)] sm:text-base">
            {subtitle}
          </p>
        )}
      </div>

      {action}
    </div>
  );
}

function Reveal({
  children,
  className = '',
  delay = 0,
  direction = 'up',
}) {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const element = ref.current;

    if (!element) return undefined;

    const reduceMotion = window.matchMedia(
      '(prefers-reduced-motion: reduce)',
    ).matches;

    if (reduceMotion || !('IntersectionObserver' in window)) {
      setVisible(true);
      return undefined;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.unobserve(element);
        }
      },
      {
        threshold: 0.12,
        rootMargin: '0px 0px -35px 0px',
      },
    );

    observer.observe(element);

    return () => observer.disconnect();
  }, []);

  const hiddenTransform = {
    up: 'translate-y-8',
    down: '-translate-y-8',
    left: 'translate-x-8',
    right: '-translate-x-8',
    zoom: 'scale-[0.96]',
  };

  return (
    <div
      ref={ref}
      style={{ transitionDelay: `${delay}ms` }}
      className={`transform-gpu transition-[opacity,transform] duration-700 ease-out ${visible
          ? 'translate-x-0 translate-y-0 scale-100 opacity-100'
          : `${hiddenTransform[direction] || hiddenTransform.up} opacity-0`
        } ${className}`}
    >
      {children}
    </div>
  );
}

function PremiumImageCard({
  title,
  image,
  href,
  className = '',
  aspect = 'aspect-[4/3]',
  subtitle = 'Explore stays',
}) {
  return (
    <Link
      to={href}
      className={`group relative block overflow-hidden rounded-3xl border border-white/70 bg-slate-900 shadow-[0_8px_30px_rgba(15,23,42,0.08)] transition-all duration-500 hover:-translate-y-1.5 hover:shadow-[0_22px_55px_rgba(15,23,42,0.22)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-700 focus-visible:ring-offset-2 ${className}`}
    >
      <div className={`relative overflow-hidden ${aspect}`}>
        <SafeImage
          src={image}
          alt={`${title} hotels`}
          className="h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-110"
          fallbackLabel={`${title} image coming soon`}
        />

        <div className="absolute inset-0 bg-gradient-to-t from-slate-950/85 via-slate-950/15 to-transparent transition-opacity duration-500 group-hover:from-slate-950/90" />

        <div className="absolute inset-x-0 bottom-0 p-4 sm:p-5">
          <div className="flex items-end justify-between gap-3">
            <div>
              <h3 className="font-[var(--font-display)] text-lg font-semibold tracking-tight text-white sm:text-xl">
                {title}
              </h3>

              <p className="mt-1 flex items-center gap-1.5 text-xs font-medium text-white/80 sm:text-sm">
                {subtitle}
                <ArrowRight
                  className="h-3.5 w-3.5 transition-transform duration-300 group-hover:translate-x-1"
                  aria-hidden="true"
                />
              </p>
            </div>

            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/25 bg-white/15 text-white backdrop-blur-md transition-all duration-300 group-hover:bg-white group-hover:text-slate-900">
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}

function NewsletterSection() {
  const [email, setEmail] = useState('');
  const [state, setState] = useState('idle');
  const [error, setError] = useState(null);

  const submit = async (event) => {
    event.preventDefault();
    setState('loading');
    setError(null);

    try {
      await discoveryApi.subscribeNewsletter(email);
      setState('success');
      setEmail('');
    } catch (err) {
      setError(normalizeError(err).message);
      setState('error');
    }
  };

  return (
    <Reveal>
      <section
        aria-labelledby="newsletter-heading"
        className="relative isolate overflow-hidden border-t border-sky-100 bg-gradient-to-br from-white via-sky-50 to-sky-100"
      >
        <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
          <div className="absolute -right-20 -top-28 h-80 w-80 rounded-full bg-brand-700/10 blur-3xl" />
          <div className="absolute -bottom-32 -left-20 h-80 w-80 rounded-full bg-sky-300/25 blur-3xl" />
        </div>

        <div className="relative mx-auto max-w-4xl px-4 py-16 text-center sm:px-6 sm:py-20">
          <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl border border-white bg-white/80 text-brand-700 shadow-lg shadow-sky-900/5">
            <Mail className="h-6 w-6" aria-hidden="true" />
          </div>

          <p className="mb-2 text-xs font-bold uppercase tracking-[0.22em] text-brand-700">
            The Gokaasa edit
          </p>

          <h2
            id="newsletter-heading"
            className="font-[var(--font-display)] text-3xl font-semibold tracking-tight text-[var(--text-strong)] sm:text-4xl"
          >
            Good trips start in your inbox.
          </h2>

          <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-[var(--text-muted)] sm:text-base">
            Get thoughtful travel inspiration, handpicked stays, and special offers delivered to you.
          </p>

          {state === 'success' ? (
            <p
              className="mt-6 inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-5 py-3 text-sm font-medium text-emerald-700"
              role="status"
            >
              <CheckCircle2 className="h-4 w-4" />
              You're subscribed! Keep an eye on your inbox.
            </p>
          ) : (
            <form
              onSubmit={submit}
              className="mx-auto mt-7 flex max-w-xl flex-col gap-3 rounded-2xl border border-white bg-white/85 p-2 shadow-[0_15px_45px_rgba(15,23,42,0.09)] backdrop-blur sm:flex-row"
            >
              <Input
                type="email"
                required
                aria-label="Email address"
                placeholder="Enter your email address"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                disabled={state === 'loading'}
                className="min-h-12 flex-1 border-0 bg-transparent shadow-none focus-visible:ring-0"
              />

              <Button
                type="submit"
                loading={state === 'loading'}
                className="min-h-12 rounded-xl px-6"
              >
                Subscribe
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </form>
          )}

          {state === 'error' && (
            <p role="alert" className="mt-3 text-sm text-danger-600">
              {error}
            </p>
          )}

          <p className="mt-4 text-xs text-[var(--text-muted)]">
            No noise, just good places to stay.
          </p>
        </div>
      </section>
    </Reveal>
  );
}

const HOME_SORT_OPTIONS = [
  { value: 'recommended', label: 'Popularity' },
  { value: 'price_asc', label: 'Price: Low to High' },
  { value: 'price_desc', label: 'Price: High to Low' },
  { value: 'guest_rating', label: 'Customer Ratings' },
  { value: 'star_rating', label: 'Star Rating' },
];

function HomeHotelListing() {
  const [hotels, setHotels] = useState([]);
  const [status, setStatus] = useState('loading');
  const [filters, setFilters] = useState({});
  const [sort, setSort] = useState('recommended');
  const [nameQuery, setNameQuery] = useState('');
  const [priceBounds, setPriceBounds] = useState(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [listingError, setListingError] = useState(null);
  const [retryKey, setRetryKey] = useState(0);

  const today = todayIso();
  const listingState = {
    checkIn: addDays(today, 1),
    checkOut: addDays(today, 2),
    occupancy: [{ adults: 2, childAges: [] }],
    filters,
    sort,
  };

  useEffect(() => {
    const controller = new AbortController();
    setStatus('loading');
    setListingError(null);
    const params = Object.fromEntries(toSearchParams(listingState));
    params.limit = 12;
    discoveryApi
      .search(params, { signal: controller.signal })
      .then((result) => {
        setHotels(result.items ?? []);
        if (result.priceBounds) setPriceBounds(result.priceBounds);
        setStatus('ready');
      })
      .catch((requestError) => {
        if (controller.signal.aborted) return;
        setListingError(normalizeError(requestError).message);
        setStatus('error');
      });
    return () => controller.abort();
    // listingState is intentionally represented by its URL-backed inputs here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sort, filters, retryKey]);

  const filtered = nameQuery.trim()
    ? hotels.filter((h) => h.name.toLowerCase().includes(nameQuery.toLowerCase()))
    : hotels;

  const filtersPanel = (
    <HotelsFilterPanel
      filters={filters}
      priceBounds={priceBounds}
      nameQuery={nameQuery}
      onNameQueryChange={setNameQuery}
      onChange={setFilters}
      onClear={() => { setFilters({}); setNameQuery(''); }}
    />
  );

  return (
    <section className="home-hotel-listing-section" aria-label="Browse Hotels">
      <div className="home-hotel-listing-inner">
        {/* Section header */}
        <div className="home-hl-header">
          <div>
            <p className="home-hl-eyebrow">Explore top stays</p>
            <h2 className="home-hl-title">Browse All Hotels</h2>
          </div>
        </div>

        {/* Sort tabs */}
        <div className="hotels-sort-tabs-bar">
          <span className="hotels-sort-label">Sort by:</span>
          <div className="hotels-sort-buttons">
            {HOME_SORT_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                className={cn('hotels-sort-tab-btn', sort === opt.value && 'active')}
                onClick={() => setSort(opt.value)}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* 2-col grid */}
        <div className="hotels-page-grid">
          {/* Sidebar */}
          <aside className="hotels-filter-sidebar hidden lg:block">
            {filtersPanel}
          </aside>

          {/* Cards */}
          <div className="hotels-results-col">
            <div className="hotels-results-header">
              <h3 className="hotels-results-heading">
                Hotels{' '}
                {status === 'ready' && (
                  <span className="hotels-results-count">({filtered.length} Properties Found)</span>
                )}
              </h3>
              <button
                type="button"
                className="hotels-mobile-filter-btn inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium shadow-sm lg:hidden"
                onClick={() => setSheetOpen(true)}
              >
                Filters
              </button>
            </div>

            {status === 'loading' && (
              <div className="hotels-cards-stream">
                {[0, 1, 2, 3].map((i) => <HotelCardSkeleton key={i} />)}
              </div>
            )}

            {status === 'error' && (
              <div className="hotels-no-results-card" role="alert">
                <h3>Hotels could not be loaded</h3>
                <p>{listingError}</p>
                <Button variant="secondary" onClick={() => setRetryKey((key) => key + 1)}>Try Again</Button>
              </div>
            )}

            {status === 'ready' && filtered.length > 0 && (
              <div className="hotels-cards-stream">
                {filtered.map((hotel) => (
                  <HotelCard key={hotel.id} hotel={hotel} state={listingState} />
                ))}
              </div>
            )}

            {status === 'ready' && filtered.length === 0 && (
              <div className="hotels-no-results-card">
                <h3>No Hotels Match Your Filters</h3>
                <p>Try clearing some filters to see available stays.</p>
                <Button variant="secondary" onClick={() => { setFilters({}); setNameQuery(''); }}>
                  Clear Filters
                </Button>
              </div>
            )}


          </div>
        </div>
      </div>

      {/* Mobile filter sheet */}
      {sheetOpen && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true">
          <button className="absolute inset-0 bg-black/40" aria-label="Close filters" onClick={() => setSheetOpen(false)} />
          <div className="absolute inset-x-0 bottom-0 max-h-[85vh] overflow-y-auto rounded-t-2xl bg-white p-5 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <p className="text-base font-semibold">Filters</p>
              <button type="button" className="rounded-full p-1 hover:bg-slate-100" onClick={() => setSheetOpen(false)}>✕</button>
            </div>
            {filtersPanel}
            <div className="sticky bottom-0 -mx-5 mt-5 border-t border-slate-100 bg-white px-5 py-3">
              <Button className="w-full" onClick={() => setSheetOpen(false)}>Show {filtered.length} hotels</Button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

export function HomePage() {
  const { status, user, isStaff } = useAuth();

  const [popular, setPopular] = useState(null);
  const [stayTypes, setStayTypes] = useState(null);
  const [stats, setStats] = useState(null);
  const [offers, setOffers] = useState(null);
  const [error, setError] = useState(null);
  const [heroIndex, setHeroIndex] = useState(0);
  const heroSlides = useMemo(
    () => (popular ?? []).filter((place) => place.imageUrl),
    [popular],
  );

  useDocumentMeta({
    title: 'Gokaasa | Discover Your Next Beautiful Stay',
    description:
      'Discover exceptional stays with Gokaasa. Explore destinations, find handpicked hotels, and plan your next getaway.',
    canonicalPath: '/',
  });

  useEffect(() => {
    if (heroSlides.length <= 1) return undefined;
    const interval = window.setInterval(() => {
      setHeroIndex((current) => (current + 1) % heroSlides.length);
    }, 6000);

    return () => window.clearInterval(interval);
  }, [heroSlides.length]);

  useEffect(() => {
    setHeroIndex(0);
  }, [heroSlides.length]);

  useEffect(() => {
    if (isStaff) return undefined;

    let cancelled = false;

    discoveryApi
      .popularDestinations({ limit: 10 })
      .then((places) => {
        if (!cancelled) {
          setPopular(places);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(normalizeError(err).message);
        }
      });

    discoveryApi
      .stats()
      .then((data) => {
        if (!cancelled) {
          setStats(data);
        }
      })
      .catch(() => { });

    discoveryApi
      .stayTypes({ limit: 6 })
      .then((items) => {
        if (!cancelled) setStayTypes(items);
      })
      .catch(() => { });

    offerApi
      .list()
      .then((items) => {
        if (!cancelled) {
          setOffers(items);
        }
      })
      .catch(() => { });

    return () => {
      cancelled = true;
    };
  }, [isStaff]);

  if (status === 'loading') {
    return <FullPageSpinner label="Loading Gokaasa" />;
  }

  if (isStaff) {
    return <Navigate to={homePathFor(user)} replace />;
  }

  const realConfirmedBookings =
    stats?.bookings?.confirmed || 0;

  const extraStats = buildStats(stats);

  return (
    <div className="customer-home min-h-screen overflow-hidden text-[var(--text-body)]">
      {/* Hotel-booking hero adapted from the reference project. */}
      <section className="customer-booking-hero !pb-[31px] max-md:!pb-5">
        <div className="customer-hero-arch !min-h-[226px] !px-5 !pb-[94px] !pt-[41px] max-md:!min-h-[202px] max-md:!px-4 max-md:!pb-[83px] max-md:!pt-[33px]">
          <div className="customer-hero-slides" aria-hidden="true">
            {heroSlides.map((place, index) => (
              <img
                key={place.destination}
                src={place.imageUrl}
                alt=""
                fetchPriority={index === 0 ? 'high' : 'auto'}
                decoding="async"
                className={`customer-hero-slide ${index === heroIndex ? 'is-active' : ''}`}
              />
            ))}
          </div>

          <div className="customer-hero-overlay" aria-hidden="true" />

          <div className="customer-hero-content">
            <h1>Book Hotels and Homestays</h1>
            <p>
              {heroSlides[heroIndex]
                ? `Explore ${heroSlides[heroIndex].hotelCount} stay${heroSlides[heroIndex].hotelCount === 1 ? '' : 's'} in ${heroSlides[heroIndex].label}.`
                : 'Search published stays with live availability.'}
            </p>
          </div>

          {heroSlides.length > 1 && <div className="customer-hero-dots !bottom-[42px] max-md:!bottom-[39px]" role="group" aria-label="Choose hero image">
            {heroSlides.map((place, index) => (
              <button
                key={place.destination}
                type="button"
                aria-label={`Show background image ${index + 1}`}
                aria-current={index === heroIndex ? 'true' : undefined}
                onClick={() => setHeroIndex(index)}
                className={index === heroIndex ? 'is-active' : ''}
              />
            ))}
          </div>}
        </div>

        <div className="customer-search-shell !-mt-9 max-md:!-mt-[35px]">
          <SearchWidget variant="hero" />
        </div>
      </section>

      {/* EXCLUSIVE OFFERS */}
      {offers && offers.length > 0 && (
        <section
          aria-labelledby="offers-heading"
          className="mx-auto max-w-7xl space-y-5 px-4 py-10 sm:px-6 lg:py-12"
        >
          <Reveal>
            <div className="flex items-center justify-between gap-4">
              <h2 id="offers-heading" className="font-[var(--font-display)] text-2xl font-bold tracking-tight text-[var(--text-strong)]">
                Offers for you
              </h2>
              <Link
                to="/offers"
                className="inline-flex shrink-0 items-center gap-1 rounded-full border border-[var(--border-subtle)] bg-white px-4 py-2.5 text-sm font-semibold text-brand-700 shadow-sm transition hover:border-brand-700/30 hover:bg-brand-700/5"
              >
                View all offers
                <ChevronRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </div>
          </Reveal>

          <Reveal direction="left">
            <div className="flex gap-4 overflow-x-auto pb-4 [scrollbar-width:thin]">
              {offers.map((offer, index) => (
                <div
                  key={offer.id}
                  className="shrink-0 animate-[cardReveal_700ms_ease-out_both]"
                  style={{ animationDelay: `${index * 90}ms` }}
                >
                  <OfferCard offer={offer} compact />
                </div>
              ))}
            </div>
          </Reveal>
        </section>
      )}

      {/* NEARBY HOTELS */}
      <Reveal>
        <div className="py-5">
          <NearbyHotelsSection />
        </div>
      </Reveal>



      {popular?.length > 0 && (
        <section
          aria-labelledby="destinations-heading"
          className="mx-auto max-w-7xl space-y-8 px-4 py-16 sm:px-6 lg:py-20"
        >
          <Reveal>
            <SectionHeading
              eyebrow="A little travel inspiration."
              title="Explore our most popular destinations."
              subtitle="Browse places ranked by the published stays currently available on Gokaasa."
            />
          </Reveal>

          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 sm:gap-5 lg:grid-cols-4">
            {popular.map((place, index) => (
              <Reveal key={place.destination} delay={index * 65} direction="zoom">
                <PremiumImageCard
                  title={place.label}
                  image={place.imageUrl}
                  href={destinationSearchPath(place.destination)}
                  subtitle={`${place.hotelCount} hotel${place.hotelCount === 1 ? '' : 's'}`}
                  aspect="aspect-[4/3]"
                  className="h-full"
                />
              </Reveal>
            ))}
          </div>
        </section>
      )}

      {/* FEATURED HOTELS LISTING — reference-style filter + cards */}
      <HomeHotelListing />

      {/* FIND YOUR PERFECT STAY */}
      {stayTypes?.length > 0 && <section
        aria-labelledby="stay-type-heading"
        className="relative bg-white py-16 lg:py-20"
      >
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-sky-50/80 via-white to-white" />

        <div className="relative mx-auto max-w-7xl space-y-8 px-4 sm:px-6">
          <Reveal>
            <SectionHeading
              eyebrow="Stay your way"
              title="Find your perfect kind of stay."
              subtitle="Whether you're planning a relaxing escape or a city break, discover a stay that fits your travel style."
            />
          </Reveal>

          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 sm:gap-5 lg:grid-cols-5">
            {stayTypes.map((category, index) => (
              <Reveal key={category.value} delay={index * 75} direction="zoom">
                <PremiumImageCard
                  title={category.label}
                  image={category.imageUrl}
                  href={destinationSearchPath(null, new Date(), { propertyTypes: [category.value] })}
                  subtitle={`${category.hotelCount} hotel${category.hotelCount === 1 ? '' : 's'}`}
                  aspect="aspect-[4/5]"
                  className="h-full"
                />
              </Reveal>
            ))}
          </div>
        </div>
      </section>}

      {/* WHY CHOOSE GOKAASA */}
      <section
        aria-labelledby="why-heading"
        className="border-y border-sky-100 bg-white py-16 lg:py-20"
      >
        <div className="mx-auto max-w-7xl space-y-9 px-4 sm:px-6">
          <Reveal>
            <SectionHeading
              eyebrow="The Gokaasa difference"
              title="Travel with a little more confidence."
              subtitle="A considered hotel discovery experience, designed to make planning your next stay feel easier."
            />
          </Reveal>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {WHY_GOKAASA.map(({ icon: Icon, title, text }, index) => (
              <Reveal key={title} delay={index * 80}>
                <div className="group h-full rounded-3xl border border-slate-100 bg-gradient-to-br from-white to-sky-50/70 p-6 shadow-[0_5px_25px_rgba(15,23,42,0.035)] transition-all duration-300 hover:-translate-y-1 hover:border-brand-700/15 hover:shadow-[0_18px_40px_rgba(15,23,42,0.09)] sm:p-7">
                  <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-700/10 text-brand-700 transition-all duration-300 group-hover:bg-brand-700 group-hover:text-white group-hover:shadow-lg group-hover:shadow-brand-700/20">
                    <Icon className="h-5 w-5" aria-hidden="true" />
                  </div>

                  <h3 className="mb-2 text-base font-semibold text-[var(--text-strong)]">
                    {title}
                  </h3>

                  <p className="text-sm leading-6 text-[var(--text-muted)]">
                    {text}
                  </p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section
        aria-labelledby="testimonials-heading"
        className="mx-auto max-w-7xl space-y-8 px-4 py-16 sm:px-6 lg:py-20"
      >
        <Reveal>
          <SectionHeading
            eyebrow="Notes from our travellers"
            title="Good stays. Better memories."
            subtitle="Every journey has a story. Here's what travellers have shared about their experiences."
          />
        </Reveal>

        <Reveal direction="left">
          <Carousel aria-label="Customer testimonials">
            {TESTIMONIALS.map((testimonial) => (
              <CarouselItem
                key={testimonial.name}
                className="w-80 sm:w-96"
              >
                <figure className="flex h-full min-h-[225px] flex-col justify-between rounded-3xl border border-white bg-white p-6 shadow-[0_8px_35px_rgba(15,23,42,0.055)] transition-all duration-300 hover:shadow-[0_18px_45px_rgba(15,23,42,0.1)] sm:p-7">
                  <div>
                    <div
                      className="mb-5 flex items-center gap-1"
                      aria-label={`${testimonial.rating} out of 5 stars`}
                    >
                      {Array.from({ length: testimonial.rating }).map(
                        (_, index) => (
                          <Star
                            key={index}
                            className="h-4 w-4 fill-amber-400 text-amber-400"
                            aria-hidden="true"
                          />
                        )
                      )}
                    </div>

                    <blockquote className="text-sm leading-7 text-[var(--text-body)]">
                      “{testimonial.quote}”
                    </blockquote>
                  </div>

                  <figcaption className="mt-6 flex items-center gap-3 border-t border-slate-100 pt-4">
                    <span className="flex h-10 w-10 items-center justify-center rounded-full bg-sky-100 text-sm font-bold text-brand-700">
                      {testimonial.name
                        .split(' ')
                        .map((part) => part[0])
                        .join('')
                        .slice(0, 2)}
                    </span>

                    <span className="text-sm font-semibold text-[var(--text-strong)]">
                      {testimonial.name}
                    </span>

                    <span className="ml-auto inline-flex items-center gap-1 text-xs font-medium text-emerald-700">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Traveller
                    </span>
                  </figcaption>
                </figure>
              </CarouselItem>
            ))}
          </Carousel>
        </Reveal>
      </section>

      <Reveal>
        <section
          aria-labelledby="trust-heading"
          className="border-y border-sky-100 bg-white"
        >
          <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:py-14">
            <h2 id="trust-heading" className="sr-only">
              Why travellers trust Gokaasa
            </h2>

            <dl className="grid grid-cols-2 gap-x-5 gap-y-8 sm:grid-cols-3 lg:grid-cols-5">
              {TRUST_STRIP.map(({ icon: Icon, label }, index) => {
                const showReal =
                  index === 0 && realConfirmedBookings > 0;

                return (
                  <div
                    key={label}
                    className="flex flex-col items-center text-center"
                  >
                    <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl border border-sky-100 bg-sky-50 text-brand-700">
                      <Icon className="h-5 w-5" aria-hidden="true" />
                    </div>

                    <div className="flex min-h-7 items-center justify-center">
                      {showReal && (
                        <dd className="text-xl font-semibold tracking-tight text-[var(--text-strong)]">
                          {realConfirmedBookings.toLocaleString('en-IN')}+
                        </dd>
                      )}
                    </div>

                    <dt className="text-sm font-medium leading-snug text-[var(--text-body)]">
                      {label}
                    </dt>
                  </div>
                );
              })}
            </dl>


          </div>
        </section>
      </Reveal>

      <Reveal>
        <section
          aria-labelledby="support-heading"
          className="relative isolate overflow-hidden bg-slate-950"
        >
          <div className="absolute inset-0 -z-10 bg-gradient-to-br from-brand-900 via-slate-950 to-slate-900" />

          <div className="pointer-events-none absolute -right-24 -top-28 -z-10 h-96 w-96 rounded-full bg-brand-500/20 blur-3xl" />

          <div className="pointer-events-none absolute -bottom-36 -left-24 -z-10 h-96 w-96 rounded-full bg-sky-400/10 blur-3xl" />

          <div className="relative mx-auto max-w-4xl px-4 py-16 text-center sm:px-6 sm:py-20">
            <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl border border-white/15 bg-white/10 text-amber-200 backdrop-blur">
              <Headphones className="h-6 w-6" aria-hidden="true" />
            </div>

            <p className="mb-2 text-xs font-bold uppercase tracking-[0.22em] text-sky-200">
              We're here to help
            </p>

            <h2
              id="support-heading"
              className="font-[var(--font-display)] text-3xl font-semibold tracking-tight text-white sm:text-4xl"
            >
              Need a hand planning your stay?
            </h2>

            <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-white/70 sm:text-base">
              Have a question? Reach out to our team and we'll help you find
              your way.
            </p>

            <p className="mt-5 text-sm text-white/80">
              Contact our support team at{' '}
              <a
                href="tel:+919876543210"
                className="inline-flex items-center gap-1.5 font-semibold text-sky-200 transition hover:text-white hover:underline"
              >
                <Phone className="h-4 w-4" aria-hidden="true" />
                +91-9876543210
              </a>
            </p>

            <div className="mt-7">
              <Link to="/contact">
                <Button
                  variant="secondary"
                  className="min-h-12 rounded-xl px-6"
                >
                  Contact Support
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </Link>
            </div>
          </div>
        </section>
      </Reveal>

      <NewsletterSection />

    </div>
  );
}
