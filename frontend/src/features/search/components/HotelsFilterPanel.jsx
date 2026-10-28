import { useEffect, useState, useRef } from "react";
import { Star } from "lucide-react";
import { Button } from "@/components/ui/button.jsx";
import { Checkbox, Input } from "@/components/ui/form-controls.jsx";
import { useDebounce } from "@/hooks/useDebounce.js";
import { DINNER_INCLUDED_MEAL_PLANS } from "@/features/search/searchParams.js";
import { useCatalog } from "@/features/catalogs/useCatalog.js";
import { toOptions } from "@/features/catalogs/catalogs.js";

const GUEST_RATINGS = [
  { value: undefined, label: "Any rating" },
  { value: 4.5, label: "4.5+" },
  { value: 4, label: "4+" },
  { value: 3.5, label: "3.5+" },
];

const STAR_CATEGORIES = [5, 4, 3, 2, 1];


const toggle = (list, value) =>
  list?.includes(value) ? list.filter((v) => v !== value) : [...(list ?? []), value];

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

function rangeFromFilters(filters, ceiling) {
  const min = filters.minPrice != null ? clamp(filters.minPrice, 0, ceiling) : 0;
  const max = filters.maxPrice != null ? clamp(filters.maxPrice, min, ceiling) : ceiling;
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
  const { items: propertyTypeItems } = useCatalog('property-types');
  const { items: amenityItems } = useCatalog('amenities');
  const { items: mealPlanItems } = useCatalog('meal-plans');
  const propertyTypes = toOptions(propertyTypeItems);
  const dinnerMealPlans = mealPlanItems.length
    ? mealPlanItems.filter((item) => item.includesDinner).map((item) => item.code)
    : [...DINNER_INCLUDED_MEAL_PLANS];
  const floor = 0;
  const ceiling = 1000000;

  const isUserActionRef = useRef(false);
  const [range, setRange] = useState(() => rangeFromFilters(filters, ceiling));
  const debouncedRange = useDebounce(range, 400);

  // Sync debounced price range changes to parent ONLY when initiated by user interaction
  useEffect(() => {
    if (!isUserActionRef.current) return;
    isUserActionRef.current = false;

    const rawMin = debouncedRange.min === "" ? 0 : Number(debouncedRange.min);
    const rawMax = debouncedRange.max === "" ? ceiling : Number(debouncedRange.max);
    const effectiveMin = clamp(Number.isNaN(rawMin) ? 0 : rawMin, 0, ceiling);
    const effectiveMax = clamp(Number.isNaN(rawMax) ? ceiling : rawMax, effectiveMin, ceiling);

    const minPrice = effectiveMin > 0 ? effectiveMin : undefined;
    const maxPrice = effectiveMax < ceiling ? effectiveMax : undefined;
    if (minPrice !== filters.minPrice || maxPrice !== filters.maxPrice) {
      onChange({ ...filters, minPrice, maxPrice });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedRange]);

  // Sync incoming external filter changes to local range
  useEffect(() => {
    if (!isUserActionRef.current) {
      setRange(rangeFromFilters(filters, ceiling));
    }
  }, [filters.minPrice, filters.maxPrice]);

  const set = (patch) => onChange({ ...filters, ...patch });

  const clearAll = () => {
    isUserActionRef.current = false;
    setRange({ min: 0, max: ceiling });
    if (onNameQueryChange) {
      onNameQueryChange("");
    }
    onClear();
  };

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
          <Button variant="ghost" size="sm" onClick={clearAll}>
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
            <div className="grid grid-cols-2 gap-2">
              <label className="space-y-1 text-xs text-[var(--text-muted)]">
                Min (Rs.)
                <Input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={typeof range.max === "number" ? range.max : ceiling}
                  value={range.min}
                  onChange={(e) => {
                    isUserActionRef.current = true;
                    const val = e.target.value;
                    if (val === "") {
                      setRange((r) => ({ ...r, min: "" }));
                    } else {
                      const num = Math.max(0, Number(val));
                      setRange((r) => ({ ...r, min: Number.isNaN(num) ? 0 : num }));
                    }
                  }}
                  onBlur={() => {
                    isUserActionRef.current = true;
                    setRange((r) => {
                      const minNum = r.min === "" ? 0 : Number(r.min);
                      const maxNum = r.max === "" ? ceiling : Number(r.max);
                      const safeMax = clamp(Number.isNaN(maxNum) ? ceiling : maxNum, 0, ceiling);
                      const safeMin = clamp(Number.isNaN(minNum) ? 0 : minNum, 0, safeMax);
                      return { min: safeMin, max: safeMax };
                    });
                  }}
                  aria-label="Minimum price per night"
                />
              </label>
              <label className="space-y-1 text-xs text-[var(--text-muted)]">
                Max (Rs.)
                <Input
                  type="number"
                  inputMode="numeric"
                  min={typeof range.min === "number" ? range.min : 0}
                  max={ceiling}
                  value={range.max}
                  onChange={(e) => {
                    isUserActionRef.current = true;
                    const val = e.target.value;
                    if (val === "") {
                      setRange((r) => ({ ...r, max: "" }));
                    } else {
                      const num = Math.max(0, Number(val));
                      setRange((r) => ({ ...r, max: Number.isNaN(num) ? ceiling : num }));
                    }
                  }}
                  onBlur={() => {
                    isUserActionRef.current = true;
                    setRange((r) => {
                      const minNum = r.min === "" ? 0 : Number(r.min);
                      const maxNum = r.max === "" ? ceiling : Number(r.max);
                      const safeMin = clamp(Number.isNaN(minNum) ? 0 : minNum, 0, ceiling);
                      const safeMax = clamp(Number.isNaN(maxNum) ? ceiling : maxNum, safeMin, ceiling);
                      return { min: safeMin, max: safeMax };
                    });
                  }}
                  aria-label="Maximum price per night"
                />
              </label>
            </div>
            <input
              type="range"
              aria-label="Maximum price slider"
              min={0}
              max={ceiling}
              step={500}
              value={typeof range.max === "number" ? range.max : ceiling}
              disabled={ceiling <= 0}
              onChange={(e) => {
                isUserActionRef.current = true;
                const minLimit = typeof range.min === "number" ? range.min : 0;
                setRange((r) => ({ ...r, max: clamp(Number(e.target.value), minLimit, ceiling) }));
              }}
              className="mt-1 w-full accent-brand-600"
            />
            <div className="flex justify-between text-[11px] text-[var(--text-muted)]">
              <span>Rs.0</span>
              <span>Rs.{ceiling.toLocaleString("en-IN")}</span>
            </div>
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
        {amenityItems.map((amenity) => (
          <Checkbox
            key={amenity.code}
            label={amenity.name}
            checked={filters.amenities?.includes(amenity.code) ?? false}
            onChange={() => set({ amenities: toggle(filters.amenities, amenity.code) })}
          />
        ))}
      </Section>

      {/* Property type */}
      <Section title="Property Type">
        {propertyTypes.map((type) => (
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
          checked={dinnerMealPlans.length > 0 && dinnerMealPlans.every((plan) => filters.mealPlans?.includes(plan))}
          onChange={(e) => set({ mealPlans: e.target.checked ? dinnerMealPlans : undefined })}
        />
      </Section>

    </fieldset>
  );
}
