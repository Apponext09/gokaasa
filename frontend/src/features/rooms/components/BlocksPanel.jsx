import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Alert, Badge, Card, CardContent, CardDescription, CardHeader, CardTitle, Skeleton } from '@/components/ui/surfaces.jsx';
import { Button } from '@/components/ui/button.jsx';
import { Input, Select, Textarea } from '@/components/ui/form-controls.jsx';
import { Modal } from '@/components/ui/dialog.jsx';
import { EmptyState, FormField } from '@/components/shared/index.jsx';
import { roomApi } from '@/services/endpoints.js';
import { applyServerFieldErrors, normalizeError } from '@/services/api.js';

const REASONS = [
  { value: 'MAINTENANCE', label: 'Maintenance' },
  { value: 'OWNER_USE', label: 'Owner use' },
  { value: 'OTHER', label: 'Other' },
];

const blockSchema = z
  .object({
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Choose a start date'),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Choose an end date'),
    quantity: z.string().regex(/^\d+$/, 'Enter a whole number').refine((v) => Number(v) >= 1, 'At least 1 room'),
    reason: z.enum(['MAINTENANCE', 'OWNER_USE', 'OTHER']),
    note: z.string().trim().max(300, 'Use at most 300 characters'),
  })
  .refine((v) => v.endDate > v.startDate, { path: ['endDate'], message: 'The block must cover at least one night' });

/** Rooms taken out of sale for a date range (maintenance, owner use). Blocks reduce availability, never stored counts. */
export function BlocksPanel({ roomId, disabled, onChanged }) {
  const [blocks, setBlocks] = useState(null);
  const [error, setError] = useState(null);
  const [open, setOpen] = useState(false);

  const load = () => roomApi.blocks(roomId).then(setBlocks).catch((err) => setError(normalizeError(err).message));
  useEffect(() => {
    load();
    // Reload per room; load is rebuilt on each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId]);

  const form = useForm({
    resolver: zodResolver(blockSchema),
    defaultValues: { startDate: '', endDate: '', quantity: '1', reason: 'MAINTENANCE', note: '' },
    mode: 'onTouched',
  });
  const { register, handleSubmit, formState, reset } = form;
  const e = formState.errors;

  const create = async (values) => {
    try {
      await roomApi.createBlock(roomId, { ...values, quantity: Number(values.quantity), note: values.note || undefined });
      toast.success('Rooms blocked');
      setOpen(false);
      reset();
      load();
      onChanged?.();
    } catch (err) {
      const normalized = normalizeError(err);
      if (!applyServerFieldErrors(form, normalized)) toast.error(normalized.message);
    }
  };

  const remove = async (block) => {
    try {
      await roomApi.deleteBlock(block.id);
      toast.success('Block removed');
      load();
      onChanged?.();
    } catch (err) {
      toast.error(normalizeError(err).message);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle>Blocked rooms</CardTitle>
          <CardDescription>Rooms out of sale for maintenance or owner use. A block cannot take rooms that guests have already booked.</CardDescription>
        </div>
        <Button size="sm" disabled={disabled} onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4" aria-hidden="true" /> Block rooms
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {error && <Alert tone="error">{error}</Alert>}
        {blocks === null && !error && <Skeleton className="h-16 w-full" />}
        {blocks?.length === 0 && <EmptyState title="No blocks" description="Nothing is taken out of sale." />}
        {blocks?.map((block) => (
          <div key={block.id} className="flex items-center justify-between gap-3 rounded-lg border border-[var(--border-subtle)] p-3 text-sm">
            <div className="space-y-1">
              <p className="font-medium text-[var(--text-strong)]">
                {block.quantity} room{block.quantity === 1 ? '' : 's'} · {block.startDate} to {block.endDate} (checkout day excluded)
              </p>
              <p className="text-xs text-[var(--text-muted)]">
                <Badge tone="neutral">{REASONS.find((r) => r.value === block.reason)?.label}</Badge> {block.note}
              </p>
            </div>
            <Button variant="danger-outline" size="sm" disabled={disabled} onClick={() => remove(block)}>
              <Trash2 className="h-4 w-4" aria-hidden="true" /> Remove
            </Button>
          </div>
        ))}
      </CardContent>

      <Modal open={open} title="Block rooms" onClose={() => setOpen(false)}>
        <form onSubmit={handleSubmit(create)} noValidate className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField id="block-start" label="First night" error={e.startDate?.message}>
              <Input id="block-start" type="date" invalid={!!e.startDate} {...register('startDate')} />
            </FormField>
            <FormField id="block-end" label="Checkout day" error={e.endDate?.message}>
              <Input id="block-end" type="date" invalid={!!e.endDate} {...register('endDate')} />
            </FormField>
            <FormField id="block-qty" label="Rooms" error={e.quantity?.message}>
              <Input id="block-qty" inputMode="numeric" invalid={!!e.quantity} {...register('quantity')} />
            </FormField>
            <FormField id="block-reason" label="Reason" error={e.reason?.message}>
              <Select id="block-reason" {...register('reason')}>
                {REASONS.map((r) => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </Select>
            </FormField>
            <FormField id="block-note" label="Note (internal)" error={e.note?.message} className="sm:col-span-2">
              <Textarea id="block-note" rows={2} {...register('note')} />
            </FormField>
          </div>
          <div className="flex justify-end gap-3">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" loading={formState.isSubmitting}>Block rooms</Button>
          </div>
        </form>
      </Modal>
    </Card>
  );
}
