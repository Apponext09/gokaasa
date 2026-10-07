import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button.jsx';
import { Checkbox, Input } from '@/components/ui/form-controls.jsx';
import { useDebounce } from '@/hooks/useDebounce.js';

const PROPERTY_TYPES = [
  { value: 'HOTEL', label: 'Hotel' },
  { value: 'RESORT', label: 'Resort' },
  { value: 'VILLA', label: 'Villa' },
  { value: 'APARTMENT', label: 'Apartment' },
  { value: 'GUEST_HOUSE', label: 'Guest house' },
  { value: 'HOSTEL', label: 'Hostel' },
];

const MEAL_PLANS = [
  { value: 'ROOM_ONLY', label: 'Room only' },
  { value: 'BREAKFAST', label: 'Breakfast included' },
  { value: 'HALF_BOARD', label: 'Half board' },
  { value: 'FULL_BOARD', label: 'Full board' },
];

const GUEST_RATINGS = [
  { value: undefined, label: 'Any rating' },
  { value: 4.5, label: '4.5+' },
  { value: 4, label: '4+' },
  { value: 3.5, label: '3.5+' },
];

// The amenities a guest is most likely to ask for. The API takes any catalogue code; these are the common ones.
const AMENITY_FILTERS = [
  { code: 'WIFI', label: 'WiFi' },
  { code: 'POOL', label: 'Pool' },
  { code: 'PARKING', label: 'Parking' },
  { code: 'RESTAURANT', label: 'Restaurant' },
  { code: 'GYM', label: 'Gym' },
  { code: 'SPA', label: 'Spa' },
  { code: 'AC', label: 'Air conditioning' },
  { code: 'ROOM_SERVICE', label: 'Room service' },
];

const toggle = (list, value) => (list?.includes(value) ? list.filter((v) => v !== value) : [...(list ?? []), value]);

function Section({ title, children }) {
  return (
    <fieldset className="flex flex-col gap-2.5 border-t border-[var(--border-subtle)] pt-4 first:border-t-0 first:pt-0">
      <legend className="mb-2 text-sm font-semibold text-[var(--text-strong)]">{title}</legend>
      {children}
    </fieldset>
  );
}

/**
 * Filters for the results. Every change goes to the URL through onChange, so the list is shareable and
 * survives a reload. The price slider is debounced so dragging does not send a request per pixel.
 */
