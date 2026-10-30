import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import {
  CalendarCheck,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Compass,
  Globe2,
  Headphones,
  Mail,
  MapPin,
  Quote,
  ShieldCheck,
  Smile,
  Star,
} from 'lucide-react';

import { Button } from '@/components/ui/button.jsx';
import {
  Carousel,
  CarouselItem,
} from '@/components/ui/carousel.jsx';

import {
  Pagination,
  homePathFor,
} from '@/components/shared/index.jsx';
import { Reveal } from '@/components/shared/Reveal.jsx';
import { SafeImage } from '@/components/shared/SafeImage.jsx';
import { HeroSection } from '@/features/home/HeroSection.jsx';
import { DestinationCard } from '@/features/home/DestinationCard.jsx';
import { useGeolocation } from '@/features/home/useGeolocation.js';
import { distanceFromCoordinatesKm } from '@/features/hotels/distance.js';
import { HotelsFilterPanel } from '@/features/search/components/HotelsFilterPanel.jsx';
import { HotelCard, HotelCardSkeleton } from '@/features/search/components/HotelCard.jsx';
import { cn } from '@/lib/utils.js';
import { OfferCard } from '@/features/offers/OfferCard.jsx';

import { useAuth } from '@/features/auth/AuthContext.jsx';
import { isStaffCustomerView } from '@/features/auth/viewMode.js';
import { useDocumentMeta } from '@/hooks/useDocumentMeta.js';
import { useDebounce } from '@/hooks/useDebounce.js';

import {
  discoveryApi,
  offerApi,
} from '@/services/endpoints.js';

import { normalizeError } from '@/services/api.js';
import { addDays, destinationSearchPath, todayIso, toSearchParams } from '@/features/search/searchParams.js';

const NearbyHotelsSection = lazy(() => import('@/features/home/NearbyHotelsSection.jsx').then((module) => ({
  default: module.NearbyHotelsSection,
})));

function DeferredNearbyHotels() {
  const mountRef = useRef(null);
  const [shouldLoad, setShouldLoad] = useState(false);

  useEffect(() => {
    if (shouldLoad || !mountRef.current) return undefined;
    if (!('IntersectionObserver' in window)) {
      setShouldLoad(true);
      return undefined;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        setShouldLoad(true);
        observer.disconnect();
      },
      { rootMargin: '500px 0px' },
    );
    observer.observe(mountRef.current);
    return () => observer.disconnect();
  }, [shouldLoad]);

  return (
    <div ref={mountRef}>
      {shouldLoad ? (
        <Suspense fallback={<div className="min-h-64 animate-pulse rounded-2xl bg-slate-100" aria-label="Loading nearby hotels" />}>
          <NearbyHotelsSection />
        </Suspense>
      ) : (
        <div className="min-h-64 rounded-2xl bg-slate-50" aria-hidden="true" />
      )}
    </div>
  );
}

const WHY_GOKAASA = [
  {
    icon: Smile,
    title: 'Happy Travellers',
  },
  {
    icon: Compass,
    title: 'On-trip Assistance',
  },
  {
    icon: CalendarCheck,
    title: 'Flexible Bookings',
  },
  {
    icon: Headphones,
    title: '24/7 Support',
  },
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
    <div className="customer-section-heading flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="max-w-2xl">
        {eyebrow && (
          <p className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.22em] text-brand-700">
            <span className="h-px w-7 bg-brand-700" />
            {eyebrow}
          </p>
        )}

        <h2 id={id} className="customer-section-title">
          {title}
        </h2>

        {subtitle && (
          <p className="customer-section-copy">
            {subtitle}
          </p>
        )}
      </div>

      {action}
    </div>
  );
}

const HOME_SORT_OPTIONS = [
  { value: 'recommended', label: 'Popularity' },
  { value: 'price_asc', label: 'Price: Low to High' },
  { value: 'price_desc', label: 'Price: High to Low' },
  { value: 'guest_rating', label: 'Customer Ratings' },
  { value: 'star_rating', label: 'Star Rating' },
];

