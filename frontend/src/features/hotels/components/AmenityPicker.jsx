import { Checkbox } from '@/components/ui/form-controls.jsx';

/** Amenities grouped by category. Source synonyms are mapped on the server, so this only edits codes. */
export function AmenityPicker({ catalog, selected, onToggle, disabled }) {
  const groups = catalog.reduce((acc, amenity) => {
    (acc[amenity.category] ??= []).push(amenity);
    return acc;
  }, {});

  return (
    <div className="space-y-5">
      {Object.entries(groups).map(([category, items]) => (
        <fieldset key={category} disabled={disabled} className="space-y-2">
          <legend className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
            {category.replaceAll('_', ' ').toLowerCase()}
          </legend>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {items.map((amenity) => (
              <Checkbox
                key={amenity.code}
                label={amenity.name}
                checked={selected.includes(amenity.code)}
                onChange={(event) => onToggle(amenity.code, event.target.checked)}
              />
            ))}
          </div>
        </fieldset>
      ))}
    </div>
  );
}
