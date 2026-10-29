import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Archive, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { Alert, Badge, Card, CardContent, CardDescription, CardHeader, CardTitle, Skeleton } from '@/components/ui/surfaces.jsx';
import { Button } from '@/components/ui/button.jsx';
import { Checkbox, Input, Textarea } from '@/components/ui/form-controls.jsx';
import { Modal } from '@/components/ui/dialog.jsx';
import { FormField } from '@/components/shared/index.jsx';
import { roomApi } from '@/services/endpoints.js';
import { applyServerFieldErrors, normalizeError } from '@/services/api.js';

const policySchema = z
  .object({
    code: z.string().trim().toUpperCase().regex(/^[A-Z][A-Z0-9_]{1,39}$/, 'Use letters, digits and underscores'),
    name: z.string().trim().min(2, 'Name is required').max(120),
    description: z.string().trim().max(500),
    isNonRefundable: z.boolean(),
    deadlineHours: z.string().regex(/^(\d+)?$/, 'Enter whole hours'),
    refundPercent: z.string().regex(/^\d{1,3}$/, 'Enter 0 to 100').refine((v) => Number(v) <= 100, 'Enter 0 to 100'),
  })
  .superRefine((v, ctx) => {
    if (v.isNonRefundable && (v.refundPercent !== '0' || v.deadlineHours !== '')) {
      ctx.addIssue({ code: 'custom', path: ['isNonRefundable'], message: 'A non-refundable policy has no deadline and refunds nothing' });
    }
    if (!v.isNonRefundable && Number(v.refundPercent) > 0 && v.deadlineHours === '') {
      ctx.addIssue({ code: 'custom', path: ['deadlineHours'], message: 'Set how many hours before check-in the refund applies' });
    }
  });

function toPayload(values) {
  return {
    code: values.code,
    name: values.name,
    description: values.description || null,
    isNonRefundable: values.isNonRefundable,
    cancellationDeadlineHours: values.isNonRefundable || values.deadlineHours === '' ? null : Number(values.deadlineHours),
    refundPercent: values.isNonRefundable ? 0 : Number(values.refundPercent),
  };
}

function PolicyDialog({ open, onClose, hotelId, policy, onSaved }) {
  const form = useForm({
    resolver: zodResolver(policySchema),
    defaultValues: blank(policy),
    mode: 'onTouched',
  });
  const { register, handleSubmit, formState, reset, watch } = form;
  const e = formState.errors;
  const nonRefundable = watch('isNonRefundable');

  useEffect(() => {
    if (open) reset(blank(policy));
  }, [open, policy, reset]);

  const submit = async (values) => {
    try {
      const payload = toPayload(values);
      const saved = policy ? await roomApi.updatePolicy(policy.id, payload) : await roomApi.createPolicy(hotelId, payload);
      toast.success(policy ? 'Policy saved' : 'Policy created');
      onSaved(saved);
    } catch (error) {
      const normalized = normalizeError(error);
      if (!applyServerFieldErrors(form, normalized)) toast.error(normalized.message);
    }
  };

  return (
    <Modal open={open} title={policy ? `Edit ${policy.name}` : 'New cancellation policy'} onClose={onClose}>
      <form onSubmit={handleSubmit(submit)} noValidate className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField id="pol-name" label="Name" error={e.name?.message}>
            <Input id="pol-name" invalid={!!e.name} {...register('name')} />
          </FormField>
          <FormField id="pol-code" label="Code" error={e.code?.message}>
            <Input id="pol-code" className="uppercase" invalid={!!e.code} {...register('code')} />
          </FormField>
          <FormField id="pol-desc" label="Description (guests see this)" error={e.description?.message} className="sm:col-span-2">
            <Textarea id="pol-desc" rows={2} {...register('description')} />
          </FormField>
          <div className="sm:col-span-2">
            <Checkbox label="Non-refundable: no refund once booked" {...register('isNonRefundable')} />
          </div>
          {!nonRefundable && (
            <>
              <FormField id="pol-deadline" label="Deadline (hours before check-in)" error={e.deadlineHours?.message} hint="Example: 24 for one day">
                <Input id="pol-deadline" inputMode="numeric" invalid={!!e.deadlineHours} {...register('deadlineHours')} />
              </FormField>
              <FormField id="pol-refund" label="Refund if cancelled before the deadline cut-off (%)" error={e.refundPercent?.message} hint="100 = free cancellation">
                <Input id="pol-refund" inputMode="numeric" invalid={!!e.refundPercent} {...register('refundPercent')} />
              </FormField>
            </>
          )}
          {e.isNonRefundable && <Alert tone="error" className="sm:col-span-2">{e.isNonRefundable.message}</Alert>}
        </div>
        <div className="flex justify-end gap-3">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={formState.isSubmitting}>{policy ? 'Save policy' : 'Create policy'}</Button>
        </div>
      </form>
    </Modal>
  );
}