const HOME_HOTELS_PAGE_SIZE = 12;
const titleCaseSlug = (slug) => String(slug ?? '')
  .split('-')
  .map((word) => (word ? word[0].toUpperCase() + word.slice(1) : word))
  .join(' ');

function HomeHotelListing({ search = null, geolocation, authStatus }) {
  const [hotels, setHotels] = useState([]);
  const [status, setStatus] = useState('loading');
  const [filters, setFilters] = useState({});
  const [sort, setSort] = useState('recommended');
  const [nameQuery, setNameQuery] = useState(search?.name ?? '');
  const debouncedNameQuery = useDebounce(nameQuery.trim(), 200);
  const [priceBounds, setPriceBounds] = useState(undefined);
  const [resultTotal, setResultTotal] = useState(0);
  const [resultPagination, setResultPagination] = useState(null);
  const [page, setPage] = useState(1);
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
    filterName: debouncedNameQuery,
    sort,
    filters,
  });

  useEffect(() => {
    setPage(1);
  }, [searchKey]);

  useEffect(() => {
    const controller = new AbortController();
    setStatus('loading');
    setListingError(null);
    const params = Object.fromEntries(toSearchParams(listingState));
    if (search?.destination) params.destination = search.destination;
    if (search?.area) params.area = search.area;
    if (debouncedNameQuery) params.name = debouncedNameQuery;
    params.page = page;
    params.limit = HOME_HOTELS_PAGE_SIZE;
    discoveryApi
      .search(params, { signal: controller.signal })
      .then((result) => {
        setHotels(result.items ?? []);
        setPriceBounds(result.priceBounds ?? null);
        setResultTotal(result.pagination?.total ?? result.items?.length ?? 0);
        setResultPagination(result.pagination ?? null);
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
  }, [page, retryKey, searchKey, authStatus]);

  const hotelsWithDistance = useMemo(() => {
    if (!geolocation.coords) return hotels;

    return hotels.map((hotel) => {
      const distanceKm = distanceFromCoordinatesKm(geolocation.coords, hotel);
      return distanceKm == null ? hotel : { ...hotel, distanceKm };
    });
  }, [geolocation.coords, hotels]);
  const destinationHotels = search?.hotelSlug && debouncedNameQuery === search.name
    ? hotelsWithDistance.filter((hotel) => hotel.slug === search.hotelSlug)
    : hotelsWithDistance;
  const filtered = destinationHotels;

  const clearFilters = () => {
    setFilters({});
    setNameQuery('');
    setPage(1);
  };

  const locationLabel = search?.area
    ? titleCaseSlug(search.area)
    : search?.destination
      ? titleCaseSlug(search.destination)
      : '';
  const activeName = nameQuery.trim();
  const hasActiveSearch = Boolean(activeName || locationLabel);

  const filtersPanel = (
    <HotelsFilterPanel
      filters={filters}
      priceBounds={priceBounds}
      nameQuery={nameQuery}
      onNameQueryChange={setNameQuery}
      onChange={setFilters}
      onClear={clearFilters}
    />
  );

  // Keep the landing page intentional when the catalogue service is offline.
  // An explicit search still receives the normal retry state below.
  if (status === 'error' && !search) return null;

  return (
    <section
      id="home-hotel-results"
      className={cn('home-hotel-listing-section scroll-mt-24', `is-${status}`)}
      aria-label="Browse Hotels"
    >
      <div className="home-hotel-listing-inner">
        {/* Section header */}
        <div className="home-hl-header">
          <div>
            <p className="home-hl-eyebrow">{hasActiveSearch ? 'Search results' : 'Explore top stays'}</p>
            <h2 className="home-hl-title">
              {activeName
                ? `Hotels matching ${activeName}`
                : locationLabel
                  ? `Hotels in ${locationLabel}`
                  : 'Browse All Hotels'}
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
                  <span className="hotels-results-count">({resultTotal} Properties Found)</span>
                )}
                {status === 'loading' && hotels.length > 0 && (
                  <span className="hotels-results-count">(Updating...)</span>
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

            {status === 'loading' && hotels.length === 0 && (
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

            {status !== 'error' && filtered.length > 0 && (
              <>
                <div className={cn('hotels-cards-stream', status === 'loading' && 'is-updating')} aria-busy={status === 'loading'}>
                  {filtered.map((hotel) => (
                    <HotelCard key={hotel.id} hotel={hotel} state={listingState} />
                  ))}
                </div>
                {resultPagination && (
                  <Pagination
                    page={resultPagination.page}
                    totalPages={resultPagination.totalPages}
                    onPageChange={setPage}
                  />
                )}
              </>
            )}

            {status === 'ready' && filtered.length === 0 && (
              <div className="hotels-no-results-card">
                <h3>No Hotels Found</h3>
                <p>No hotels are currently available for this search.</p>
              </div>
            )}


          </div>
        </div>
      </div>

      {/* Mobile filter drawer: keeps the results visible on the right, like the desktop split layout. */}
      {sheetOpen && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true">
          <button className="absolute inset-0 bg-slate-950/35" aria-label="Close filters" onClick={() => setSheetOpen(false)} />
          <div className="mobile-filter-drawer absolute inset-y-0 left-0 w-[82vw] max-w-80 overflow-y-auto rounded-r-2xl bg-white p-4 shadow-2xl">
            <div className="sticky top-0 z-10 -mx-4 -mt-4 mb-3 flex items-center justify-between border-b border-slate-100 bg-white px-4 py-3">
              <p className="text-sm font-semibold">Filters</p>
              <button type="button" className="rounded-full p-1 hover:bg-slate-100" onClick={() => setSheetOpen(false)}>✕</button>
            </div>
            {filtersPanel}
            <div className="sticky bottom-0 -mx-4 mt-4 border-t border-slate-100 bg-white px-4 py-3">
              <Button className="w-full" onClick={() => setSheetOpen(false)}>Show {resultTotal} hotels</Button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

export function HomePage() {
  const { status, user, isStaff } = useAuth();
  const customerView = !isStaff || isStaffCustomerView();
  const geolocation = useGeolocation({ autoRequest: status !== 'loading' && customerView });

  const [areaDestinations, setAreaDestinations] = useState(null);
  const [stayTypes, setStayTypes] = useState(null);
  const [stats, setStats] = useState(null);
  const [offers, setOffers] = useState(null);
  const [heroIndex, setHeroIndex] = useState(0);
  const [homepageBackgrounds, setHomepageBackgrounds] = useState(null);
  const [hotelSearch, setHotelSearch] = useState(null);
  const [hotelSearchVersion, setHotelSearchVersion] = useState(0);
  const [openHomeFaq, setOpenHomeFaq] = useState(0);

  useDocumentMeta({
    title: 'Gokaasa | Discover Your Next Beautiful Stay',
    description:
      'Discover exceptional stays with Gokaasa. Explore destinations, find handpicked hotels, and plan your next getaway.',
    canonicalPath: '/',
  });

  const heroSlides = useMemo(
    () => (homepageBackgrounds ?? []).map((image) => ({
      src: image.url,
      label: image.altText || `Homepage background ${image.slot}`,
      heroText: image.heroText,
    })),
    [homepageBackgrounds],
  );

  useEffect(() => {
    setHeroIndex(0);
    if (heroSlides.length <= 1) return undefined;
    const interval = window.setInterval(() => {
      setHeroIndex((current) => (current + 1) % heroSlides.length);
    }, 6000);

    return () => window.clearInterval(interval);
  }, [heroSlides.length]);

  useEffect(() => {
    if (!customerView) return undefined;

    let cancelled = false;

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

    discoveryApi
      .popularAreas({ limit: 8 })
      .then((items) => {
        if (!cancelled) setAreaDestinations(items);
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

    discoveryApi.homepageBackgrounds().then((images) => {
      if (!cancelled) setHomepageBackgrounds(images);
    }).catch(() => {
      if (!cancelled) setHomepageBackgrounds([]);
    });

    return () => {
      cancelled = true;
    };
  }, [customerView]);

  if (isStaff && !customerView) {
    return <Navigate to={homePathFor(user)} replace />;
  }

  const extraStats = buildStats(stats);
  return (
    <div className="customer-home min-h-screen text-[var(--text-body)]">
      <HeroSection
        heroSlides={heroSlides}
        heroIndex={heroIndex}
        setHeroIndex={setHeroIndex}
        onSearch={(nextSearch) => {
          setHotelSearch(nextSearch);
          setHotelSearchVersion((version) => version + 1);
          window.setTimeout(() => {
            document.getElementById('home-hotel-results')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }, 0);
        }}
      />

      {/* EXCLUSIVE OFFERS */}
      {offers && offers.length > 0 && (
        <section
          aria-labelledby="offers-heading"
          className="customer-section customer-section--offers"
        >
          <Reveal>
            <div className="flex items-center justify-between gap-4">
              <h2 id="offers-heading" className="customer-section-title">
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

      {/* BROWSE BY PROPERTY TYPE */}
      {stayTypes?.length > 0 && <section
        aria-labelledby="stay-type-heading"
        className="customer-section"
      >
        <Reveal>
          <SectionHeading
            title="Browse by property type"
          />
        </Reveal>

        <div className="collections-tabs-bar" aria-label="Property types">
          {stayTypes.map((category) => (
            <Link
              key={category.value}
              to={destinationSearchPath(null, new Date(), { propertyTypes: [category.value] })}
              className="collection-tab-btn"
            >
              {category.label}
            </Link>
          ))}
        </div>

        <div className="collection-cards-grid">
          {stayTypes.map((category, index) => (
            <Reveal key={category.value} delay={index * 65} direction="zoom" className="h-full">
              <Link
                to={destinationSearchPath(null, new Date(), { propertyTypes: [category.value] })}
                className="collection-card-item group"
              >
                <div className="collection-img-wrap">
                  <SafeImage
                    src={category.imageUrl}
                    alt={`${category.label} stays`}
                    className="h-full w-full object-cover"
                    fallbackLabel={`${category.label} image`}
                    showFallbackContent={false}
                  />
                  <span className="collection-overlay-gradient" aria-hidden="true" />
                  <div className="collection-card-caption">
                    <h3>{category.label}</h3>
                    <p className="card-explore-count">
                      Explore {category.hotelCount} {category.label.toLowerCase()}{category.hotelCount === 1 ? '' : 's'}
                    </p>
                  </div>
                </div>
              </Link>
            </Reveal>
          ))}
        </div>
      </section>}

      {areaDestinations?.length > 0 && (
        <section aria-labelledby="explore-areas-heading" className="customer-section">
          <Reveal>
            <SectionHeading
              title="Explore Stays Around You"
              subtitle="Discover memorable stays in popular neighbourhoods and destinations."
            />
          </Reveal>

          <div className="collection-cards-grid">
            {areaDestinations.map((area, index) => (
              <Reveal key={area.id || area.label} delay={index * 65} direction="zoom" className="h-full">
                <DestinationCard
                  label={area.label}
                  citySlug={area.citySlug}
                  area={area.area}
                  hotelCount={area.hotelCount}
                  imageUrl={area.imageUrl}
                  className="h-full"
                />
              </Reveal>
            ))}
          </div>
        </section>
      )}

      {/* NEARBY HOTELS */}
      {/* FEATURED HOTELS LISTING — reference-style filter + cards */}
      <HomeHotelListing key={hotelSearchVersion} search={hotelSearch} geolocation={geolocation} authStatus={status} />

      <Reveal>
        <div className="customer-section customer-section--compact customer-section--divided home-nearby-wrap">
          <DeferredNearbyHotels />
        </div>
      </Reveal>

      <section
        aria-labelledby="testimonials-heading"
        className="customer-section customer-section--compact"
      >
        <Reveal className="customer-section-heading home-stories-heading">
          <div>
            <h2 id="testimonials-heading" className="customer-section-title">
              Guest stories
            </h2>
            <p className="mt-1 text-sm text-[var(--text-muted)]">Simple bookings and smoother stays, in travellers' own words.</p>
          </div>
        </Reveal>

        <Reveal direction="left">
          <Carousel aria-label="Customer testimonials" className="home-stories-carousel" controls="sides">
            {TESTIMONIALS.map((testimonial) => (
              <CarouselItem
                key={testimonial.name}
                className="home-story-slide"
              >
                <figure className="home-story-card">
                  <div>
                    <div className="home-story-card-topline">
                      <Quote className="home-story-quote-icon" aria-hidden="true" />
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

                    <blockquote className="home-story-quote">
                      “{testimonial.quote}”
                    </blockquote>
                  </div>

                  <figcaption className="home-story-author">
                    <span className="home-story-avatar">
                      {testimonial.name
                        .split(' ')
                        .map((part) => part[0])
                        .join('')
                        .slice(0, 2)}
                    </span>

                    <span className="home-story-name">
                      {testimonial.name}
                    </span>

                    <span className="home-story-verified">
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

      <div className="customer-section customer-section--compact customer-section--divided home-assurance-layout">
        <section id="home-faqs" aria-labelledby="home-faqs-heading" className="home-faq-panel">
          <Reveal>
            <div className="home-assurance-heading">
              <p className="home-assurance-eyebrow">Booking help</p>
              <h2 id="home-faqs-heading" className="customer-section-title">Before you book</h2>
              <p>Quick answers to the questions travellers ask most.</p>
            </div>
          </Reveal>

          <Reveal className="home-faq-list-wrap">
            <div className="home-faq-list">
              {HOME_FAQS.map(({ question, answer }, index) => {
                const isOpen = openHomeFaq === index;
                const answerId = `home-faq-answer-${index}`;

                return (
                  <div key={question} className={cn('home-faq-item', isOpen && 'is-open')}>
                    <button
                      type="button"
                      className="home-faq-trigger"
                      aria-expanded={isOpen}
                      aria-controls={answerId}
                      onClick={() => setOpenHomeFaq(isOpen ? -1 : index)}
                    >
                      <span>{question}</span>
                      <ChevronDown className="home-faq-chevron" aria-hidden="true" />
                    </button>

                    {isOpen && <p id={answerId} className="home-faq-answer">{answer}</p>}
                  </div>
                );
              })}
            </div>
          </Reveal>
        </section>

        <section aria-labelledby="why-heading" className="home-confidence-panel">
          <Reveal>
            <div className="home-assurance-heading home-assurance-heading--inverse">
              <p className="home-assurance-eyebrow">
                <ShieldCheck aria-hidden="true" />
                The Gokaasa promise
              </p>
              <h2 id="why-heading" className="customer-section-title">Book with peace of mind</h2>
              <p>Clear choices and dependable help at every step.</p>
            </div>
          </Reveal>

          <div className="home-confidence-grid">
            {WHY_GOKAASA.map(({ icon: Icon, title }, index) => (
              <Reveal key={title} delay={index * 60}>
                <div className="home-confidence-item">
                  <div className="home-confidence-icon">
                    <Icon aria-hidden="true" />
                  </div>
                  <h3>{title}</h3>
                </div>
              </Reveal>
            ))}
          </div>
        </section>
      </div>

    </div>
  );
}
