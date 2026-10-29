import { Link } from 'react-router-dom';
import { BadgeIndianRupee, CalendarCheck, Star, Waves, Wifi } from 'lucide-react';
import { useCatalog } from '@/features/catalogs/useCatalog.js';

const BASE_CHIPS = [
  { key: 'free-cancellation', label: 'Free Cancellation', icon: CalendarCheck, to: '/hotels?freeCancellation=true' },
  { key: 'top-rated', label: 'Top Rated', icon: Star, to: '/hotels?guestRating=4.5' },
  { key: 'budget', label: 'Under ₹3,000', icon: BadgeIndianRupee, to: '/hotels?maxPrice=3000' },
];

function findByName(items, pattern) {
  return items.find((item) => pattern.test(item.name ?? ''));
}

/**
 * Only ever links to filters the search page genuinely supports -- property type/amenity chips are
 * built from the real catalog codes (useCatalog), never a guessed string, and are simply omitted if the
 * catalog has no matching entry rather than linking to a filter that would silently do nothing.
 */
export function QuickFilterChips({ className = '' }) {
  const { items: propertyTypes } = useCatalog('property-types');
  const { items: amenities } = useCatalog('amenities');

  const hotels = findByName(propertyTypes, /^hotel$/i);
  const resorts = findByName(propertyTypes, /^resort$/i);
  const pool = findByName(amenities, /pool/i);
  const wifi = findByName(amenities, /wi[\s-]?fi/i);

  const chips = [
    ...BASE_CHIPS,
    hotels && { key: 'hotels', label: 'Hotels', icon: Star, to: `/hotels?propertyTypes=${hotels.code}` },
    resorts && { key: 'resorts', label: 'Resorts', icon: Star, to: `/hotels?propertyTypes=${resorts.code}` },
    pool && { key: 'pool', label: 'Pool', icon: Waves, to: `/hotels?amenities=${pool.code}` },
    wifi && { key: 'wifi', label: 'Wi-Fi', icon: Wifi, to: `/hotels?amenities=${wifi.code}` },
  ].filter(Boolean);

  if (chips.length === 0) return null;

  return (
    <div className={`customer-quick-filter-chips ${className}`} aria-label="Quick filters">
      {chips.map(({ key, label, icon: Icon, to }) => (
        <Link key={key} to={to} className="customer-quick-filter-chip">
          <Icon className="h-3.5 w-3.5 text-accent-500" aria-hidden="true" />
          {label}
        </Link>
      ))}
    </div>
  );
}
