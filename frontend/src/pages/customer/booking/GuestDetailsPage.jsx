import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@/components/ui/button.jsx';
import { Input, Textarea } from '@/components/ui/form-controls.jsx';
import { Card } from '@/components/ui/surfaces.jsx';
import { FormField, FullPageSpinner, EmptyState } from '@/components/shared/index.jsx';
import { BookingProgress } from '@/features/booking/components/BookingProgress.jsx';
import { HoldCountdown } from '@/features/booking/components/HoldCountdown.jsx';
import { HoldExpiredPanel } from '@/features/booking/components/HoldExpiredPanel.jsx';
import { StaySummary } from '@/features/booking/components/StaySummary.jsx';
import { buildGuestFormSchema, defaultGuestValues, toGuestDetailsPayload, ADULT_AGE } from '@/features/booking/bookingSchemas.js';
import { useHold } from '@/features/booking/useHold.js';
import { applyServerFieldErrors, normalizeError } from '@/services/api.js';
import { bookingApi } from '@/services/endpoints.js';
import { useDocumentMeta } from '@/hooks/useDocumentMeta.js';
import { useAuth } from '@/features/auth/AuthContext.jsx';

/** Step 3 of the booking: the lead guest's contact details and every guest's name and age, room by room. */
export function GuestDetailsPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const holdId = params.get('holdId');
  const coupon = params.get('coupon');
  const bookingPath = (path, id) => {
    const next = new URLSearchParams({ holdId: String(id) });
    if (coupon) next.set('coupon', coupon);
    return `${path}?${next}`;
  };
  const { hold, loading, error, reload } = useHold(holdId);

  useDocumentMeta({ title: 'Guest details | Gokaasa', description: 'Enter your guest details to continue your booking.' });

  // A refreshed page or a missing id recovers the guest's active hold from the server.
  useEffect(() => {
    if (holdId) return;
    bookingApi
      .activeHold()
      .then((active) => {
        if (active) navigate(bookingPath('/booking/guest-details', active.id), { replace: true });
        else navigate('/', { replace: true });
      })
      .catch(() => navigate('/', { replace: true }));
  }, [holdId, navigate]);

  useEffect(() => {
    if (!hold) return;
    if (hold.status === 'CONVERTED' && hold.bookingId) navigate(`/booking/confirmation/${hold.bookingId}`, { replace: true });
    else if (hold.status === 'HELD' && hold.bookingId) navigate(bookingPath('/booking/review', hold.id), { replace: true });
  }, [hold, navigate]);

  if (!holdId) return <FullPageSpinner label="Finding your room" />;
  if (loading) return <FullPageSpinner label="Loading your booking" />;
  if (error) {
    return (
      <div className="mx-auto max-w-xl px-4 py-16">
        <EmptyState
          title="We couldn't load your booking"
          description={error.message}
          action={<Button onClick={reload}>Try again</Button>}
        />
      </div>
    );
  }
  if (!hold) return null;

  const expired = hold.status === 'EXPIRED' || hold.status === 'RELEASED';
  return (
    <div className="guest-details-page mx-auto w-full max-w-6xl px-4 py-4 pb-28 sm:px-6 lg:pb-8">
      <BookingProgress current={2} />
      {expired ? (
        <HoldExpiredPanel />
      ) : (
        <div className="guest-details-layout grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <div className="guest-details-main min-w-0 space-y-3">
            <div className="guest-hold-countdown">
              <HoldCountdown expiresAt={hold.expiresAt} onExpire={reload} />
            </div>
            <GuestForm hold={hold} onSaved={() => navigate(bookingPath('/booking/review', hold.id))} onExpired={reload} />
          </div>
          <aside className="guest-details-summary lg:sticky lg:top-20 lg:self-start">
            <StaySummary quote={hold.quote} className="guest-stay-summary" />
          </aside>
        </div>
      )}
    </div>
  );
}

