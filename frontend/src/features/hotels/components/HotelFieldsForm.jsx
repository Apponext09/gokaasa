import { Check, CircleAlert, Lightbulb, ShieldCheck, X } from 'lucide-react';
import { Badge } from '@/components/ui/surfaces.jsx';
import { Button } from '@/components/ui/button.jsx';
import { Input, Select, Textarea } from '@/components/ui/form-controls.jsx';
import { FormField } from '@/components/shared/index.jsx';
import { FIELD_LABELS } from '@/features/hotels/hotelForm.js';

const STATE_BADGE = {
  IMPORTED: { tone: 'brand', label: 'Imported' },
  MODIFIED: { tone: 'warning', label: 'Modified' },
  MISSING: { tone: 'danger', label: 'Missing' },
  VERIFIED: { tone: 'success', label: 'Verified' },
};

/** Badge text comes from the server's field state. The UI never decides provenance itself. */
export function FieldStateBadge({ state }) {
  if (!state?.status) return null;
  const config = STATE_BADGE[state.status];
  return <Badge tone={config.tone}>{config.label}</Badge>;
}

function renderControl(name, { register, disabled, invalid, ariaDescribedBy, propertyTypeOptions, currentValue }) {
  const common = { id: name, disabled, invalid, 'aria-describedby': ariaDescribedBy };
  if (name === 'propertyType') {
    const hasCurrent = propertyTypeOptions.some((option) => option.value === currentValue);
    return (
      <Select {...common} {...register(name)}>
        {!hasCurrent && currentValue && <option value={currentValue}>{String(currentValue).replaceAll('_', ' ')}</option>}
        {propertyTypeOptions.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </Select>
    );
  }
  if (name === 'starRating') {
    return (
      <Select {...common} {...register(name)}>
        <option value="">No rating</option>
        {[1, 2, 3, 4, 5].map((stars) => (
          <option key={stars} value={stars}>{stars} star</option>
        ))}
      </Select>
    );
  }
  if (name === 'description') return <Textarea {...common} {...register(name)} />;
  if (name === 'countryCode') return <Input {...common} maxLength={2} className="uppercase" {...register(name)} />;
  if (name === 'locationUrl') {
    return <Input {...common} type="url" inputMode="url" placeholder="https://maps.app.goo.gl/..." {...register(name)} />;
  }
  if (name === 'checkInTime' || name === 'checkOutTime') {
    return <Input {...common} type="time" {...register(name)} />;
  }
  return <Input {...common} {...register(name)} />;
}

/**
 * Editable hotel fields with per-field provenance. Each field shows its server-computed state, offers
 * "Verify" once it has a value, and shows any provider suggestion next to the admin's own value.
 */
export function HotelFieldsForm({ fields, form, hotel, disabled, onVerify, onAcceptSuggestion, onDismissSuggestion, busyField, propertyTypeOptions = [] }) {
  const { register, formState } = form;
  const errors = formState.errors;

  return (
    <div className="grid grid-cols-1 gap-x-5 gap-y-6 sm:grid-cols-2">
      {fields.map((name) => {
        const state = hotel?.fieldStates?.[name];
        const error = errors[name]?.message;
        const value = form.watch(name);
        const hasValue = String(value ?? '').trim() !== '';
        const canVerify = !disabled && hasValue && state?.status && state.status !== 'VERIFIED' && Boolean(onVerify);
        const span = name === 'description' || name === 'addressLine' || name === 'locationUrl' ? 'sm:col-span-2' : '';
        const describedBy = error ? `${name}-error` : state?.hasSuggestion ? `${name}-suggestion` : undefined;

        return (
          <div key={name} className={span}>
            <FormField
              id={name}
              label={
                <span className="flex flex-wrap items-center gap-2">
                  {FIELD_LABELS[name] ?? name}
                  <FieldStateBadge state={state} />
                </span>
              }
              error={error}
            >
              {renderControl(name, { register, disabled, invalid: Boolean(error), ariaDescribedBy: describedBy, propertyTypeOptions, currentValue: value })}
            </FormField>

            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              {canVerify && (
                <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" loading={busyField === name} onClick={() => onVerify(name)}>
                  <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" /> Mark verified
                </Button>
              )}
            </div>

            {state?.hasSuggestion && (
              <div id={`${name}-suggestion`} className="mt-2 rounded-lg border border-warning-600/30 bg-warning-50 p-3 text-xs text-warning-600">
                <p className="flex items-start gap-1.5 font-medium">
                  <Lightbulb className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  The provider now says: <span className="break-all font-normal text-[var(--text-body)]">{state.pendingExternalValue}</span>
                </p>
                <p className="mt-1 text-[var(--text-muted)]">Your value was kept. Accepting replaces it.</p>
                {!disabled && (
                  <div className="mt-2 flex gap-2">
                    <Button size="sm" variant="secondary" className="h-7 px-2 text-xs" loading={busyField === name} onClick={() => onAcceptSuggestion(name)}>
                      <Check className="h-3.5 w-3.5" aria-hidden="true" /> Accept provider value
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => onDismissSuggestion(name)}>
                      <X className="h-3.5 w-3.5" aria-hidden="true" /> Keep mine
                    </Button>
                  </div>
                )}
              </div>
            )}

            {state?.status === 'MISSING' && !state?.hasSuggestion && (
              <p className="mt-2 flex items-center gap-1 text-xs text-danger-600">
                <CircleAlert className="h-3.5 w-3.5" aria-hidden="true" /> Fill this in before publishing if it is required.
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
