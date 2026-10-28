import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Plus, ShieldCheck, Undo2 } from 'lucide-react';
import { toast } from 'sonner';
import { Alert, Badge, Card, CardContent, CardDescription, CardHeader, CardTitle, Skeleton } from '@/components/ui/surfaces.jsx';
import { Button } from '@/components/ui/button.jsx';
import { Checkbox, Input, Select, Textarea } from '@/components/ui/form-controls.jsx';
import { Modal } from '@/components/ui/dialog.jsx';
import { EmptyState, FormField, formatMoney } from '@/components/shared/index.jsx';
import {
  EMPTY_RATE_PLAN_FORM,
  minorToRupees,
  ratePlanFormSchema,
  toRatePlanPayload,
} from '@/features/rooms/roomForm.js';
import { roomApi } from '@/services/endpoints.js';
import { applyServerFieldErrors, normalizeError } from '@/services/api.js';
import { useCatalog } from '@/features/catalogs/useCatalog.js';
import { toOptions } from '@/features/catalogs/catalogs.js';

/** Form values for a plan, or blank values for a new one. */
function valuesFor(plan, defaultMealPlan = 'ROOM_ONLY') {
  if (!plan) return { ...EMPTY_RATE_PLAN_FORM, mealPlan: defaultMealPlan };
  return {
    code: plan.code,
    name: plan.name,
    description: plan.description ?? '',
    mealPlan: plan.mealPlan,
    isRefundable: plan.isRefundable,
    cancellationPolicyId: plan.cancellationPolicyId ? String(plan.cancellationPolicyId) : '',
    discountPercent: String(plan.discountPercent),
    taxPercent: String(plan.taxPercent),
    feeRupees: minorToRupees(plan.feeMinor),
    status: plan.status,
  };
}

