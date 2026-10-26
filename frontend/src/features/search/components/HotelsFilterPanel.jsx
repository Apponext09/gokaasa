import { useEffect, useState } from "react";
import { Star } from "lucide-react";
import { Button } from "@/components/ui/button.jsx";
import { Checkbox, Input } from "@/components/ui/form-controls.jsx";
import { useDebounce } from "@/hooks/useDebounce.js";
import { DINNER_INCLUDED_MEAL_PLANS } from "@/features/search/searchParams.js";

const PROPERTY_TYPES = [
  { value: "HOTEL", label: "Hotel" },
  { value: "RESORT", label: "Resort" },
  { value: "VILLA", label: "Villa" },
  { value: "APARTMENT", label: "Apartment" },
  { value: "GUEST_HOUSE", label: "Guest house" },
  { value: "HOSTEL", label: "Hostel" },
];

const GUEST_RATINGS = [
  { value: undefined, label: "Any rating" },
  { value: 4.5, label: "4.5+" },
  { value: 4, label: "4+" },
  { value: 3.5, label: "3.5+" },
];

const STAR_CATEGORIES = [5, 4, 3, 2, 1];

const AMENITY_FILTERS = [
  { code: "WIFI", label: "Free WiFi" },
  { code: "POOL", label: "Swimming Pool" },
  { code: "PARKING", label: "Free Parking" },
  { code: "RESTAURANT", label: "Restaurant" },
  { code: "GYM", label: "Gym / Fitness" },
  { code: "SPA", label: "Spa" },
  { code: "AC", label: "Air Conditioning" },
  { code: "ROOM_SERVICE", label: "Room Service" },
];

const toggle = (list, value) =>
  list?.includes(value) ? list.filter((v) => v !== value) : [...(list ?? []), value];

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

function rangeFromFilters(filters, floor, ceiling) {
  const min = clamp(filters.minPrice ?? floor, floor, ceiling);
  const max = clamp(filters.maxPrice ?? ceiling, min, ceiling);
  return { min, max };
}

function Section({ title, children }) {
  return (
    <fieldset className="flex flex-col gap-2.5 border-t border-[var(--border-subtle)] pt-4 first:border-t-0 first:pt-0">
      <legend className="mb-2 text-sm font-semibold text-[var(--text-strong)]">{title}</legend>
      {children}
    </fieldset>
  );
}

