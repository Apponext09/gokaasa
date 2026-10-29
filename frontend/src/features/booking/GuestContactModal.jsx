import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Modal } from '@/components/ui/dialog.jsx';
import { Button } from '@/components/ui/button.jsx';
import { Input } from '@/components/ui/form-controls.jsx';
import { FormField } from '@/components/shared/index.jsx';
import { primaryContactSchema } from '@/features/booking/bookingSchemas.js';
import { useAuth } from '@/features/auth/AuthContext.jsx';
import { applyServerFieldErrors, normalizeError } from '@/services/api.js';

/**
 * Feature 2: shown instead of a login redirect when an unauthenticated visitor tries to book a room.
 * Reuses the exact same name/email/mobile rules as the guest-details step (primaryContactSchema) --
 * this contact becomes that same lead-guest contact a moment later, so the two should never diverge.
 * On submit, a real session is issued transparently (useAuth().guestCheckout) and the caller's normal
 * "continue" action resumes exactly as it would for an already-logged-in customer.
 */
export function GuestContactModal({ open, onClose, onContinue }) {
  const { guestCheckout } = useAuth();
  const [submitError, setSubmitError] = useState(null);
  const form = useForm({
    resolver: zodResolver(primaryContactSchema),
    defaultValues: { firstName: '', lastName: '', email: '', mobile: '' },
    mode: 'onBlur',
  });
  const { register, handleSubmit, formState } = form;
  const { errors, isSubmitting } = formState;

  const submit = async (values) => {
    setSubmitError(null);
    try {
      await guestCheckout(values);
      onContinue();
    } catch (err) {
      const normalized = normalizeError(err);
      if (!applyServerFieldErrors(form, normalized)) setSubmitError(normalized.message);
    }
  };

  return (
    <Modal open={open} title="Continue as a guest" onClose={onClose}>
      <form onSubmit={handleSubmit(submit)} noValidate className="space-y-4">
        <p className="text-sm text-[var(--text-muted)]">
          No account needed. We just need a way to reach you about this booking.
        </p>
        {submitError && <p role="alert" className="rounded-[var(--radius-control)] bg-danger-50 px-4 py-3 text-sm text-danger-600">{submitError}</p>}
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField id="gc-first" label="First name" error={errors.firstName?.message}>
            <Input id="gc-first" autoComplete="given-name" invalid={!!errors.firstName} {...register('firstName')} />
          </FormField>
          <FormField id="gc-last" label="Last name" error={errors.lastName?.message}>
            <Input id="gc-last" autoComplete="family-name" invalid={!!errors.lastName} {...register('lastName')} />
          </FormField>
          <FormField id="gc-email" label="Email" error={errors.email?.message}>
            <Input id="gc-email" type="email" autoComplete="email" invalid={!!errors.email} {...register('email')} />
          </FormField>
          <FormField id="gc-mobile" label="Mobile" hint="Include the country code if you are outside India." error={errors.mobile?.message}>
            <Input id="gc-mobile" type="tel" autoComplete="tel" inputMode="tel" invalid={!!errors.mobile} {...register('mobile')} />
          </FormField>
        </div>
        <div className="flex items-center justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button type="submit" loading={isSubmitting}>
            Continue
          </Button>
        </div>
      </form>
    </Modal>
  );
}
