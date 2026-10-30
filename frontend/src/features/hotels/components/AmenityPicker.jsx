import { Checkbox } from '@/components/ui/form-controls.jsx';

/** Amenities grouped by category. Source synonyms are mapped on the server, so this only edits codes. */
export function AmenityPicker({ catalog, selected, onSelectionChange, disabled }) {
  const groups = catalog.reduce((acc, amenity) => {
    (acc[amenity.category] ??= []).push(amenity);
    return acc;
  }, {});

  const changeMany = (codes, checked) => {
    const affected = new Set(codes);
    onSelectionChange(checked
      ? [...new Set([...selected, ...codes])]
      : selected.filter((code) => !affected.has(code)));
  };

  const allCodes = catalog.map((item) => item.code);
  const allSelected = allCodes.length > 0 && allCodes.every((code) => selected.includes(code));

  return (
    <div className="space-y-5">
      <div className="grid min-h-11 grid-cols-[minmax(0,1fr)_auto] items-center gap-4 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-muted)] px-4 py-2">
        <span className="text-sm font-medium text-[var(--text-strong)]">All amenities</span>
        <Checkbox
          label="Select all"
          className="min-w-24 justify-end whitespace-nowrap font-medium text-[var(--text-strong)]"
          checked={allSelected}
          disabled={disabled || allCodes.length === 0}
          onChange={(event) => changeMany(allCodes, event.target.checked)}
        />
      </div>
      {Object.entries(groups).map(([category, items]) => {
        const categoryCodes = items.map((item) => item.code);
        const categorySelected = categoryCodes.every((code) => selected.includes(code));
        const categoryLabel = category.replaceAll('_', ' ').toLowerCase();

        return (
          <div key={category} className="space-y-3">
            <div className="grid min-h-10 grid-cols-[minmax(0,1fr)_auto] items-center gap-4 border-b border-[var(--border-subtle)] pb-2">
              <h3 className="truncate text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">{categoryLabel}</h3>
              <Checkbox
                label="Select all"
                className="min-w-24 justify-end whitespace-nowrap font-medium text-[var(--text-strong)]"
                checked={categorySelected}
                disabled={disabled}
                onChange={(event) => changeMany(categoryCodes, event.target.checked)}
              />
            </div>
            <fieldset disabled={disabled} aria-label={`${categoryLabel} amenities`} className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {items.map((amenity) => (
                <Checkbox
                  key={amenity.code}
                  label={amenity.name}
                  checked={selected.includes(amenity.code)}
                  onChange={(event) => changeMany([amenity.code], event.target.checked)}
                />
              ))}
            </fieldset>
          </div>
        );
      })}
    </div>
  );
}