export function FilterPanel({ filters, priceBounds, onChange, onClear, disabled = false }) {
  const floor = priceBounds ? Math.floor(priceBounds.minPerNightMinor / 100) : 0;
  const ceiling = priceBounds ? Math.max(Math.ceil(priceBounds.maxPerNightMinor / 100), floor + 1) : 50000;
  const [range, setRange] = useState({
    min: filters.minPrice ?? floor,
    max: filters.maxPrice ?? ceiling,
  });
  const debouncedRange = useDebounce(range, 400);

  useEffect(() => {
    const minPrice = debouncedRange.min > floor ? debouncedRange.min : undefined;
    const maxPrice = debouncedRange.max < ceiling ? debouncedRange.max : undefined;
    if (minPrice !== filters.minPrice || maxPrice !== filters.maxPrice) {
      onChange({ ...filters, minPrice, maxPrice });
    }
    // Only the debounced range drives the URL; `filters` is read at that moment.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedRange]);

  useEffect(() => {
    setRange({ min: filters.minPrice ?? floor, max: filters.maxPrice ?? ceiling });
  }, [filters.minPrice, filters.maxPrice, floor, ceiling]);

  const set = (patch) => onChange({ ...filters, ...patch });
  const activeCount = [
    filters.minPrice,
    filters.maxPrice,
    filters.stars?.length,
    filters.guestRating,
    filters.propertyTypes?.length,
    filters.amenities?.length,
    filters.freeCancellation,
    filters.mealPlans?.length,
  ].filter(Boolean).length;

  return (
    <div className="space-y-5" aria-disabled={disabled || undefined}>
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-[var(--text-strong)]">Filters</h2>
        {activeCount > 0 && (
          <Button variant="ghost" size="sm" onClick={onClear}>
            Clear all ({activeCount})
          </Button>
        )}
      </div>

      <Section title="Price per night">
        <div className="grid grid-cols-2 gap-2">
          <label className="space-y-1 text-xs text-[var(--text-muted)]">
            Minimum (₹)
            <Input
              type="number"
              inputMode="numeric"
              min={floor}
              max={range.max}
              value={range.min}
              onChange={(event) => setRange((r) => ({ ...r, min: Math.min(Number(event.target.value) || 0, r.max) }))}
              aria-label="Minimum price per night"
            />
          </label>
          <label className="space-y-1 text-xs text-[var(--text-muted)]">
            Maximum (₹)
            <Input
              type="number"
              inputMode="numeric"
              min={range.min}
              max={ceiling}
              value={range.max}
              onChange={(event) => setRange((r) => ({ ...r, max: Math.max(Number(event.target.value) || 0, r.min) }))}
              aria-label="Maximum price per night"
            />
          </label>
        </div>
        <div className="space-y-2 pt-1">
          <input
            type="range"
            aria-label="Minimum price slider"
            min={floor}
            max={ceiling}
            step={100}
            value={range.min}
            onChange={(event) => setRange((r) => ({ ...r, min: Math.min(Number(event.target.value), r.max) }))}
            className="w-full accent-brand-600"
          />
          <input
            type="range"
            aria-label="Maximum price slider"
            min={floor}
            max={ceiling}
            step={100}
            value={range.max}
            onChange={(event) => setRange((r) => ({ ...r, max: Math.max(Number(event.target.value), r.min) }))}
            className="w-full accent-brand-600"
          />
        </div>
      </Section>

      <Section title="Star rating">
        {[5, 4, 3, 2, 1].map((stars) => (
          <Checkbox
            key={stars}
            label={`${stars} star${stars === 1 ? '' : 's'}`}
            checked={filters.stars?.includes(stars) ?? false}
            onChange={() => set({ stars: toggle(filters.stars, stars).sort((a, b) => a - b) })}
          />
        ))}
      </Section>

      <Section title="Guest rating">
        {GUEST_RATINGS.map((option) => (
          <label key={option.label} className="flex cursor-pointer items-center gap-2 text-sm text-[var(--text-body)]">
            <input
              type="radio"
              name="guest-rating"
              className="h-4 w-4 accent-brand-600"
              checked={filters.guestRating === option.value}
              onChange={() => set({ guestRating: option.value })}
            />
            {option.label}
          </label>
        ))}
        <p className="text-xs text-[var(--text-muted)]">Hotels without guest reviews are not shown when a rating is selected.</p>
      </Section>

      <Section title="Property type">
        {PROPERTY_TYPES.map((type) => (
          <Checkbox
            key={type.value}
            label={type.label}
            checked={filters.propertyTypes?.includes(type.value) ?? false}
            onChange={() => set({ propertyTypes: toggle(filters.propertyTypes, type.value) })}
          />
        ))}
      </Section>

      <Section title="Amenities">
        {AMENITY_FILTERS.map((amenity) => (
          <Checkbox
            key={amenity.code}
            label={amenity.label}
            checked={filters.amenities?.includes(amenity.code) ?? false}
            onChange={() => set({ amenities: toggle(filters.amenities, amenity.code) })}
          />
        ))}
      </Section>

      <Section title="Cancellation">
        <Checkbox label="Free cancellation" checked={filters.freeCancellation} onChange={(e) => set({ freeCancellation: e.target.checked })} />
      </Section>

      <Section title="Meal plan">
        {MEAL_PLANS.map((meal) => (
          <Checkbox
            key={meal.value}
            label={meal.label}
            checked={filters.mealPlans?.includes(meal.value) ?? false}
            onChange={() => set({ mealPlans: toggle(filters.mealPlans, meal.value) })}
          />
        ))}
      </Section>
    </div>
  );
}