function RatePlanDialog({ open, onClose, roomId, policies, plan, onSaved, mealPlanOptions }) {
  // The dialog stays mounted between edits, so the form is reset from the selected plan each time it opens.
  const form = useForm({ resolver: zodResolver(ratePlanFormSchema), defaultValues: valuesFor(plan, mealPlanOptions[0]?.value), mode: 'onTouched' });
  const { register, handleSubmit, formState, reset } = form;
  const e = formState.errors;

  useEffect(() => {
    if (open) reset(valuesFor(plan, mealPlanOptions[0]?.value));
  }, [open, mealPlanOptions, plan, reset]);

  const onSubmit = async (values) => {
    try {
      const payload = toRatePlanPayload(values);
      const saved = plan ? await roomApi.updateRatePlan(plan.id, payload) : await roomApi.createRatePlan(roomId, payload);
      toast.success(plan ? 'Rate plan saved' : 'Rate plan created');
      onSaved(saved);
    } catch (error) {
      const normalized = normalizeError(error);
      if (!applyServerFieldErrors(form, normalized)) toast.error(normalized.message);
    }
  };

  return (
    <Modal open={open} title={plan ? `Edit ${plan.name}` : 'New rate plan'} onClose={onClose} wide>
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField id="rp-name" label="Name" error={e.name?.message}>
            <Input id="rp-name" invalid={!!e.name} placeholder="Breakfast Included" {...register('name')} />
          </FormField>
          <FormField id="rp-code" label="Code" error={e.code?.message} hint="Unique for this room">
            <Input id="rp-code" invalid={!!e.code} className="uppercase" {...register('code')} />
          </FormField>
          <FormField id="rp-meal" label="Meal plan" error={e.mealPlan?.message}>
            <Select id="rp-meal" invalid={!!e.mealPlan} {...register('mealPlan')}>
              {mealPlanOptions.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </Select>
          </FormField>
          <FormField id="rp-policy" label="Cancellation policy" error={e.cancellationPolicyId?.message}>
            <Select id="rp-policy" invalid={!!e.cancellationPolicyId} {...register('cancellationPolicyId')}>
              <option value="">Choose a policy</option>
              {policies.filter((p) => p.status === 'ACTIVE').map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </Select>
          </FormField>
          <FormField id="rp-discount" label="Discount (%)" error={e.discountPercent?.message}>
            <Input id="rp-discount" type="number" inputMode="decimal" min={0} max={100} step="0.01" invalid={!!e.discountPercent} {...register('discountPercent')} />
          </FormField>
          <FormField id="rp-tax" label="Tax (%)" error={e.taxPercent?.message} hint="Applied after discount">
            <Input id="rp-tax" type="number" inputMode="decimal" min={0} max={100} step="0.01" invalid={!!e.taxPercent} {...register('taxPercent')} />
          </FormField>
          <FormField id="rp-fee" label="Extra fee per night (₹)" error={e.feeRupees?.message}>
            <Input id="rp-fee" inputMode="decimal" invalid={!!e.feeRupees} {...register('feeRupees')} />
          </FormField>
          <FormField id="rp-status" label="Status" error={e.status?.message}>
            <Select id="rp-status" {...register('status')}>
              <option value="ACTIVE">Active</option>
              <option value="INACTIVE">Inactive</option>
            </Select>
          </FormField>
          <div className="sm:col-span-2">
            <Checkbox label="Refundable rate (the policy decides how much)" {...register('isRefundable')} />
          </div>
          <FormField id="rp-description" label="Description" error={e.description?.message} className="sm:col-span-2">
            <Textarea id="rp-description" {...register('description')} />
          </FormField>
        </div>
        <div className="flex justify-end gap-3">
          <Button variant="secondary" type="button" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={formState.isSubmitting}>{plan ? 'Save rate plan' : 'Create rate plan'}</Button>
        </div>
      </form>
    </Modal>
  );
}

/** Rate plans for one room type. Prices are set per date in the calendar; a plan defines what is included. */
export function RatePlansPanel({ roomId, policies, disabled, onChanged }) {
  const { items: mealPlans } = useCatalog('meal-plans');
  const mealPlanOptions = useMemo(() => toOptions(mealPlans), [mealPlans]);
  const mealPlanLabels = useMemo(() => new Map(mealPlanOptions.map((option) => [option.value, option.label])), [mealPlanOptions]);
  const [plans, setPlans] = useState(null);
  const [editing, setEditing] = useState(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState(null);

  const load = () => roomApi.ratePlans(roomId).then(setPlans).catch((err) => setError(normalizeError(err).message));
  useEffect(() => {
    load();
    // load is recreated each render; it only needs to run when the room changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId]);

  const saved = () => {
    setEditing(null);
    setCreating(false);
    load();
    onChanged?.();
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle>Rate plans</CardTitle>
          <CardDescription>What each price includes: meals, refundability and the cancellation policy. Set prices per night in the calendar.</CardDescription>
        </div>
        <Button size="sm" disabled={disabled} onClick={() => setCreating(true)}>
          <Plus className="h-4 w-4" aria-hidden="true" /> New rate plan
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {error && <Alert tone="error">{error}</Alert>}
        {plans === null && !error && <Skeleton className="h-24 w-full" />}
        {plans?.length === 0 && (
          <EmptyState title="No rate plans yet" description="Create one, such as Room Only or Breakfast Included, then set its prices in the calendar." />
        )}
        {plans?.map((plan) => (
          <div key={plan.id} className="flex flex-col gap-3 rounded-lg border border-[var(--border-subtle)] p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0 space-y-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-medium text-[var(--text-strong)]">{plan.name}</p>
                <span className="font-mono text-xs text-[var(--text-muted)]">{plan.code}</span>
                <Badge tone={plan.status === 'ACTIVE' ? 'success' : 'warning'}>{plan.status === 'ACTIVE' ? 'Active' : 'Inactive'}</Badge>
                <Badge tone="brand">{plan.mealPlanName ?? mealPlanLabels.get(plan.mealPlan) ?? plan.mealPlan.replaceAll('_', ' ').toLowerCase()}</Badge>
                {plan.isRefundable ? (
                  <Badge tone="neutral"><ShieldCheck className="h-3 w-3" aria-hidden="true" /> Refundable</Badge>
                ) : (
                  <Badge tone="danger"><Undo2 className="h-3 w-3" aria-hidden="true" /> Non-refundable</Badge>
                )}
              </div>
              <p className="text-xs text-[var(--text-muted)]">
                Policy: {plan.cancellationPolicy?.name ?? 'None'} · discount {plan.discountPercent}% · tax {plan.taxPercent}% · fee {formatMoney(plan.feeMinor)} per night
              </p>
            </div>
            <Button variant="secondary" size="sm" disabled={disabled} onClick={() => setEditing(plan)}>
              Edit
            </Button>
          </div>
        ))}
      </CardContent>

      <RatePlanDialog
        open={creating || editing !== null}
        onClose={() => {
          setCreating(false);
          setEditing(null);
        }}
        roomId={roomId}
        policies={policies}
        plan={editing}
        onSaved={saved}
        mealPlanOptions={mealPlanOptions}
      />
    </Card>
  );
}
