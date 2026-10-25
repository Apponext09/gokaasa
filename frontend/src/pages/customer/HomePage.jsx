import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import {
  Award,
  ArrowRight,
  CalendarCheck,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Globe2,
  Headphones,
  Mail,
  MapPin,
  Quote,
  ShieldCheck,
  Star,
  Users,
} from 'lucide-react';

import { Button } from '@/components/ui/button.jsx';
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
import { useGeolocation } from '@/features/home/useGeolocation.js';
import { distanceFromCoordinatesKm } from '@/features/hotels/distance.js';
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
    title: 'Curated stays',
    text: 'Quality options without endless scrolling.',
  },
  {
    icon: ShieldCheck,
    title: 'Clear pricing',
    text: 'See the full stay cost before you pay.',
  },
  {
    icon: Headphones,
    title: 'Helpful support',
    text: 'Get assistance before and after booking.',
  },
  {
    icon: Users,
    title: 'Easy trip access',
    text: 'Keep every booking detail in one place.',
  },
];

const WHY_ICON_TONES = [
  'bg-blue-100 text-blue-700',
  'bg-emerald-100 text-emerald-700',
  'bg-amber-100 text-amber-700',
  'bg-violet-100 text-violet-700',
];

const TESTIMONIALS = [
  {
    name: 'Priya Verma',
    quote: 'The total price was clear, and booking the room took only a few minutes.',
    rating: 5,
  },
  {
    name: 'Rahul Sharma',
    quote: 'Hotel details were easy to compare, and managing the reservation was straightforward.',
    rating: 5,
  },
  {
    name: 'Anshu Yadav',
    quote: 'I found the right room quickly and had every stay detail available in My Trips.',
    rating: 5,
  },
  {
    name: 'Amit Patel',
    quote: 'The cancellation terms were easy to understand before I confirmed the booking.',
    rating: 5,
  },
  {
    name: 'Amit Singh',
    quote: 'Search, room selection and payment all felt simple from start to finish.',
    rating: 5,
  },
];

const HOME_FAQS = [
  {
    question: 'Is the final price shown before payment?',
    answer: 'Yes. The review step shows the room price, discounts, taxes and fees before you continue to payment.',
  },
  {
    question: 'What happens if my plans change?',
    answer: 'Your room cancellation policy is shown before booking. Open My Trips to review the policy and any applicable refund before cancelling.',
  },
  {
    question: 'Where can I manage my reservation?',
    answer: 'Open My Trips from the header to view stay dates, guest details, payment status and available booking actions.',
  },
  {
    question: 'How will I know my booking is confirmed?',
    answer: 'After successful payment, the confirmation screen and My Trips show the latest booking status and hotel details.',
  },
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

function SectionHeading({ id, eyebrow, title, subtitle, action }) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="max-w-2xl">
        {eyebrow && (
          <p className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.22em] text-brand-700">
            <span className="h-px w-7 bg-brand-700" />
            {eyebrow}
          </p>
        )}

        <h2 id={id} className="font-[var(--font-display)] text-2xl font-semibold tracking-tight text-[var(--text-strong)] sm:text-3xl">
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

            <span className="premium-card-action flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/25 bg-white/15 text-white backdrop-blur-md transition-all duration-300 group-hover:bg-white group-hover:text-slate-900">
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}

const HOME_SORT_OPTIONS = [
  { value: 'recommended', label: 'Popularity' },
  { value: 'price_asc', label: 'Price: Low to High' },
  { value: 'price_desc', label: 'Price: High to Low' },
  { value: 'guest_rating', label: 'Customer Ratings' },
  { value: 'star_rating', label: 'Star Rating' },
];

