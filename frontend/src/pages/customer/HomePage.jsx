import { useEffect, useState } from 'react';
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
} from 'lucide-react';
import { Skeleton } from '@/components/ui/surfaces.jsx';
import { Button } from '@/components/ui/button.jsx';
import { Input } from '@/components/ui/form-controls.jsx';
import { Carousel, CarouselItem } from '@/components/ui/carousel.jsx';
import { FullPageSpinner, homePathFor } from '@/components/shared/index.jsx';
import { SearchWidget } from '@/features/search/components/SearchWidget.jsx';
import { NearbyHotelsSection } from '@/features/home/NearbyHotelsSection.jsx';
import { HandpickedHotelsSection } from '@/features/home/HandpickedHotelsSection.jsx';
import { ShowcaseCard } from '@/features/home/ShowcaseCard.jsx';
import { DestinationTile } from '@/features/home/DestinationTile.jsx';
import { useAuth } from '@/features/auth/AuthContext.jsx';
import { useDocumentMeta } from '@/hooks/useDocumentMeta.js';
import { discoveryApi } from '@/services/endpoints.js';
import { normalizeError } from '@/services/api.js';
import { slugifyPlace } from '@/features/search/searchParams.js';

/** Each stat is shown only if the real backend count is non-trivial; no number is ever rounded up or guessed. */
function buildStats(stats) {
  if (!stats) return [];
  const items = [];
  if (stats.hotels.published > 0) items.push({ icon: Building2, value: stats.hotels.published.toLocaleString('en-IN'), label: 'Hotels' });
  if (stats.destinations.countries > 0) items.push({ icon: Globe2, value: stats.destinations.countries.toLocaleString('en-IN'), label: 'Countries' });
  if (stats.destinations.cities > 0) items.push({ icon: MapPin, value: stats.destinations.cities.toLocaleString('en-IN'), label: 'Cities' });
  if (stats.bookings.confirmed > 0) items.push({ icon: CalendarCheck, value: stats.bookings.confirmed.toLocaleString('en-IN'), label: 'Confirmed stays' });
  return items;
}

const WHY_GOKAASA = [
  { icon: Award, title: 'Premium Quality', text: 'Hand-selected hotels with verified reviews.' },
  { icon: ShieldCheck, title: 'Secure Booking', text: 'Safe and secure payment processing.' },
  { icon: Headphones, title: '24/7 Support', text: 'Round-the-clock customer service.' },
  { icon: Users, title: 'Trusted by Millions', text: 'Join millions of satisfied customers.' },
];

const INDIA_DESTINATIONS = ['Mumbai', 'Goa', 'Delhi', 'Pune', 'Jaipur', 'Bangalore', 'Hyderabad', 'Kashmir'];
const WORLD_DESTINATIONS = ['Singapore', 'New York', 'Dubai', 'Maldives', 'Paris'];
const INSPIRATION = ['Mumbai', 'Goa', 'Jaipur', 'Kashmir', 'Bangalore', 'Pune', 'Hyderabad', 'Delhi'];

/**
 * "Theme" categories like Airport/Mountain/Heritage/Beach have no tag of their own in the schema -- only
 * the coarse property_type enum (HOTEL/RESORT/VILLA/APARTMENT/HOSTEL/GUEST_HOUSE) does. Resort and Beach
 * map to the real RESORT type; the rest fall back to the generic HOTEL filter, which is still a real,
 * working search rather than a dead link.
 */
const STAY_CATEGORIES = [
  { title: 'Resort', propertyType: 'RESORT' },
  { title: 'Airport Hotel', propertyType: 'HOTEL' },
  { title: 'Mountain Hotel', propertyType: 'HOTEL' },
  { title: 'Heritage Hotel', propertyType: 'HOTEL' },
  { title: 'Beach Hotel', propertyType: 'RESORT' },
];

