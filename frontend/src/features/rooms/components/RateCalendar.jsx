import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Lock, Unlock } from 'lucide-react';
import { Alert, Badge, Card, CardContent, CardDescription, CardHeader, CardTitle, Skeleton } from '@/components/ui/surfaces.jsx';
import { Button } from '@/components/ui/button.jsx';
import { Input, Select } from '@/components/ui/form-controls.jsx';
import { FormField, formatMoney } from '@/components/shared/index.jsx';
import { rupeesToMinor } from '@/features/rooms/roomForm.js';
import { roomApi } from '@/services/endpoints.js';
import { applyServerFieldErrors, normalizeError } from '@/services/api.js';

const isoDay = (offset = 0) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
};

const optionalWhole = (min, max, label) =>
  z.string().trim().refine((v) => v === '' || (/^\d+$/.test(v) && Number(v) >= min && Number(v) <= max), `${label}: ${min} to ${max}`);

const bulkSchema = z
  .object({
    from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Choose a start date'),
    to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Choose an end date'),
    ratePlanId: z.string(),
    price: z.string().trim().refine((v) => v === '' || rupeesToMinor(v) !== null, 'Enter a price such as 8999 or 8999.50'),
    units: optionalWhole(0, 500, 'Rooms'),
    closure: z.enum(['KEEP', 'CLOSE', 'OPEN']),
    minStay: optionalWhole(1, 365, 'Minimum nights'),
    maxStay: optionalWhole(1, 365, 'Maximum nights'),
  })
  .refine((v) => v.to >= v.from, { path: ['to'], message: 'End date must be on or after the start date' })
  .refine((v) => v.price === '' || v.ratePlanId !== '', { path: ['ratePlanId'], message: 'Choose a rate plan to price' })
  .refine((v) => v.minStay === '' || v.maxStay === '' || Number(v.maxStay) >= Number(v.minStay), {
    path: ['maxStay'],
    message: 'Maximum must be at least the minimum',
  });

/**
 * Day-by-day rate and inventory calendar with a bulk editor. Availability shown here is computed by the
 * server from settings, blocks and reservations; the form only sends the changes an admin asks for.
 */