export function HotelsFilterPanel({
  filters,
  priceBounds,
  onChange,
  onClear,
  disabled = false,
  nameQuery = "",
  onNameQueryChange,
}) {
  const floor = priceBounds ? Math.floor(priceBounds.minPerNightMinor / 100) : 1500;
  const ceiling = priceBounds ? Math.max(Math.ceil(priceBounds.maxPerNightMinor / 100), floor) : 35000;

  const [range, setRange] = useState(() => rangeFromFilters(filters, floor, ceiling));
  const debouncedRange = useDebounce(range, 400);

  useEffect(() => {
    if (priceBounds === null) return;
    const minPrice = debouncedRange.min > floor ? debouncedRange.min : undefined;
    const maxPrice = debouncedRange.max < ceiling ? debouncedRange.max : undefined;
    if (minPrice !== filters.minPrice || maxPrice !== filters.maxPrice) {
      onChange({ ...filters, minPrice, maxPrice });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedRange, priceBounds]);

  useEffect(() => {
    if (priceBounds === null) return;
    setRange(rangeFromFilters(filters, floor, ceiling));
  }, [filters.minPrice, filters.maxPrice, floor, ceiling, priceBounds]);

  const set = (patch) => onChange({ ...filters, ...patch });

  const activeCount = [
    nameQuery.trim(),
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
    <fieldset className="customer-filter-panel min-w-0 space-y-5 border-0 p-0" disabled={disabled} aria-busy={disabled || undefined}>

      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-[var(--text-strong)]">Filters</h2>
        {activeCount > 0 && (
          <Button variant="ghost" size="sm" onClick={onClear}>
            Clear all ({activeCount})
          </Button>
        )}
      </div>

      {/* Search by name */}
      <Section title="Search Hotel by Name">
        <Input
          type="text"
          placeholder="e.g. Taj, W Goa, Solang..."
          value={nameQuery}
          onChange={(e) => onNameQueryChange(e.target.value)}
          aria-label="Search hotel by name"
        />
      </Section>

      {/* Price per night */}
      <Section title="Price per night">
        {priceBounds === null ? (
          <p className="text-xs text-[var(--text-muted)]">No nightly prices are available for the current search.</p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2">
              <label className="space-y-1 text-xs text-[var(--text-muted)]">
                Min (Rs.)
                <Input
                  type="number"
                  inputMode="numeric"
                  min={floor}
                  max={range.max}
                  value={range.min}
                  onChange={(e) => setRange((r) => ({ ...r, min: clamp(Number(e.target.value) || floor, floor, r.max) }))}
                  aria-label="Minimum price per night"
                />
              </label>
              <label className="space-y-1 text-xs text-[var(--text-muted)]">
                Max (Rs.)
                <Input
                  type="number"
                  inputMode="numeric"
                  min={range.min}
                  max={ceiling}
                  value={range.max}
                  onChange={(e) => setRange((r) => ({ ...r, max: clamp(Number(e.target.value) || ceiling, r.min, ceiling) }))}
                  aria-label="Maximum price per night"
                />
              </label>
            </div>
            <input
              type="range"
              aria-label="Maximum price slider"
              min={floor}
              max={ceiling}
              step={1}
              value={range.max}
              disabled={floor === ceiling}
              onChange={(e) => setRange((r) => ({ ...r, max: clamp(Number(e.target.value), r.min, ceiling) }))}
              className="mt-1 w-full accent-brand-600"
            />
            <div className="flex justify-between text-[11px] text-[var(--text-muted)]">
              <span>Rs.{floor.toLocaleString("en-IN")}</span>
              <span>Rs.{ceiling.toLocaleString("en-IN")}</span>
            </div>
          </>
        )}
      </Section>

      {/* Star category */}
      <Section title="Star Category">
        {STAR_CATEGORIES.map((stars) => (
          <label key={stars} className="inline-flex cursor-pointer items-center gap-2 text-sm text-[var(--text-body)]">
            <input
              type="checkbox"
              className="h-4 w-4 cursor-pointer rounded accent-brand-600"
              checked={filters.stars?.includes(stars) ?? false}
              onChange={() => set({ stars: toggle(filters.stars, stars).sort((a, b) => a - b) })}
            />
            <span className="flex items-center gap-1.5">
              {stars} Star
              <span className="flex items-center">
                {Array.from({ length: stars }).map((_, i) => (
                  <Star key={i} className="h-3 w-3 fill-amber-400 text-amber-400" />
                ))}
              </span>
            </span>
          </label>
        ))}
      </Section>

      {/* Cancellation */}
      <Section title="Cancellation">
        <Checkbox
          label="Free Cancellation"
          checked={filters.freeCancellation === true}
          onChange={(e) => set({ freeCancellation: e.target.checked ? true : undefined })}
        />
        <p className="text-xs text-[var(--text-muted)]">
          Show only hotels with free cancellation policy.
        </p>
      </Section>

      {/* Amenities */}
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

      {/* Property type */}
      <Section title="Property Type">
        {PROPERTY_TYPES.map((type) => (
          <Checkbox
            key={type.value}
            label={type.label}
            checked={filters.propertyTypes?.includes(type.value) ?? false}
            onChange={() => set({ propertyTypes: toggle(filters.propertyTypes, type.value) })}
          />
        ))}
      </Section>

      {/* Guest rating */}
      <Section title="Guest Rating">
        {GUEST_RATINGS.map((option) => (
          <label key={option.label} className="flex cursor-pointer items-center gap-2 text-sm text-[var(--text-body)]">
            <input
              type="radio"
              name="hfp-guest-rating"
              className="h-4 w-4 accent-brand-600"
              checked={filters.guestRating === option.value}
              onChange={() => set({ guestRating: option.value })}
            />
            {option.label}
          </label>
        ))}
        <p className="text-xs text-[var(--text-muted)]">Hotels without reviews are hidden when a rating is selected.</p>
      </Section>

      {/* Meal plan */}
      <Section title="Meal Plan">
        <Checkbox
          label="Dinner Included"
          checked={DINNER_INCLUDED_MEAL_PLANS.every((p) => filters.mealPlans?.includes(p)) ?? false}
          onChange={(e) => set({ mealPlans: e.target.checked ? [...DINNER_INCLUDED_MEAL_PLANS] : undefined })}
        />
      </Section>

    </fieldset>
  );
}