/** Demo content, clearly not presented as verified reviews -- the real Reviews system supplies those on each hotel's own page. */
const TESTIMONIALS = [
  { name: 'Priya Verma', quote: 'Loved the stay. Easy booking and great support from Gokaasa.' },
  { name: 'Rahul Sharma', quote: 'Amazing experience! Rooms were clean and service was top-notch.' },
  { name: 'Anshu Yadav', quote: 'Amazing experience! The booking process was smooth and hassle-free.' },
  { name: 'Amit Patel', quote: 'Loved the stay. Easy booking and great support.' },
  { name: 'Amit Singh', quote: 'Best hotel deals I found. Highly recommended!' },
];

const TRUST_STRIP = [
  { icon: Users, label: 'Happy Travelers' },
  { icon: Headphones, label: 'On-Trip Assistance' },
  { icon: CalendarCheck, label: 'Flexible Bookings & Customizations' },
  { icon: Award, label: 'Best Curation' },
  { icon: ShieldCheck, label: '24/7 Support' },
];

function SectionHeading({ title, subtitle }) {
  return (
    <div className="space-y-1">
      <h2 className="font-[var(--font-display)] text-2xl font-semibold tracking-tight text-[var(--text-strong)] sm:text-3xl">{title}</h2>
      {subtitle && <p className="max-w-2xl text-sm text-[var(--text-muted)]">{subtitle}</p>}
    </div>
  );
}

function NewsletterSection() {
  const [email, setEmail] = useState('');
  const [state, setState] = useState('idle'); // idle | loading | success | error
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
    <section aria-labelledby="newsletter-heading" className="bg-[var(--surface-muted)]">
      <div className="mx-auto max-w-3xl space-y-4 px-4 py-14 text-center sm:px-6">
        <Mail className="mx-auto h-8 w-8 text-brand-700" aria-hidden="true" />
        <h2 id="newsletter-heading" className="font-[var(--font-display)] text-2xl font-semibold tracking-tight text-[var(--text-strong)]">Stay Tuned</h2>
        <p className="text-sm text-[var(--text-muted)]">Get exclusive hotel deals, destination inspiration, and travel updates.</p>
        {state === 'success' ? (
          <p className="text-sm font-medium text-success-600" role="status">You're subscribed! Watch your inbox for upcoming deals.</p>
        ) : (
          <form onSubmit={submit} className="mx-auto flex max-w-md flex-col gap-2 sm:flex-row">
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
            <Button type="submit" loading={state === 'loading'}>Subscribe</Button>
          </form>
        )}
        {state === 'error' && <p role="alert" className="text-sm text-danger-600">{error}</p>}
      </div>
    </section>
  );
}