function HomeHotelListing({ search = null, geolocation }) {
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
    checkIn: search?.checkIn ?? addDays(today, 1),
    checkOut: search?.checkOut ?? addDays(today, 2),
    occupancy: search?.occupancy ?? [{ adults: 2, childAges: [] }],
    coupon: search?.coupon ?? null,
    filters,
    sort,
  };
  const searchKey = JSON.stringify({
    destination: search?.destination ?? null,
    area: search?.area ?? null,
    hotelSlug: search?.hotelSlug ?? null,
    checkIn: listingState.checkIn,
    checkOut: listingState.checkOut,
    occupancy: listingState.occupancy,
    coupon: listingState.coupon,
  });

  useEffect(() => {
    const controller = new AbortController();
    setStatus('loading');
    setListingError(null);
    const params = Object.fromEntries(toSearchParams(listingState));
    if (search?.destination) params.destination = search.destination;
    if (search?.area) params.area = search.area;
    params.limit = search?.hotelSlug ? 50 : 12;
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
  }, [sort, filters, retryKey, searchKey]);

  const hotelsWithDistance = useMemo(() => {
    if (!geolocation.coords) return hotels;

    return hotels.map((hotel) => {
      const distanceKm = distanceFromCoordinatesKm(geolocation.coords, hotel);
      return distanceKm == null ? hotel : { ...hotel, distanceKm };
    });
  }, [geolocation.coords, hotels]);
  const destinationHotels = search?.hotelSlug
    ? hotelsWithDistance.filter((hotel) => hotel.slug === search.hotelSlug)
    : hotelsWithDistance;
  const filtered = nameQuery.trim()
    ? destinationHotels.filter((h) => h.name.toLowerCase().includes(nameQuery.toLowerCase()))
    : destinationHotels;

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
    <section id="home-hotel-results" className="home-hotel-listing-section scroll-mt-24" aria-label="Browse Hotels">
      <div className="home-hotel-listing-inner">
        {/* Section header */}
        <div className="home-hl-header">
          <div>
            <p className="home-hl-eyebrow">{search ? 'Search results' : 'Explore top stays'}</p>
            <h2 className="home-hl-title">
              {search ? (search.hotelSlug ? search.label : `Hotels in ${search.label}`) : 'Browse All Hotels'}
            </h2>
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
              <div className="flex items-center gap-2">
                {!geolocation.coords && (
                  <button
                    type="button"
                    className="inline-flex items-center gap-1.5 rounded-lg border border-brand-200 bg-white px-3 py-2 text-xs font-semibold text-brand-700 shadow-sm transition hover:bg-brand-50 disabled:cursor-wait disabled:opacity-70 sm:text-sm"
                    onClick={geolocation.request}
                    disabled={geolocation.status === 'requesting'}
                  >
                    <MapPin className="h-4 w-4" aria-hidden="true" />
                    {geolocation.status === 'requesting' ? 'Getting location…' : 'Show distance'}
                  </button>
                )}
                <button
                  type="button"
                  className="hotels-mobile-filter-btn inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium shadow-sm lg:hidden"
                  onClick={() => setSheetOpen(true)}
                >
                  Filters
                </button>
              </div>
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
  const geolocation = useGeolocation({ autoRequest: status !== 'loading' && !isStaff });

  const [popular, setPopular] = useState(null);
  const [stayTypes, setStayTypes] = useState(null);
  const [stats, setStats] = useState(null);
  const [offers, setOffers] = useState(null);
  const [error, setError] = useState(null);
  const [heroIndex, setHeroIndex] = useState(0);
  const [hotelSearch, setHotelSearch] = useState(null);
  const [openHomeFaq, setOpenHomeFaq] = useState(0);
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

  const extraStats = buildStats(stats);

  return (
    <div className="customer-home min-h-screen overflow-hidden text-[var(--text-body)]">
      {/* Hotel-booking hero adapted from the reference project. */}
      <section className="customer-booking-hero !pb-[31px] max-md:!pb-5">
        <div className="customer-hero-arch !min-h-[271px] !px-5 !pb-[94px] !pt-[41px] max-md:!min-h-[242px] max-md:!px-4 max-md:!pb-[83px] max-md:!pt-[33px]">
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
          <SearchWidget
            variant="hero"
            onSearch={(nextSearch) => {
              setHotelSearch(nextSearch);
              window.setTimeout(() => {
                document.getElementById('home-hotel-results')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }, 0);
            }}
          />
        </div>
      </section>

      {/* EXCLUSIVE OFFERS */}
      {offers && offers.length > 0 && (
        <section
          aria-labelledby="offers-heading"
          className="mx-auto max-w-7xl space-y-5 px-4 py-8 sm:px-6 lg:py-10"
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
            <div className="flex gap-4 overflow-x-auto pb-2 no-scrollbar [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
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
          className="mx-auto max-w-7xl space-y-7 px-4 py-10 sm:px-6 lg:py-12"
        >
          <Reveal>
            <SectionHeading
              title="Popular destinations"
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
      <HomeHotelListing search={hotelSearch} geolocation={geolocation} />

      {/* FIND YOUR PERFECT STAY */}
      {stayTypes?.length > 0 && <section
        aria-labelledby="stay-type-heading"
        className="mx-auto max-w-7xl space-y-5 px-4 py-7 sm:px-6 lg:py-8"
      >
        <Reveal>
          <SectionHeading
            title="Browse by property type"
          />
        </Reveal>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {stayTypes.map((category, index) => (
            <Reveal key={category.value} delay={index * 65} direction="zoom">
              <PremiumImageCard
                title={category.label}
                image={category.imageUrl}
                href={destinationSearchPath(null, new Date(), { propertyTypes: [category.value] })}
                subtitle={`${category.hotelCount} hotel${category.hotelCount === 1 ? '' : 's'}`}
                aspect="aspect-[16/9]"
                className="h-full"
              />
            </Reveal>
          ))}
        </div>
      </section>}

      <section
        aria-labelledby="testimonials-heading"
        className="mx-auto max-w-7xl space-y-3 px-4 py-5 sm:px-6 lg:py-6"
      >
        <Reveal>
          <div>
            <h2 id="testimonials-heading" className="font-[var(--font-display)] text-2xl font-semibold tracking-tight text-[var(--text-strong)]">
              Guest stories
            </h2>
            <p className="mt-1 text-sm text-[var(--text-muted)]">Simple bookings and smoother stays, in travellers' own words.</p>
          </div>
        </Reveal>

        <Reveal direction="left">
          <Carousel aria-label="Customer testimonials" controls="sides">
            {TESTIMONIALS.map((testimonial) => (
              <CarouselItem
                key={testimonial.name}
                className="w-80 sm:w-96 lg:w-[calc((100%-2rem)/3)]"
              >
                <figure className="flex h-full min-h-[124px] flex-col justify-between rounded-xl border border-rose-100/60 bg-rose-50/35 p-3.5 shadow-sm">
                  <div>
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <Quote className="h-6 w-6 fill-rose-100 text-rose-200" aria-hidden="true" />
                      <div
                        className="flex items-center gap-0.5"
                        aria-label={`${testimonial.rating} out of 5 stars`}
                      >
                        {Array.from({ length: testimonial.rating }).map(
                          (_, index) => (
                            <Star
                              key={index}
                              className="h-3.5 w-3.5 fill-amber-400 text-amber-400"
                              aria-hidden="true"
                            />
                          )
                        )}
                      </div>
                    </div>

                    <blockquote className="text-sm leading-5 text-[var(--text-body)]">
                      “{testimonial.quote}”
                    </blockquote>
                  </div>

                  <figcaption className="mt-3 flex items-center gap-2.5 border-t border-slate-100 pt-2.5">
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-rose-100 text-[11px] font-bold text-rose-700">
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
                      Verified stay
                    </span>
                  </figcaption>
                </figure>
              </CarouselItem>
            ))}
          </Carousel>
        </Reveal>
      </section>

      <section
        id="home-faqs"
        aria-labelledby="home-faqs-heading"
        className="mx-auto max-w-7xl border-t border-slate-200 px-4 py-5 sm:px-6 lg:py-6"
      >
        <div className="space-y-3">
          <Reveal>
            <div>
              <h2 id="home-faqs-heading" className="font-[var(--font-display)] text-2xl font-semibold tracking-tight text-[var(--text-strong)]">
                Before you book
              </h2>
              <p className="mt-1 text-sm text-[var(--text-muted)]">Helpful answers for planning and managing your reservation.</p>
            </div>
          </Reveal>

          <Reveal>
            <div className="grid items-start gap-2 md:grid-cols-2">
              {HOME_FAQS.map(({ question, answer }, index) => {
                const isOpen = openHomeFaq === index;
                const answerId = `home-faq-answer-${index}`;

                return (
                  <div
                    key={question}
                    className={cn(
                      'overflow-hidden rounded-xl border transition-colors',
                      isOpen
                        ? 'border-blue-200 bg-blue-50/70 shadow-sm'
                        : 'border-blue-100 bg-blue-50/30 hover:border-blue-200 hover:bg-blue-50/50',
                    )}
                  >
                    <button
                      type="button"
                      className="flex w-full items-center gap-3 px-4 py-3.5 text-left"
                      aria-expanded={isOpen}
                      aria-controls={answerId}
                      onClick={() => setOpenHomeFaq(isOpen ? -1 : index)}
                    >
                      <span className="min-w-0 flex-1 text-sm font-semibold text-[var(--text-strong)] sm:text-base">
                        {question}
                      </span>
                      <ChevronDown
                        className={cn(
                          'h-4 w-4 shrink-0 text-brand-700 transition-transform duration-200',
                          isOpen && 'rotate-180',
                        )}
                        aria-hidden="true"
                      />
                    </button>

                    {isOpen && (
                      <p
                        id={answerId}
                        className="border-t border-slate-100 px-4 py-3 text-sm leading-5 text-[var(--text-muted)]"
                      >
                        {answer}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </Reveal>
        </div>
      </section>

      {/* WHY CHOOSE GOKAASA */}
      <section
        aria-labelledby="why-heading"
        className="mx-auto max-w-7xl border-t border-slate-200 px-4 py-5 sm:px-6 lg:py-6"
      >
        <div className="grid gap-5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5 lg:grid-cols-[230px_1fr] lg:items-center lg:gap-5">
          <Reveal>
            <div>
              <h2 id="why-heading" className="font-[var(--font-display)] text-2xl font-semibold tracking-tight text-[var(--text-strong)]">
                Travel with confidence
              </h2>
              <p className="mt-1 text-sm leading-5 text-[var(--text-muted)]">A clearer, easier way to book your next stay.</p>
            </div>
          </Reveal>

          <div className="grid grid-cols-2 gap-x-4 gap-y-5 lg:grid-cols-4 lg:gap-0">
            {WHY_GOKAASA.map(({ icon: Icon, title, text }, index) => (
              <Reveal key={title} delay={index * 70} className="h-full">
                <div className="flex h-full gap-3 lg:border-l lg:border-slate-200 lg:px-4">
                  <div className={cn(
                    'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
                    WHY_ICON_TONES[index % WHY_ICON_TONES.length],
                  )}>
                    <Icon className="h-4.5 w-4.5" aria-hidden="true" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-sm font-semibold text-[var(--text-strong)]">{title}</h3>
                    <p className="mt-1 text-xs leading-4 text-[var(--text-muted)]">{text}</p>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

    </div>
  );
}