function blank(policy) {
  if (!policy) return { code: '', name: '', description: '', isNonRefundable: false, deadlineHours: '24', refundPercent: '100' };
  return {
    code: policy.code,
    name: policy.name,
    description: policy.description ?? '',
    isNonRefundable: policy.isNonRefundable,
    deadlineHours: policy.cancellationDeadlineHours == null ? '' : String(policy.cancellationDeadlineHours),
    refundPercent: String(policy.refundPercent),
  };
}

/** Reusable cancellation policies for the hotel. Rates choose one; the refund rule is applied at quote time. */
export function CancellationPoliciesPanel({ hotelId, disabled }) {
  const [policies, setPolicies] = useState(null);
  const [error, setError] = useState(null);
  const [editing, setEditing] = useState(null);
  const [creating, setCreating] = useState(false);

  const load = () => roomApi.policies(hotelId).then(setPolicies).catch((err) => setError(normalizeError(err).message));
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hotelId]);

  const archive = async (policy) => {
    try {
      await roomApi.archivePolicy(policy.id);
      toast.success('Policy archived');
      load();
    } catch (err) {
      toast.error(normalizeError(err).message);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle>Cancellation policies</CardTitle>
          <CardDescription>Reusable terms. Each rate plan points at one policy, so different rates can have different refund rules.</CardDescription>
        </div>
        {!disabled && (
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4" aria-hidden="true" /> New policy
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {error && <Alert tone="error">{error}</Alert>}
        {policies === null && !error && <Skeleton className="h-24 w-full" />}
        {policies?.map((policy) => (
          <div key={policy.id} className="flex flex-col gap-3 rounded-lg border border-[var(--border-subtle)] p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-medium text-[var(--text-strong)]">{policy.name}</p>
                <span className="font-mono text-xs text-[var(--text-muted)]">{policy.code}</span>
                {policy.isNonRefundable ? <Badge tone="danger">Non-refundable</Badge> : <Badge tone="success">Refundable</Badge>}
                {policy.status === 'INACTIVE' && <Badge tone="warning">Inactive</Badge>}
              </div>
              <p className="text-sm text-[var(--text-body)]">{policy.summary}</p>
              {policy.description && <p className="text-xs text-[var(--text-muted)]">{policy.description}</p>}
            </div>
            {!disabled && (
              <div className="flex gap-2">
                <Button variant="secondary" size="sm" onClick={() => setEditing(policy)}>Edit</Button>
                <Button variant="danger-outline" size="sm" onClick={() => archive(policy)}>
                  <Archive className="h-4 w-4" aria-hidden="true" /> Archive
                </Button>
              </div>
            )}
          </div>
        ))}
      </CardContent>

      <PolicyDialog
        open={creating || editing !== null}
        onClose={() => {
          setCreating(false);
          setEditing(null);
        }}
        hotelId={hotelId}
        policy={editing}
        onSaved={() => {
          setCreating(false);
          setEditing(null);
          load();
        }}
      />
    </Card>
  );
}