function GuestForm({ hold, onSaved, onExpired }) {
  const { user } = useAuth();
  const occupancy = hold.quote.stay.occupancy;
  const schema = useMemo(() => buildGuestFormSchema(), []);
  const form = useForm({
    resolver: zodResolver(schema),
    defaultValues: defaultGuestValues(occupancy, hold.guestDetails),
    mode: 'onBlur',
  });
  const { register, handleSubmit, formState, setValue, getValues, clearErrors } = form;
  const { errors, isSubmitting } = formState;
  const [submitError, setSubmitError] = useState(null);

  const userProfile = useMemo(() => {
    if (!user) return null;
    const firstName = user.firstName || (user.name ? user.name.split(' ')[0] : '') || '';
    const lastName = user.lastName || (user.name ? user.name.split(' ').slice(1).join(' ') : '') || '';
    const email = user.email || '';
    const mobile = user.phone || '';
    return { firstName, lastName, email, mobile };
  }, [user]);

  // Determine initial selection: if saved contact exists and its email differs from logged-in user, default to 'someone_else'.
  const initialBookingFor = useMemo(() => {
    const savedContact = hold.guestDetails?.primaryContact;
    if (savedContact?.email && userProfile?.email) {
      if (savedContact.email.trim().toLowerCase() !== userProfile.email.trim().toLowerCase()) {
        return 'someone_else';
      }
    }
    return 'myself';
  }, [hold.guestDetails, userProfile]);

  const [bookingFor, setBookingFor] = useState(initialBookingFor);
  const [someoneElseDraft, setSomeoneElseDraft] = useState(() => {
    const savedContact = hold.guestDetails?.primaryContact;
    if (savedContact?.email && userProfile?.email && savedContact.email.trim().toLowerCase() !== userProfile.email.trim().toLowerCase()) {
      return {
        firstName: savedContact.firstName || '',
        lastName: savedContact.lastName || '',
        email: savedContact.email || '',
        mobile: savedContact.mobile || '',
      };
    }
    return { firstName: '', lastName: '', email: '', mobile: '' };
  });

  // On mount or when user profile becomes ready: if in 'myself' mode and fields are empty, auto-fill profile details
  useEffect(() => {
    if (bookingFor === 'myself' && userProfile) {
      const currentValues = getValues('primaryContact');
      const isBlank = !currentValues?.firstName && !currentValues?.email;
      if (isBlank) {
        if (userProfile.firstName) setValue('primaryContact.firstName', userProfile.firstName, { shouldValidate: true });
        if (userProfile.lastName) setValue('primaryContact.lastName', userProfile.lastName, { shouldValidate: true });
        if (userProfile.email) setValue('primaryContact.email', userProfile.email, { shouldValidate: true });
        if (userProfile.mobile) setValue('primaryContact.mobile', userProfile.mobile, { shouldValidate: true });
      }
    }
  }, [userProfile, bookingFor, setValue, getValues]);

  const handleSelectBookingFor = (choice) => {
    if (choice === bookingFor) return;

    if (choice === 'myself') {
      // Save current input before switching so it's not lost
      const current = getValues('primaryContact');
      setSomeoneElseDraft({
        firstName: current?.firstName || '',
        lastName: current?.lastName || '',
        email: current?.email || '',
        mobile: current?.mobile || '',
      });

      setBookingFor('myself');
      clearErrors(['primaryContact.firstName', 'primaryContact.lastName', 'primaryContact.email', 'primaryContact.mobile']);

      if (userProfile) {
        setValue('primaryContact.firstName', userProfile.firstName || '', { shouldValidate: true, shouldDirty: true });
        setValue('primaryContact.lastName', userProfile.lastName || '', { shouldValidate: true, shouldDirty: true });
        setValue('primaryContact.email', userProfile.email || '', { shouldValidate: true, shouldDirty: true });
        setValue('primaryContact.mobile', userProfile.mobile || '', { shouldValidate: true, shouldDirty: true });
      }
    } else {
      setBookingFor('someone_else');
      clearErrors(['primaryContact.firstName', 'primaryContact.lastName', 'primaryContact.email', 'primaryContact.mobile']);

      // Restore previously typed someone-else details, or blank
      setValue('primaryContact.firstName', someoneElseDraft.firstName || '', { shouldValidate: false, shouldDirty: true });
      setValue('primaryContact.lastName', someoneElseDraft.lastName || '', { shouldValidate: false, shouldDirty: true });
      setValue('primaryContact.email', someoneElseDraft.email || '', { shouldValidate: false, shouldDirty: true });
      setValue('primaryContact.mobile', someoneElseDraft.mobile || '', { shouldValidate: false, shouldDirty: true });

      setTimeout(() => {
        document.getElementById('pc-first')?.focus();
      }, 50);
    }
  };

  const submit = async (values) => {
    setSubmitError(null);
    try {
      await bookingApi.saveGuests(hold.id, toGuestDetailsPayload(values));
      onSaved();
    } catch (err) {
      const normalized = normalizeError(err);
      if (normalized.details?.code === 'HOLD_EXPIRED') {
        onExpired();
        return;
      }
      if (!applyServerFieldErrors(form, err)) setSubmitError(normalized.message);
    }
  };

  return (
    <form id="guest-details-form" onSubmit={handleSubmit(submit)} noValidate className="guest-details-form space-y-3" aria-label="Guest details">
      {submitError && <p role="alert" className="rounded-[var(--radius-control)] bg-danger-50 px-4 py-3 text-sm text-danger-600">{submitError}</p>}

      <Card className="guest-form-card guest-contact-card space-y-4 p-4">
        <div>
          <h2 className="text-base font-semibold text-[var(--text-strong)]">Lead guest</h2>
          <p className="text-sm text-[var(--text-muted)]">Booking confirmations and important updates go to this person.</p>
        </div>

        {/* Simple radio selector matching screenshot */}
        <div className="space-y-2 pt-1 pb-1">
          <p className="text-sm font-bold text-[var(--text-strong)]">
            I am booking for
          </p>
          <div className="flex items-center gap-6" role="radiogroup" aria-label="I am booking for">
            <label className="group inline-flex items-center gap-2 cursor-pointer text-sm font-medium text-[var(--text-strong)] select-none">
              <span
                className={`flex h-4 w-4 items-center justify-center rounded-full border transition-colors ${
                  bookingFor === 'myself'
                    ? 'border-[#0084ff] bg-white ring-1 ring-[#0084ff]'
                    : 'border-zinc-400 group-hover:border-zinc-600'
                }`}
              >
                {bookingFor === 'myself' && (
                  <span className="h-2 w-2 rounded-full bg-[#0084ff]" />
                )}
              </span>
              <input
                type="radio"
                name="bookingFor"
                value="myself"
                checked={bookingFor === 'myself'}
                onChange={() => handleSelectBookingFor('myself')}
                className="sr-only"
              />
              <span>Myself</span>
            </label>

            <label className="group inline-flex items-center gap-2 cursor-pointer text-sm font-medium text-[var(--text-strong)] select-none">
              <span
                className={`flex h-4 w-4 items-center justify-center rounded-full border transition-colors ${
                  bookingFor === 'someone_else'
                    ? 'border-[#0084ff] bg-white ring-1 ring-[#0084ff]'
                    : 'border-zinc-400 group-hover:border-zinc-600'
                }`}
              >
                {bookingFor === 'someone_else' && (
                  <span className="h-2 w-2 rounded-full bg-[#0084ff]" />
                )}
              </span>
              <input
                type="radio"
                name="bookingFor"
                value="someone_else"
                checked={bookingFor === 'someone_else'}
                onChange={() => handleSelectBookingFor('someone_else')}
                className="sr-only"
              />
              <span>Someone Else</span>
            </label>
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField id="pc-first" label="First name" error={errors.primaryContact?.firstName?.message}>
            <Input id="pc-first" autoComplete="given-name" invalid={!!errors.primaryContact?.firstName} {...register('primaryContact.firstName')} />
          </FormField>
          <FormField id="pc-last" label="Last name" error={errors.primaryContact?.lastName?.message}>
            <Input id="pc-last" autoComplete="family-name" invalid={!!errors.primaryContact?.lastName} {...register('primaryContact.lastName')} />
          </FormField>
          <FormField id="pc-email" label="Email" error={errors.primaryContact?.email?.message}>
            <Input id="pc-email" type="email" autoComplete="email" invalid={!!errors.primaryContact?.email} {...register('primaryContact.email')} />
          </FormField>
          <FormField id="pc-mobile" label="Mobile" hint="Include the country code if you are outside India." error={errors.primaryContact?.mobile?.message}>
            <Input id="pc-mobile" type="tel" autoComplete="tel" inputMode="tel" invalid={!!errors.primaryContact?.mobile} {...register('primaryContact.mobile')} />
          </FormField>
        </div>
      </Card>

      {occupancy.map((room, roomIndex) => {
        const children = room.childAges.length;
        return (
          <Card key={roomIndex} className="guest-form-card guest-room-card space-y-4 p-4" aria-labelledby={`room-${roomIndex}-title`}>
            <div>
              <h2 id={`room-${roomIndex}-title`} className="text-base font-semibold text-[var(--text-strong)]">
                Room {roomIndex + 1}
              </h2>
              <p className="text-sm text-[var(--text-muted)]">
                {room.adults} adult{room.adults === 1 ? '' : 's'}
                {children ? ` and ${children} child${children === 1 ? '' : 'ren'}` : ''}. Guests under {ADULT_AGE} count as children.
                {' '}Naming each guest is optional -- anyone you skip can be added at check-in.
              </p>
            </div>
            {Array.from({ length: room.adults + children }).map((_, guestIndex) => {
              const isChild = guestIndex >= room.adults;
              const base = `rooms.${roomIndex}.guests.${guestIndex}`;
              const guestErrors = errors.rooms?.[roomIndex]?.guests?.[guestIndex];
              return (
                <fieldset key={guestIndex} className="guest-entry-row grid gap-3 rounded-[var(--radius-control)] border border-[var(--border-subtle)] p-3 sm:grid-cols-[1fr_1fr_6rem]">
                  <legend className="px-1 text-sm font-medium text-[var(--text-strong)]">
                    Guest {guestIndex + 1} · {isChild ? 'Child' : 'Adult'}
                    <span className="font-normal text-[var(--text-muted)]"> (optional)</span>
                  </legend>
                  <FormField id={`${base}-first`} label="First name" error={guestErrors?.firstName?.message}>
                    <Input id={`${base}-first`} invalid={!!guestErrors?.firstName} {...register(`${base}.firstName`)} />
                  </FormField>
                  <FormField id={`${base}-last`} label="Last name" error={guestErrors?.lastName?.message}>
                    <Input id={`${base}-last`} invalid={!!guestErrors?.lastName} {...register(`${base}.lastName`)} />
                  </FormField>
                  <FormField id={`${base}-age`} label="Age" error={guestErrors?.age?.message}>
                    <Input id={`${base}-age`} type="number" inputMode="numeric" min={0} max={120} invalid={!!guestErrors?.age} {...register(`${base}.age`)} />
                  </FormField>
                </fieldset>
              );
            })}
          </Card>
        );
      })}

      <Card className="guest-form-card guest-extras-card space-y-4 p-4">
        <div>
          <h2 className="text-base font-semibold text-[var(--text-strong)]">Company and requests <span className="font-normal text-[var(--text-muted)]">(optional)</span></h2>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField id="gst" label="GST number" error={errors.gstNumber?.message}>
            <Input id="gst" autoCapitalize="characters" invalid={!!errors.gstNumber} {...register('gstNumber')} />
          </FormField>
          <FormField id="company" label="Company name" error={errors.companyName?.message}>
            <Input id="company" invalid={!!errors.companyName} {...register('companyName')} />
          </FormField>
        </div>
        <FormField id="billing-address" label="Billing address" error={errors.billingAddress?.message}>
          <Textarea id="billing-address" rows={2} invalid={!!errors.billingAddress} {...register('billingAddress')} />
        </FormField>
        <FormField id="special" label="Special requests" hint="The hotel will try to meet requests, but cannot guarantee them." error={errors.specialRequest?.message}>
          <Textarea id="special" rows={3} invalid={!!errors.specialRequest} {...register('specialRequest')} />
        </FormField>
      </Card>

      <div className="hidden lg:block">
        <Button type="submit" size="lg" className="w-full" loading={isSubmitting}>
          Continue to review
        </Button>
      </div>

      {/* Mobile: a sticky action bar that stays in reach while the form scrolls. */}
      <div className="mobile-booking-action-bar fixed inset-x-0 bottom-0 z-30 border-t border-[var(--border-subtle)] bg-[var(--surface-card)] p-3 shadow-lg lg:hidden">
        <Button type="submit" form="guest-details-form" size="lg" className="w-full" loading={isSubmitting}>
          Continue to review
        </Button>
      </div>
    </form>
  );
}