export function RateCalendar({ roomId, plans, disabled, onChanged }) {
  const [from, setFrom] = useState(isoDay(30));
  const [to, setTo] = useState(isoDay(43));
  const [planId, setPlanId] = useState('');
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [applying, setApplying] = useState(false);

  const activePlanId = planId || (plans?.[0] ? String(plans[0].id) : '');

  const load = () => {
    if (!activePlanId && plans?.length) return;
    roomApi
      .calendar(roomId, { from, to, ratePlanId: activePlanId || undefined })
      .then((result) => {
        setData(result);
        setError(null);
      })
      .catch((err) => setError(normalizeError(err).message));
  };

  useEffect(() => {
    load();
    // Reload when the range or plan changes; the callbacks above close over the current values.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, from, to, activePlanId, plans?.length]);

  const form = useForm({
    resolver: zodResolver(bulkSchema),
    defaultValues: { from: isoDay(30), to: isoDay(43), ratePlanId: '', price: '', units: '', closure: 'KEEP', minStay: '', maxStay: '' },
    mode: 'onTouched',
  });
  const { register, handleSubmit, formState, watch, setValue } = form;
  const e = formState.errors;
  const bulkFrom = watch('from');
  const bulkTo = watch('to');

  const planById = useMemo(() => Object.fromEntries((plans ?? []).map((p) => [p.id, p])), [plans]);
  const activePlan = planById[Number(activePlanId)];

  const apply = async (values) => {
    setApplying(true);
    try {
      const body = { from: values.from, to: values.to };
      if (values.ratePlanId) body.ratePlanId = Number(values.ratePlanId);
      if (values.price !== '') body.basePriceMinor = rupeesToMinor(values.price);
      if (values.units !== '') body.units = Number(values.units);
      if (values.closure === 'CLOSE') body.isClosed = true;
      if (values.closure === 'OPEN') body.isClosed = false;
      if (values.minStay !== '') body.minStay = Number(values.minStay);
      if (values.maxStay !== '') body.maxStay = Number(values.maxStay);
      const result = await roomApi.bulkCalendar(roomId, body);
      setData(result);
      toast.success('Calendar updated');
      onChanged?.();
    } catch (err) {
      const normalized = normalizeError(err);
      if (!applyServerFieldErrors(form, normalized)) toast.error(normalized.message);
    } finally {
      setApplying(false);
    }
  };

  // Quick open and close for the whole visible range, without touching prices.
  const quickClosure = async (isClosed) => {
    setApplying(true);
    try {
      const result = await roomApi.bulkCalendar(roomId, { from, to, isClosed });
      setData(result);
      toast.success(isClosed ? 'Rooms closed for this range' : 'Rooms reopened for this range');
      onChanged?.();
    } catch (err) {
      toast.error(normalizeError(err).message);
    } finally {
      setApplying(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Bulk update</CardTitle>
          <CardDescription>Choose a date range, then change any of: price for a rate plan, rooms for sale, open or closed, and stay length. Fields left empty are not changed.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(apply)} noValidate className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <FormField id="bulk-from" label="From" error={e.from?.message}>
              <Input id="bulk-from" type="date" invalid={!!e.from} disabled={disabled} {...register('from')} />
            </FormField>
            <FormField id="bulk-to" label="To (inclusive)" error={e.to?.message}>
              <Input id="bulk-to" type="date" invalid={!!e.to} disabled={disabled} {...register('to')} />
            </FormField>
            <FormField id="bulk-plan" label="Rate plan" error={e.ratePlanId?.message}>
              <Select id="bulk-plan" invalid={!!e.ratePlanId} disabled={disabled} {...register('ratePlanId')}>
                <option value="">No price change</option>
                {(plans ?? []).map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </Select>
            </FormField>
            <FormField id="bulk-price" label="Price per night (₹)" error={e.price?.message} hint="Before tax and fees">
              <Input id="bulk-price" inputMode="decimal" placeholder="8999" invalid={!!e.price} disabled={disabled} {...register('price')} />
            </FormField>
            <FormField id="bulk-units" label="Rooms for sale" error={e.units?.message} hint="Leave empty to keep the room's count">
              <Input id="bulk-units" inputMode="numeric" invalid={!!e.units} disabled={disabled} {...register('units')} />
            </FormField>
            <FormField id="bulk-closure" label="Sales" error={e.closure?.message}>
              <Select id="bulk-closure" disabled={disabled} {...register('closure')}>
                <option value="KEEP">No change</option>
                <option value="OPEN">Open for sale</option>
                <option value="CLOSE">Close for sale</option>
              </Select>
            </FormField>
            <FormField id="bulk-min" label="Minimum nights" error={e.minStay?.message}>
              <Input id="bulk-min" inputMode="numeric" invalid={!!e.minStay} disabled={disabled} {...register('minStay')} />
            </FormField>
            <FormField id="bulk-max" label="Maximum nights" error={e.maxStay?.message}>
              <Input id="bulk-max" inputMode="numeric" invalid={!!e.maxStay} disabled={disabled} {...register('maxStay')} />
            </FormField>
            <div className="flex items-end gap-2 sm:col-span-2 xl:col-span-4">
              <Button type="submit" loading={applying} disabled={disabled}>Apply to {bulkFrom} → {bulkTo}</Button>
              <Button type="button" variant="secondary" disabled={disabled || applying} onClick={() => setValue('closure', 'KEEP')}>Reset</Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <CardTitle>Rate calendar</CardTitle>
            <CardDescription>
              {activePlan ? `${activePlan.name}: ${activePlan.mealPlan.toLowerCase().replaceAll('_', ' ')}` : 'Add a rate plan to see prices.'}
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <Input aria-label="Calendar from" type="date" value={from} onChange={(event) => setFrom(event.target.value)} className="h-9 w-40" />
            <Input aria-label="Calendar to" type="date" value={to} onChange={(event) => setTo(event.target.value)} className="h-9 w-40" />
            <Select aria-label="Calendar rate plan" value={activePlanId} onChange={(event) => setPlanId(event.target.value)} className="h-9 w-48">
              {(plans ?? []).map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </Select>
            <Button size="sm" variant="secondary" disabled={disabled || applying} onClick={() => quickClosure(true)}>
              <Lock className="h-3.5 w-3.5" aria-hidden="true" /> Close range
            </Button>
            <Button size="sm" variant="secondary" disabled={disabled || applying} onClick={() => quickClosure(false)}>
              <Unlock className="h-3.5 w-3.5" aria-hidden="true" /> Open range
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {error && <Alert tone="error">{error}</Alert>}
          {!data && !error && <Skeleton className="h-64 w-full" />}
          {data && (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-sm">
                <caption className="sr-only">Rates and availability by date</caption>
                <thead className="border-b border-[var(--border-subtle)] text-xs uppercase tracking-wide text-[var(--text-muted)]">
                  <tr>
                    <th scope="col" className="px-3 py-2 font-semibold">Date</th>
                    <th scope="col" className="px-3 py-2 font-semibold">Available</th>
                    <th scope="col" className="px-3 py-2 font-semibold">Rooms</th>
                    <th scope="col" className="px-3 py-2 font-semibold">Sale</th>
                    <th scope="col" className="px-3 py-2 font-semibold">Stay limits</th>
                    <th scope="col" className="px-3 py-2 text-right font-semibold">Base</th>
                    <th scope="col" className="px-3 py-2 text-right font-semibold">Discount</th>
                    <th scope="col" className="px-3 py-2 text-right font-semibold">Tax + fee</th>
                    <th scope="col" className="px-3 py-2 text-right font-semibold">Guest pays</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-subtle)]">
                  {data.days.map((day) => {
                    const rate = activePlanId ? day.rates[activePlanId] : null;
                    return (
                      <tr key={day.date} className={day.sellable === 0 ? 'bg-[var(--surface-muted)]/50' : ''}>
                        <td className="px-3 py-2 font-medium text-[var(--text-strong)]">{day.date}</td>
                        <td className="px-3 py-2">
                          <Badge tone={day.sellable === 0 ? 'danger' : day.sellable <= 2 ? 'warning' : 'success'}>{day.sellable}</Badge>
                        </td>
                        <td className="px-3 py-2 text-[var(--text-body)]">
                          {day.unitsOverride ?? day.totalUnits}
                          {(day.blocked > 0 || day.reserved > 0) && (
                            <span className="ml-2 text-xs text-[var(--text-muted)]">
                              {day.reserved > 0 && `${day.reserved} booked`}
                              {day.reserved > 0 && day.blocked > 0 && ' · '}
                              {day.blocked > 0 && `${day.blocked} blocked`}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          {day.isClosed ? <Badge tone="danger">Closed</Badge> : <Badge tone="success">Open</Badge>}
                        </td>
                        <td className="px-3 py-2 text-xs text-[var(--text-muted)]">
                          {day.minStay || day.maxStay ? `${day.minStay ?? 1}–${day.maxStay ?? '∞'} nights` : 'None'}
                        </td>
                        <td className="px-3 py-2 text-right">{rate ? formatMoney(rate.base) : '—'}</td>
                        <td className="px-3 py-2 text-right text-[var(--text-muted)]">{rate ? `−${formatMoney(rate.discount)}` : '—'}</td>
                        <td className="px-3 py-2 text-right text-[var(--text-muted)]">{rate ? formatMoney(rate.tax + rate.fee) : '—'}</td>
                        <td className="px-3 py-2 text-right font-semibold text-[var(--text-strong)]">{rate ? formatMoney(rate.final) : <span className="font-normal text-[var(--text-muted)]">No price</span>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