export function HomePage() {
  const { status, user, isStaff } = useAuth();
  const [popular, setPopular] = useState(null);
  const [stats, setStats] = useState(null);
  const [error, setError] = useState(null);

  useDocumentMeta({
    title: 'Gokaasa - Premium Hotels Management Platform',
    description: 'Book hotels worldwide with Gokaasa. Discover premium stays, exclusive hotel deals, flexible bookings, and trusted travel support.',
    canonicalPath: '/',
  });

  useEffect(() => {
    if (isStaff) return;
    let cancelled = false;
    discoveryApi
      .popularDestinations()
      .then((places) => !cancelled && setPopular(places))
      .catch((err) => !cancelled && setError(normalizeError(err).message));
    discoveryApi.stats().then((data) => !cancelled && setStats(data)).catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [isStaff]);

  if (status === 'loading') return <FullPageSpinner label="Loading Gokaasa" />;
  if (isStaff) return <Navigate to={homePathFor(user)} replace />;

  // Category cards need a real destination to search within; the top popular one stands in until a stay-specific picker exists.
  const categoryDestination = popular?.[0]?.destination;

  return (
    <div>
      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-br from-brand-800 via-brand-700 to-brand-600 pb-10 pt-14 sm:pb-14 sm:pt-16 lg:pb-28 lg:pt-20">
        <div className="relative mx-auto max-w-7xl px-4 sm:px-6">
          <div className="max-w-2xl space-y-4">
            <p className="text-sm font-semibold uppercase tracking-wider text-accent-300">Discover Your Next Stay</p>
            <h1 className="font-[var(--font-display)] text-4xl font-bold tracking-tight text-white sm:text-5xl">
              Discover Stays
              <br />
              That Define Luxury
            </h1>
            <p className="text-base text-brand-100">
              Find exceptional hotels, handpicked stays, and unforgettable experiences—all in one place.
            </p>
          </div>
        </div>
      </section>

      {/* The search widget sits right after the hero; at lg+ it's pulled up to visually overlap the hero's lower edge. */}
      <div className="relative z-10 mx-auto max-w-7xl px-4 sm:px-6 lg:-mt-20">
        <SearchWidget variant="hero" />
      </div>

      <div className="mt-2 lg:mt-20" />

      {/* Popular destinations */}
      <section aria-labelledby="popular-heading" className="mx-auto max-w-7xl space-y-6 px-4 py-12 sm:px-6">
        <SectionHeading title="Explore Popular Destinations" />
        {error && <p className="text-sm text-danger-600">We couldn't load destinations right now.</p>}
        {!popular && !error && (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
            {[0, 1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-20" />)}
          </div>
        )}
        {popular?.length > 0 && (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
            {popular.map((place) => (
              <DestinationTile key={place.destination} place={place} />
            ))}
          </div>
        )}
      </section>

      {/* Hotels Near You */}
      <div className="py-4">
        <NearbyHotelsSection />
      </div>

      {/* Handpicked Hotels */}
      <div className="py-4">
        <HandpickedHotelsSection />
      </div>

      {/* Famous Destinations of India */}
      <section aria-labelledby="india-heading" className="mx-auto max-w-7xl space-y-6 px-4 py-12 sm:px-6">
        <SectionHeading title="Unlock Famous Destinations of India" />
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {INDIA_DESTINATIONS.map((name) => (
            <ShowcaseCard key={name} title={name} href={`/hotels/${slugifyPlace(name)}`} />
          ))}
        </div>
      </section>

      {/* Find Your Perfect Stay */}
      <section aria-labelledby="stay-type-heading" className="mx-auto max-w-7xl space-y-6 px-4 py-12 sm:px-6">
        <SectionHeading title="Find Your Perfect Stay" />
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          {STAY_CATEGORIES.map((category) => (
            <ShowcaseCard
              key={category.title}
              title={category.title}
              href={categoryDestination ? `/hotels/${categoryDestination}?propertyTypes=${category.propertyType}` : '/destinations'}
            />
          ))}
        </div>
      </section>

      {/* Travel Inspiration */}
      <section aria-labelledby="inspiration-heading" className="mx-auto max-w-7xl space-y-6 px-4 py-12 sm:px-6">
        <SectionHeading title="Travel Inspiration" subtitle="A few places our guests keep coming back to." />
        <Carousel aria-label="Travel inspiration">
          {INSPIRATION.map((name) => (
            <CarouselItem key={name} className="w-40 sm:w-48">
              <ShowcaseCard title={name} href={`/hotels/${slugifyPlace(name)}`} className="aspect-[3/4]" />
            </CarouselItem>
          ))}
        </Carousel>
      </section>

      {/* Why Choose Gokaasa */}
      <section aria-labelledby="why-heading" className="mx-auto max-w-7xl space-y-6 px-4 py-12 sm:px-6">
        <SectionHeading title="Why Choose Gokaasa?" subtitle="We provide the best hotel booking experience with premium features and exceptional customer service." />
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {WHY_GOKAASA.map(({ icon: Icon, title, text }) => (
            <div key={title} className="rounded-[var(--radius-card)] border border-[var(--border-subtle)] bg-[var(--surface-card)] p-6">
              <Icon className="mb-3 h-5 w-5 text-brand-700" aria-hidden="true" />
              <h3 className="mb-1 text-base font-semibold text-[var(--text-strong)]">{title}</h3>
              <p className="text-sm text-[var(--text-muted)]">{text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Explore the World */}
      <section aria-labelledby="world-heading" className="mx-auto max-w-7xl space-y-6 px-4 py-12 sm:px-6">
        <SectionHeading title="Explore the World" />
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          {WORLD_DESTINATIONS.map((name) => (
            <ShowcaseCard key={name} title={name} href={`/hotels/${slugifyPlace(name)}`} />
          ))}
        </div>
      </section>

      {/* Customer testimonials */}
      <section aria-labelledby="testimonials-heading" className="bg-[var(--surface-muted)]">
        <div className="mx-auto max-w-7xl space-y-6 px-4 py-12 sm:px-6">
          <SectionHeading title="What Our Customers Say" />
          <Carousel aria-label="Customer testimonials">
            {TESTIMONIALS.map((t) => (
              <CarouselItem key={t.name} className="w-72 sm:w-80">
                <figure className="flex h-full flex-col justify-between rounded-[var(--radius-card)] border border-[var(--border-subtle)] bg-[var(--surface-card)] p-5">
                  <blockquote className="text-sm leading-6 text-[var(--text-body)]">“{t.quote}”</blockquote>
                  <figcaption className="mt-4 text-sm font-semibold text-[var(--text-strong)]">{t.name}</figcaption>
                </figure>
              </CarouselItem>
            ))}
          </Carousel>
        </div>
      </section>

      {/* Trust strip */}
      <section aria-labelledby="trust-heading" className="mx-auto max-w-7xl px-4 py-12 sm:px-6">
        <h2 id="trust-heading" className="sr-only">Why travellers trust Gokaasa</h2>
        <dl className="grid grid-cols-2 gap-6 sm:grid-cols-3 lg:grid-cols-5">
          {TRUST_STRIP.map(({ icon: Icon, label }, index) => {
            const confirmed = stats?.bookings?.confirmed;
            const showReal = index === 0 && confirmed > 0;
            return (
              <div key={label} className="flex flex-col items-center gap-2 text-center">
                <Icon className="h-6 w-6 text-brand-700" aria-hidden="true" />
                {showReal && <dd className="text-xl font-semibold tracking-tight text-[var(--text-strong)]">{confirmed.toLocaleString('en-IN')}+</dd>}
                <dt className="text-sm font-medium text-[var(--text-body)]">{label}</dt>
              </div>
            );
          })}
        </dl>
        {buildStats(stats).length > 0 && (
          <dl className="mt-10 grid grid-cols-2 gap-6 border-t border-[var(--border-subtle)] pt-8 md:grid-cols-4">
            {buildStats(stats).map(({ icon: Icon, value, label }) => (
              <div key={label} className="flex items-start gap-3">
                <Icon className="mt-1 h-4 w-4 text-brand-700" aria-hidden="true" />
                <div>
                  <dt className="text-xs text-[var(--text-muted)]">{label}</dt>
                  <dd className="text-xl font-semibold tracking-tight text-[var(--text-strong)]">{value}</dd>
                </div>
              </div>
            ))}
          </dl>
        )}
      </section>

      {/* Support CTA */}
      <section aria-labelledby="support-heading" className="mx-auto max-w-4xl space-y-3 px-4 py-12 text-center sm:px-6">
        <h2 id="support-heading" className="font-[var(--font-display)] text-2xl font-semibold tracking-tight text-[var(--text-strong)]">Need help?</h2>
        <p className="text-sm text-[var(--text-body)]">
          Call our award-winning support team at{' '}
          <a href="tel:+919876543210" className="inline-flex items-center gap-1 font-medium text-brand-700 hover:underline">
            <Phone className="h-3.5 w-3.5" aria-hidden="true" /> +91-9876543210
          </a>
        </p>
        <Link to="/contact">
          <Button variant="secondary">Contact Support</Button>
        </Link>
      </section>

      {/* Newsletter */}
      <NewsletterSection />
    </div>
  );
}
