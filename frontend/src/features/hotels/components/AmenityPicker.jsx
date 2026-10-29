import { Checkbox } from '@/components/ui/form-controls.jsx';
import { Button } from '@/components/ui/button.jsx';

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

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-muted)] px-3 py-2">
        <span className="mr-auto text-sm font-medium text-[var(--text-strong)]">All amenities</span>
        <Button type="button" size="sm" variant="ghost" disabled={disabled || selected.length === catalog.length} onClick={() => changeMany(catalog.map((item) => item.code), true)}>Select all</Button>
        <Button type="button" size="sm" variant="ghost" disabled={disabled || selected.length === 0} onClick={() => onSelectionChange([])}>Unselect all</Button>
      </div>
      {Object.entries(groups).map(([category, items]) => (
        <div key={category} className="space-y-2">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <h3 className="mr-auto text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">{category.replaceAll('_', ' ').toLowerCase()}</h3>
            <Button type="button" size="sm" variant="ghost" disabled={disabled || items.every((item) => selected.includes(item.code))} onClick={() => changeMany(items.map((item) => item.code), true)}>Select category</Button>
            <Button type="button" size="sm" variant="ghost" disabled={disabled || items.every((item) => !selected.includes(item.code))} onClick={() => changeMany(items.map((item) => item.code), false)}>Unselect category</Button>
          </div>
          <fieldset disabled={disabled} aria-label={`${category.replaceAll('_', ' ').toLowerCase()} amenities`} className="grid grid-cols-1 gap-2 sm:grid-cols-2">
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
      ))}
    </div>
  );
}
