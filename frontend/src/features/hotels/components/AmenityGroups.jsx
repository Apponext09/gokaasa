import { useState } from 'react';
import { Accessibility, Baby, BellRing, Car, Check, ChevronDown, Clock, Coffee, Dumbbell, Plane, PawPrint, Presentation, Shirt, Snowflake, Sparkles, UtensilsCrossed, Umbrella, Waves, Wifi, Wine } from 'lucide-react';

const ICON = {
  WIFI: Wifi,
  POOL: Waves,
  PARKING: Car,
  RESTAURANT: UtensilsCrossed,
  BAR: Wine,
  GYM: Dumbbell,
  SPA: Sparkles,
  AC: Snowflake,
  ROOM_SERVICE: BellRing,
  BREAKFAST: Coffee,
  AIRPORT_SHUTTLE: Plane,
  LAUNDRY: Shirt,
  PETS_ALLOWED: PawPrint,
  WHEELCHAIR_ACCESS: Accessibility,
  FRONT_DESK_24H: Clock,
  CONFERENCE_ROOM: Presentation,
  BEACH_ACCESS: Umbrella,
  KIDS_CLUB: Baby,
};

// Customer-facing groups. Catalogue categories are mapped to the way guests browse, not to internal labels.
const GROUPS = [
  { title: 'Popular', categories: ['CONNECTIVITY', 'TRANSPORT'] },
  { title: 'Food & drink', categories: ['DINING'] },
  { title: 'Wellness', categories: ['WELLNESS'] },
  { title: 'Rooms & services', categories: ['ROOM', 'SERVICES'] },
  { title: 'Leisure & access', categories: ['LEISURE', 'ACCESSIBILITY', 'OTHER'] },
];

/** Grouped amenities with icons. Only amenities the hotel actually has are shown. */
export function AmenityGroups({ amenities = [] }) {
  const [expanded, setExpanded] = useState(false);
  const groups = GROUPS.map((group) => ({
    title: group.title,
    items: amenities.filter((a) => group.categories.includes(a.category)),
  })).filter((group) => group.items.length > 0);
  const initiallyVisiblePerGroup = 2;
  const hiddenCount = groups.reduce(
    (total, group) => total + Math.max(0, group.items.length - initiallyVisiblePerGroup),
    0,
  );

  if (groups.length === 0) return <p className="text-sm text-[var(--text-muted)]">No amenities have been listed yet.</p>;

  return (
    <div className="space-y-3">
      <div className="amenity-groups grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
        {groups.map((group) => (
          <div key={group.title} className="hotel-amenity-group space-y-1.5">
            <h3 className="text-xs font-semibold text-[var(--text-strong)]">{group.title}</h3>
            <ul className="flex flex-wrap gap-1.5">
              {(expanded ? group.items : group.items.slice(0, initiallyVisiblePerGroup)).map((item) => {
                const Icon = ICON[item.code] ?? Check;
                return (
                  <li key={item.code} className="hotel-amenity-chip flex items-center gap-2 text-xs text-[var(--text-body)]">
                    <Icon className="h-4 w-4 shrink-0 text-brand-700" aria-hidden="true" />
                    {item.name}
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>

      {hiddenCount > 0 && (
        <button
          type="button"
          aria-expanded={expanded}
          onClick={() => setExpanded((value) => !value)}
          className="inline-flex items-center gap-1.5 rounded-full border border-brand-200 bg-brand-50 px-3 py-1.5 text-xs font-semibold text-brand-700 transition hover:border-brand-300 hover:bg-brand-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
        >
          {expanded ? 'Show fewer amenities' : `Show ${hiddenCount} more ${hiddenCount === 1 ? 'amenity' : 'amenities'}`}
          <ChevronDown className={`h-3.5 w-3.5 transition-transform ${expanded ? 'rotate-180' : ''}`} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
