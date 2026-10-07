import { Accessibility, Baby, BellRing, Car, Check, Clock, Coffee, Dumbbell, Plane, PawPrint, Presentation, Shirt, Snowflake, Sparkles, UtensilsCrossed, Umbrella, Waves, Wifi, Wine } from 'lucide-react';

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
export function AmenityGroups({ amenities }) {
  const groups = GROUPS.map((group) => ({
    title: group.title,
    items: amenities.filter((a) => group.categories.includes(a.category)),
  })).filter((group) => group.items.length > 0);

  if (groups.length === 0) return <p className="text-sm text-[var(--text-muted)]">No amenities have been listed yet.</p>;

  return (
    <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {groups.map((group) => (
        <div key={group.title} className="space-y-3">
          <h3 className="text-sm font-semibold text-[var(--text-strong)]">{group.title}</h3>
          <ul className="space-y-2">
            {group.items.map((item) => {
              const Icon = ICON[item.code] ?? Check;
              return (
                <li key={item.code} className="flex items-center gap-2.5 text-sm text-[var(--text-body)]">
                  <Icon className="h-4 w-4 shrink-0 text-brand-700" aria-hidden="true" />
                  {item.name}
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}
