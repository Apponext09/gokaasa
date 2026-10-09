import { useEffect, useRef, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import {
  Award,
  Building2,
  CalendarCheck,
  Globe2,
  Headphones,
  Mail,
  MapPin,
  Phone,
  ShieldCheck,
  Users,
  ArrowRight,
  Star,
  ChevronRight,
} from 'lucide-react';

import { Skeleton } from '@/components/ui/surfaces.jsx';
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

import { SearchWidget } from '@/features/search/components/SearchWidget.jsx';
import { NearbyHotelsSection } from '@/features/home/NearbyHotelsSection.jsx';
import { HandpickedHotelsSection } from '@/features/home/HandpickedHotelsSection.jsx';
import { OfferCard } from '@/features/offers/OfferCard.jsx';

import { useAuth } from '@/features/auth/AuthContext.jsx';
import { useDocumentMeta } from '@/hooks/useDocumentMeta.js';

import {
  discoveryApi,
  offerApi,
} from '@/services/endpoints.js';

import { normalizeError } from '@/services/api.js';
import { slugifyPlace } from '@/features/search/searchParams.js';

/* -------------------------------------------------------------------------- */
/*                              HERO IMAGES                                   */
/* -------------------------------------------------------------------------- */

const HERO_IMAGES = [
  {
    src: 'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=2400&q=90',
    alt: 'Luxury hotel room',
    quote:
      '“The journey is always better when you have a beautiful place to stay.”',
  },
  {
    src: 'https://images.unsplash.com/photo-1564501049412-61c2a3083791?auto=format&fit=crop&w=2400&q=90',
    alt: 'Luxury hotel interior',
    quote:
      '“Collect moments, not things — and make every stay memorable.”',
  },
  {
    src: 'https://images.unsplash.com/photo-1540541338287-41700207dee6?auto=format&fit=crop&w=2400&q=90',
    alt: 'Luxury resort with swimming pool',
    quote:
      '“Escape the ordinary and discover a stay worth remembering.”',
  },
  {
    src: 'https://images.unsplash.com/photo-1571896349842-33c89424de2d?auto=format&fit=crop&w=2400&q=90',
    alt: 'Premium hotel pool',
    quote:
      '“Wherever you go, make your stay part of the story.”',
  },
  {
    src: 'https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=2400&q=90',
    alt: 'Luxury resort',
    quote:
      '“Your next unforgettable escape begins with the perfect stay.”',
  },
];

/* -------------------------------------------------------------------------- */
/*                          DESTINATION IMAGES                                */
/* -------------------------------------------------------------------------- */

const DESTINATION_IMAGES = {
  Mumbai:
    'https://images.unsplash.com/photo-1570168007204-dfb528c6958f?auto=format&fit=crop&w=1400&q=85',

  Goa:
    'https://images.unsplash.com/photo-1512343879784-a960bf40e7f2?auto=format&fit=crop&w=1400&q=85',

  Delhi:
    'https://images.unsplash.com/photo-1587474260584-136574528ed5?auto=format&fit=crop&w=1400&q=85',

  Pune:
    'https://images.unsplash.com/photo-1595658658481-d53d3f999875?auto=format&fit=crop&w=1400&q=85',

  Jaipur:
    'https://images.unsplash.com/photo-1477587458883-47145ed94245?auto=format&fit=crop&w=1400&q=85',

  Bangalore:
    'https://images.unsplash.com/photo-1596176530529-78163a4f7af2?auto=format&fit=crop&w=1400&q=85',

  Hyderabad:
    'https://images.unsplash.com/photo-1572449043416-55f4685c9bb7?auto=format&fit=crop&w=1400&q=85',

  Kashmir:
    'https://images.unsplash.com/photo-1605649487212-47bdab064df7?auto=format&fit=crop&w=1400&q=85',
};

const WORLD_DESTINATION_IMAGES = {
  Singapore:
    'https://images.unsplash.com/photo-1525625293386-3f8f99389edd?auto=format&fit=crop&w=1400&q=85',

  'New York':
    'https://images.unsplash.com/photo-1485871981521-5b1fd3805eee?auto=format&fit=crop&w=1400&q=85',

  Dubai:
    'https://images.unsplash.com/photo-1512453979798-5ea266f8880c?auto=format&fit=crop&w=1400&q=85',

  Maldives:
    'https://images.unsplash.com/photo-1514282401047-d79a71a590e8?auto=format&fit=crop&w=1400&q=85',

  Paris:
    'https://images.unsplash.com/photo-1502602898657-3e91760cbb34?auto=format&fit=crop&w=1400&q=85',
};

const STAY_CATEGORY_IMAGES = {
  Resort:
    'https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=1400&q=85',

  'Airport Hotel':
    'https://images.unsplash.com/photo-1566665797739-1674de7a421a?auto=format&fit=crop&w=1400&q=85',

  'Mountain Hotel':
    'https://images.unsplash.com/photo-1510798831971-661eb04b3739?auto=format&fit=crop&w=1400&q=85',

  'Heritage Hotel':
    'https://images.unsplash.com/photo-1548013146-72479768bada?auto=format&fit=crop&w=1400&q=85',

  'Beach Hotel':
    'https://images.unsplash.com/photo-1540541338287-41700207dee6?auto=format&fit=crop&w=1400&q=85',
};

/* -------------------------------------------------------------------------- */
/*                                  DATA                                      */
/* -------------------------------------------------------------------------- */

const WHY_GOKAASA = [
  {
    icon: Award,
    title: 'Premium Quality',
    text: 'Hand-selected hotels with verified reviews.',
  },
  {
    icon: ShieldCheck,
    title: 'Secure Booking',
    text: 'Safe and secure payment processing.',
  },
  {
    icon: Headphones,
    title: '24/7 Support',
    text: 'Round-the-clock customer service.',
  },
  {
    icon: Users,
    title: 'Trusted by Millions',
    text: 'Join millions of satisfied customers.',
  },
];

const INDIA_DESTINATIONS = [
  'Mumbai',
  'Goa',
  'Delhi',
  'Pune',
  'Jaipur',
  'Bangalore',
  'Hyderabad',
  'Kashmir',
];

const WORLD_DESTINATIONS = [
  'Singapore',
  'New York',
  'Dubai',
  'Maldives',
  'Paris',
];

const INSPIRATION = [
  'Mumbai',
  'Goa',
  'Jaipur',
  'Kashmir',
  'Bangalore',
  'Pune',
  'Hyderabad',
  'Delhi',
];

const STAY_CATEGORIES = [
  {
    title: 'Resort',
    propertyType: 'RESORT',
  },
  {
    title: 'Airport Hotel',
    propertyType: 'HOTEL',
  },
  {
    title: 'Mountain Hotel',
    propertyType: 'HOTEL',
  },
  {
    title: 'Heritage Hotel',
    propertyType: 'HOTEL',
  },
  {
    title: 'Beach Hotel',
    propertyType: 'RESORT',
  },
];

const TESTIMONIALS = [
  {
    name: 'Priya Verma',
    quote:
      'Loved the stay. Easy booking and great support from Gokaasa.',
    rating: 5,
  },
  {
    name: 'Rahul Sharma',
    quote:
      'Amazing experience! Rooms were clean and service was top-notch.',
    rating: 5,
  },
  {
    name: 'Anshu Yadav',
    quote:
      'The booking process was smooth, simple and completely hassle-free.',
    rating: 5,
  },
  {
    name: 'Amit Patel',
    quote:
      'Loved the stay. Easy booking and great support.',
    rating: 5,
  },
  {
    name: 'Amit Singh',
    quote:
      'Best hotel deals I found. Highly recommended!',
    rating: 5,
  },
];

const TRUST_STRIP = [
  {
    icon: Users,
    label: 'Happy Travelers',
  },
  {
    icon: Headphones,
    label: 'On-Trip Assistance',
  },
  {
    icon: CalendarCheck,
    label: 'Flexible Bookings',
  },
  {
    icon: Award,
    label: 'Best Curation',
  },
  {
    icon: ShieldCheck,
    label: '24/7 Support',
  },
];

/* -------------------------------------------------------------------------- */
/*                                HELPERS                                     */
/* -------------------------------------------------------------------------- */

function buildStats(stats) {
  if (!stats) return [];

  const items = [];

  if (stats.hotels?.published > 0) {
    items.push({
      icon: Building2,
      value: stats.hotels.published.toLocaleString('en-IN'),
      label: 'Hotels',
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
      label: 'Cities',
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

/* -------------------------------------------------------------------------- */
/*                            SECTION HEADING                                 */
/* -------------------------------------------------------------------------- */

function SectionHeading({ title, subtitle }) {
  return (
    <div className="space-y-2">
      <h2 className="font-[var(--font-display)] text-2xl font-semibold tracking-tight text-[var(--text-strong)] sm:text-3xl">
        {title}
      </h2>

      {subtitle && (
        <p className="max-w-2xl text-sm leading-6 text-[var(--text-muted)]">
          {subtitle}
        </p>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                         SCROLL REVEAL COMPONENT                            */
/* -------------------------------------------------------------------------- */

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

    if (!element) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.unobserve(element);
        }
      },
      {
        threshold: 0.12,
        rootMargin: '0px 0px -50px 0px',
      },
    );

    observer.observe(element);

    return () => {
      observer.disconnect();
    };
  }, []);

  const hiddenTransform = {
    up: 'translate-y-10',
    down: '-translate-y-10',
    left: 'translate-x-10',
    right: '-translate-x-10',
    zoom: 'scale-95',
  };

  return (
    <div
      ref={ref}
      style={{
        transitionDelay: `${delay}ms`,
      }}
      className={`
        transform-gpu
        transition-all
        duration-700
        ease-out
        ${
          visible
            ? 'translate-x-0 translate-y-0 scale-100 opacity-100'
            : `${hiddenTransform[direction]} opacity-0`
        }
        ${className}
      `}
    >
      {children}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                         PREMIUM IMAGE CARD                                 */
/* -------------------------------------------------------------------------- */

function PremiumImageCard({
  title,
  image,
  href,
  className = '',
  aspect = 'aspect-[4/3]',
  subtitle = 'Explore hotels',
}) {
  return (
    <Link
      to={href}
      className={`group relative block overflow-hidden rounded-2xl border border-[var(--border-subtle)] bg-slate-900 shadow-sm transition-all duration-500 hover:-translate-y-1 hover:shadow-2xl ${className}`}
    >
      <div className={`relative overflow-hidden ${aspect}`}>
        <img
          src={image}
          alt={`${title} hotels`}
          loading="lazy"
          decoding="async"
          className="h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-110"
        />

        <div className="absolute inset-0 bg-gradient-to-t from-slate-950/75 via-slate-950/10 to-transparent" />

        <div className="absolute inset-x-0 bottom-0 p-4 sm:p-5">
          <div className="flex items-end justify-between gap-3">
            <div>
              <h3 className="font-[var(--font-display)] text-lg font-semibold tracking-tight text-white sm:text-xl">
                {title}
              </h3>

              <p className="mt-1 flex items-center gap-1 text-xs font-medium text-white/80">
                {subtitle}

                <ArrowRight
                  className="h-3.5 w-3.5 transition-transform duration-300 group-hover:translate-x-1"
                  aria-hidden="true"
                />
              </p>
            </div>

            <span className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur-md sm:flex">
              <ArrowRight
                className="h-4 w-4"
                aria-hidden="true"
              />
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}

/* -------------------------------------------------------------------------- */
/*                              NEWSLETTER                                    */
/* -------------------------------------------------------------------------- */

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
    <Reveal direction="up">
      <section
        aria-labelledby="newsletter-heading"
        className="relative overflow-hidden bg-sky-100"
      >
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute left-1/2 top-0 h-64 w-64 -translate-x-1/2 rounded-full bg-brand-700/5 blur-3xl" />
        </div>

        <div className="relative mx-auto max-w-3xl space-y-4 px-4 py-16 text-center sm:px-6">

          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-brand-700/10">
            <Mail
              className="h-6 w-6 text-brand-700"
              aria-hidden="true"
            />
          </div>

          <h2
            id="newsletter-heading"
            className="font-[var(--font-display)] text-2xl font-semibold tracking-tight text-[var(--text-strong)] sm:text-3xl"
          >
            Stay Tuned
          </h2>

          <p className="text-sm leading-6 text-[var(--text-muted)]">
            Get exclusive hotel deals, destination inspiration,
            and travel updates.
          </p>

          {state === 'success' ? (
            <p
              className="text-sm font-medium text-success-600"
              role="status"
            >
              You're subscribed! Watch your inbox for upcoming deals.
            </p>
          ) : (
            <form
              onSubmit={submit}
              className="mx-auto flex max-w-md flex-col gap-2 sm:flex-row"
            >
              <Input
                type="email"
                required
                aria-label="Email address"
                placeholder="Enter email address..."
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={state === 'loading'}
                className="flex-1"
              />

              <Button
                type="submit"
                loading={state === 'loading'}
              >
                Subscribe
              </Button>
            </form>
          )}

          {state === 'error' && (
            <p
              role="alert"
              className="text-sm text-danger-600"
            >
              {error}
            </p>
          )}
        </div>
      </section>
    </Reveal>
  );
}

/* -------------------------------------------------------------------------- */
/*                               HOME PAGE                                    */
/* -------------------------------------------------------------------------- */

export function HomePage() {
  const {
    status,
    user,
    isStaff,
  } = useAuth();

  const [popular, setPopular] = useState(null);
  const [stats, setStats] = useState(null);
  const [offers, setOffers] = useState(null);
  const [error, setError] = useState(null);

  const [heroIndex, setHeroIndex] = useState(0);

  useDocumentMeta({
    title: 'Gokaasa - Premium Hotels Management Platform',
    description:
      'Book hotels worldwide with Gokaasa. Discover premium stays, exclusive hotel deals, flexible bookings, and trusted travel support.',
    canonicalPath: '/',
  });

  /* ---------------------------------------------------------------------- */
  /* HERO IMAGE + QUOTE SLIDESHOW                                          */
  /* ---------------------------------------------------------------------- */

  useEffect(() => {
    const interval = window.setInterval(() => {
      setHeroIndex((current) => {
        return (current + 1) % HERO_IMAGES.length;
      });
    }, 5000);

    return () => {
      window.clearInterval(interval);
    };
  }, []);

  /* ---------------------------------------------------------------------- */
  /* LOAD DISCOVERY DATA                                                    */
  /* ---------------------------------------------------------------------- */

  useEffect(() => {
    if (isStaff) return;

    let cancelled = false;

    discoveryApi
      .popularDestinations()
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
      .catch(() => {});

    offerApi
      .list()
      .then((items) => {
        if (!cancelled) {
          setOffers(items.slice(0, 6));
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [isStaff]);

  if (status === 'loading') {
    return (
      <FullPageSpinner label="Loading Gokaasa" />
    );
  }

  if (isStaff) {
    return (
      <Navigate
        to={homePathFor(user)}
        replace
      />
    );
  }

  const categoryDestination =
    popular?.[0]?.destination;

  const realConfirmedBookings =
    stats?.bookings?.confirmed || 0;

  return (
    <div className="min-h-screen overflow-hidden bg-sky-100">

      {/* ================================================================== */}
      {/* HERO                                                               */}
      {/* ================================================================== */}

      <section className="relative isolate min-h-[620px] overflow-hidden bg-slate-950 sm:min-h-[660px] lg:min-h-[700px]">

        {/* -------------------------------------------------------------- */}
        {/* Background slideshow                                           */}
        {/* -------------------------------------------------------------- */}

        <div className="absolute inset-0 -z-30">

          {HERO_IMAGES.map((image, index) => (
            <img
              key={image.src}
              src={image.src}
              alt=""
              aria-hidden="true"
              fetchPriority={
                index === 0 ? 'high' : 'low'
              }
              decoding="async"
              className={`absolute inset-0 h-full w-full object-cover transition-all duration-[1600ms] ease-in-out ${
                index === heroIndex
                  ? 'scale-105 opacity-100'
                  : 'scale-100 opacity-0'
              }`}
            />
          ))}

        </div>

        {/* -------------------------------------------------------------- */}
        {/* Premium overlays                                                */}
        {/* -------------------------------------------------------------- */}

        <div className="absolute inset-0 -z-20 bg-slate-950/10" />

        <div className="absolute inset-0 -z-20 bg-gradient-to-b from-slate-950/20 via-transparent to-slate-950/45" />

        <div className="absolute inset-0 -z-20 bg-gradient-to-r from-slate-950/20 via-transparent to-slate-950/10" />

        {/* -------------------------------------------------------------- */}
        {/* Search area                                                     */}
        {/* -------------------------------------------------------------- */}

        <div className="relative mx-auto flex min-h-[620px] max-w-7xl items-center justify-center px-4 py-24 sm:min-h-[660px] sm:px-6 lg:min-h-[700px] lg:px-8">

          <div className="w-full max-w-5xl">

            {/* -------------------------------------------------------- */}
            {/* HERO QUOTE                                                */}
            {/* -------------------------------------------------------- */}

            <div
              key={heroIndex}
              className="mb-6 text-center animate-[heroQuote_800ms_ease-out]"
            >
              <p className="mx-auto max-w-3xl font-[var(--font-display)] text-xl font-medium italic leading-relaxed text-white drop-shadow-[0_3px_10px_rgba(0,0,0,0.65)] sm:text-2xl lg:text-3xl">
                {HERO_IMAGES[heroIndex].quote}
              </p>
            </div>

            {/* -------------------------------------------------------- */}
            {/* SEARCH CARD                                               */}
            {/* -------------------------------------------------------- */}

            <div className="animate-[heroSearch_900ms_ease-out_200ms_both] rounded-[24px] border border-white/70 bg-white/95 p-2 shadow-[0_30px_100px_rgba(15,23,42,0.38)] backdrop-blur-xl sm:rounded-[28px] sm:p-3">

              <div className="overflow-hidden rounded-[18px] bg-white shadow-sm sm:rounded-[22px]">

                <SearchWidget variant="hero" />

              </div>

            </div>

          </div>

          {/* ---------------------------------------------------------- */}
          {/* HERO DOTS                                                  */}
          {/* ---------------------------------------------------------- */}

          <div className="absolute bottom-8 left-1/2 z-30 -translate-x-1/2 sm:bottom-10">

            <div className="flex items-center gap-2 rounded-full border border-white/30 bg-slate-950/30 px-3 py-2 shadow-lg backdrop-blur-md">

              {HERO_IMAGES.map((image, index) => (
                <button
                  key={image.src}
                  type="button"
                  aria-label={`Show hero image ${index + 1}`}
                  aria-current={
                    index === heroIndex
                      ? 'true'
                      : undefined
                  }
                  onClick={() => setHeroIndex(index)}
                  className={`h-1.5 rounded-full transition-all duration-500 ${
                    index === heroIndex
                      ? 'w-8 bg-white shadow-sm'
                      : 'w-2 bg-white/50 hover:bg-white/80'
                  }`}
                />
              ))}

            </div>

          </div>

        </div>
      </section>

  

      {/* ================================================================== */}
      {/* EXCLUSIVE OFFERS                                                   */}
      {/* ================================================================== */}

      {offers && offers.length > 0 && (
        <section
          aria-labelledby="offers-heading"
          className="mx-auto max-w-7xl space-y-6 px-4 py-12 sm:px-6"
        >

          <Reveal>
            <div className="flex flex-wrap items-end justify-between gap-3">

              <SectionHeading
                title="Exclusive Offers"
                subtitle="Save more on stays you'll love."
              />

              <Link
                to="/offers"
                className="inline-flex items-center gap-1 text-sm font-semibold text-brand-700 hover:underline"
              >
                View all offers

                <ChevronRight
                  className="h-4 w-4"
                  aria-hidden="true"
                />
              </Link>

            </div>
          </Reveal>

          <Reveal direction="left">

            <div className="flex gap-4 overflow-x-auto pb-2">

              {offers.map((offer, index) => (
                <div
                  key={offer.id}
                  className="animate-[cardReveal_700ms_ease-out_both]"
                  style={{
                    animationDelay: `${index * 100}ms`,
                  }}
                >
                  <OfferCard
                    offer={offer}
                    compact
                  />
                </div>
              ))}

            </div>

          </Reveal>

        </section>
      )}

      {/* ================================================================== */}
      {/* NEARBY HOTELS                                                      */}
      {/* ================================================================== */}

      <Reveal direction="up">
        <div className="py-4">
          <NearbyHotelsSection />
        </div>
      </Reveal>

      {/* ================================================================== */}
      {/* HANDPICKED HOTELS                                                  */}
      {/* ================================================================== */}

      <Reveal direction="up">
        <div className="py-4">
          <HandpickedHotelsSection />
        </div>
      </Reveal>

      {/* ================================================================== */}
      {/* INDIA DESTINATIONS                                                 */}
      {/* ================================================================== */}

      <section
        aria-labelledby="india-heading"
        className="mx-auto max-w-7xl space-y-7 px-4 py-14 sm:px-6"
      >

        <Reveal>
          <SectionHeading
            title="Unlock Famous Destinations of India"
            subtitle="Explore exceptional stays across India's most loved destinations."
          />
        </Reveal>

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">

          {INDIA_DESTINATIONS.map((name, index) => (
            <Reveal
              key={name}
              delay={index * 80}
              direction="zoom"
            >
              <PremiumImageCard
                title={name}
                image={DESTINATION_IMAGES[name]}
                href={`/hotels/${slugifyPlace(name)}`}
                aspect="aspect-[4/3]"
                className="h-full"
              />
            </Reveal>
          ))}

        </div>

      </section>

      {/* ================================================================== */}
      {/* PERFECT STAY                                                       */}
      {/* ================================================================== */}

      <section
        aria-labelledby="stay-type-heading"
        className="bg-sky-100"
      >

        <div className="mx-auto max-w-7xl space-y-7 px-4 py-14 sm:px-6">

          <Reveal>
            <SectionHeading
              title="Find Your Perfect Stay"
              subtitle="Choose a stay that matches the way you travel."
            />
          </Reveal>

          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">

            {STAY_CATEGORIES.map((category, index) => (
              <Reveal
                key={category.title}
                delay={index * 100}
                direction="zoom"
              >
                <PremiumImageCard
                  title={category.title}
                  image={STAY_CATEGORY_IMAGES[category.title]}
                  href={
                    categoryDestination
                      ? `/hotels/${categoryDestination}?propertyTypes=${category.propertyType}`
                      : '/destinations'
                  }
                  aspect="aspect-[4/5]"
                  className="h-full"
                />
              </Reveal>
            ))}

          </div>

        </div>

      </section>

      {/* ================================================================== */}
      {/* TRAVEL INSPIRATION                                                 */}
      {/* ================================================================== */}

      <section
        aria-labelledby="inspiration-heading"
        className="mx-auto max-w-7xl space-y-7 px-4 py-14 sm:px-6"
      >

        <Reveal>
          <SectionHeading
            title="Travel Inspiration"
            subtitle="A few places our guests keep coming back to."
          />
        </Reveal>

        <Reveal direction="left">

          <Carousel aria-label="Travel inspiration">

            {INSPIRATION.map((name) => (
              <CarouselItem
                key={name}
                className="w-52 sm:w-60 md:w-64"
              >
                <PremiumImageCard
                  title={name}
                  image={DESTINATION_IMAGES[name]}
                  href={`/hotels/${slugifyPlace(name)}`}
                  aspect="aspect-[3/4]"
                  className="h-full"
                />
              </CarouselItem>
            ))}

          </Carousel>

        </Reveal>

      </section>

      {/* ================================================================== */}
      {/* WHY GOKAASA                                                        */}
      {/* ================================================================== */}

      <section
        aria-labelledby="why-heading"
        className="mx-auto max-w-7xl space-y-7 px-4 py-14 sm:px-6"
      >

        <Reveal>
          <SectionHeading
            title="Why Choose Gokaasa?"
            subtitle="A premium hotel booking experience built around trust, convenience and exceptional stays."
          />
        </Reveal>

        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">

          {WHY_GOKAASA.map(
            ({ icon: Icon, title, text }, index) => (
              <Reveal
                key={title}
                delay={index * 100}
              >
                <div className="group h-full rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-card)] p-6 transition-all duration-300 hover:-translate-y-1 hover:shadow-xl">

                  <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-brand-700/10 transition-colors duration-300 group-hover:bg-brand-700">

                    <Icon
                      className="h-5 w-5 text-brand-700 group-hover:text-white"
                      aria-hidden="true"
                    />

                  </div>

                  <h3 className="mb-1 text-base font-semibold text-[var(--text-strong)]">
                    {title}
                  </h3>

                  <p className="text-sm leading-6 text-[var(--text-muted)]">
                    {text}
                  </p>

                </div>
              </Reveal>
            ),
          )}

        </div>

      </section>

      {/* ================================================================== */}
      {/* WORLD DESTINATIONS                                                 */}
      {/* ================================================================== */}

      <section
        aria-labelledby="world-heading"
        className="bg-sky-100"
      >

        <div className="mx-auto max-w-7xl space-y-7 px-4 py-14 sm:px-6">

          <Reveal>
            <SectionHeading
              title="Explore the World"
              subtitle="From tropical escapes to iconic cities, discover your next adventure."
            />
          </Reveal>

          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">

            {WORLD_DESTINATIONS.map((name, index) => (
              <Reveal
                key={name}
                delay={index * 100}
                direction="zoom"
              >
                <PremiumImageCard
                  title={name}
                  image={WORLD_DESTINATION_IMAGES[name]}
                  href={`/hotels/${slugifyPlace(name)}`}
                  aspect="aspect-[4/3]"
                  className="h-full"
                />
              </Reveal>
            ))}

          </div>

        </div>

      </section>

      {/* ================================================================== */}
      {/* TESTIMONIALS                                                       */}
      {/* ================================================================== */}

      <section
        aria-labelledby="testimonials-heading"
        className="bg-sky-100"
      >

        <div className="mx-auto max-w-7xl space-y-7 px-4 py-14 sm:px-6">

          <Reveal>
            <SectionHeading
              title="What Our Customers Say"
              subtitle="Great stays create great memories."
            />
          </Reveal>

          <Reveal direction="left">

            <Carousel aria-label="Customer testimonials">

              {TESTIMONIALS.map((testimonial) => (
                <CarouselItem
                  key={testimonial.name}
                  className="w-80 sm:w-96"
                >

                  <figure className="flex h-full min-h-[190px] flex-col justify-between rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-card)] p-6 shadow-sm transition-all duration-300 hover:shadow-lg">

                    <div>

                      <div className="mb-4 flex gap-1">

                        {Array.from({
                          length: testimonial.rating,
                        }).map((_, index) => (
                          <Star
                            key={index}
                            className="h-4 w-4 fill-current text-accent-500"
                            aria-hidden="true"
                          />
                        ))}

                      </div>

                      <blockquote className="text-sm leading-6 text-[var(--text-body)]">
                        “{testimonial.quote}”
                      </blockquote>

                    </div>

                    <figcaption className="mt-5 text-sm font-semibold text-[var(--text-strong)]">
                      {testimonial.name}
                    </figcaption>

                  </figure>

                </CarouselItem>
              ))}

            </Carousel>

          </Reveal>

        </div>

      </section>

      {/* ================================================================== */}
      {/* TRUST STRIP                                                        */}
      {/* ================================================================== */}

      <Reveal>

        <section
          aria-labelledby="trust-heading"
          className="mx-auto max-w-7xl px-4 py-14 sm:px-6"
        >

          <h2
            id="trust-heading"
            className="sr-only"
          >
            Why travellers trust Gokaasa
          </h2>

          <dl className="grid grid-cols-2 gap-7 sm:grid-cols-3 lg:grid-cols-5">

            {TRUST_STRIP.map(
              ({ icon: Icon, label }, index) => {

                const showReal =
                  index === 0 &&
                  realConfirmedBookings > 0;

                return (
                  <div
                    key={label}
                    className="flex flex-col items-center gap-2 text-center"
                  >

                    <div className="flex h-11 w-11 items-center justify-center rounded-full bg-brand-700/10">

                      <Icon
                        className="h-5 w-5 text-brand-700"
                        aria-hidden="true"
                      />

                    </div>

                    {showReal && (
                      <dd className="text-xl font-semibold tracking-tight text-[var(--text-strong)]">
                        {realConfirmedBookings.toLocaleString(
                          'en-IN',
                        )}
                        +
                      </dd>
                    )}

                    <dt className="text-sm font-medium text-[var(--text-body)]">
                      {label}
                    </dt>

                  </div>
                );
              },
            )}

          </dl>

          {buildStats(stats).length > 0 && (
            <dl className="mt-10 grid grid-cols-2 gap-6 border-t border-[var(--border-subtle)] pt-8 md:grid-cols-4">

              {buildStats(stats).map(
                ({ icon: Icon, value, label }) => (
                  <div
                    key={label}
                    className="flex items-start gap-3"
                  >

                    <Icon
                      className="mt-1 h-4 w-4 text-brand-700"
                      aria-hidden="true"
                    />

                    <div>

                      <dt className="text-xs text-[var(--text-muted)]">
                        {label}
                      </dt>

                      <dd className="text-xl font-semibold tracking-tight text-[var(--text-strong)]">
                        {value}
                      </dd>

                    </div>

                  </div>
                ),
              )}

            </dl>
          )}

        </section>

      </Reveal>

      {/* ================================================================== */}
      {/* SUPPORT CTA                                                        */}
      {/* ================================================================== */}

      <Reveal direction="up">

        <section
          aria-labelledby="support-heading"
          className="relative overflow-hidden bg-brand-950"
        >

          <div className="absolute inset-0 bg-gradient-to-br from-brand-900 via-brand-950 to-brand-900" />

          <div className="relative mx-auto max-w-4xl space-y-4 px-4 py-16 text-center sm:px-6">

            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-white/10">

              <Headphones
                className="h-6 w-6 text-accent-200"
                aria-hidden="true"
              />

            </div>

            <h2
              id="support-heading"
              className="font-[var(--font-display)] text-2xl font-semibold tracking-tight text-white sm:text-3xl"
            >
              Need help?
            </h2>

            <p className="text-sm leading-6 text-white/70">

              Call our award-winning support team at{' '}

              <a
                href="tel:+919876543210"
                className="inline-flex items-center gap-1 font-medium text-accent-200 hover:underline"
              >

                <Phone
                  className="h-3.5 w-3.5"
                  aria-hidden="true"
                />

                +91-9876543210

              </a>

            </p>

            <div className="pt-2">

              <Link to="/contact">

                <Button variant="secondary">
                  Contact Support

                  <ArrowRight
                    className="ml-2 h-4 w-4"
                  />
                </Button>

              </Link>

            </div>

          </div>

        </section>

      </Reveal>

      {/* ================================================================== */}
      {/* NEWSLETTER                                                         */}
      {/* ================================================================== */}

      <NewsletterSection />

    </div>
  );
}
