import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowRight } from 'lucide-react';
import { Alert, Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/surfaces.jsx';
import { Button } from '@/components/ui/button.jsx';
import { Input, Select } from '@/components/ui/form-controls.jsx';
import { FormField, Logo } from '@/components/shared/index.jsx';
import { partnerRegisterSchema, BUSINESS_TYPE_OPTIONS } from '@/features/partner/schemas.js';
import { applyServerFieldErrors, normalizeError } from '@/services/api.js';
import { partnerApi } from '@/services/endpoints.js';

/** Public: account + business + property basics in one step. OTP verification follows on the next page. */
export function PartnerRegisterPage() {
  const navigate = useNavigate();
  const [formError, setFormError] = useState(null);

  const form = useForm({
    resolver: zodResolver(partnerRegisterSchema),
    defaultValues: {
      firstName: '', lastName: '', email: '', mobile: '', password: '',
      businessName: '', businessType: 'INDIVIDUAL', gstin: '', pan: '',
      propertyName: '', propertyCity: '', propertyAddress: '', estimatedRooms: '',
    },
  });
  const { register, handleSubmit, formState } = form;
  const errors = formState.errors;

  const onSubmit = async (values) => {
    setFormError(null);
    try {
      const { email } = await partnerApi.register({
        ...values,
        gstin: values.gstin || undefined,
        pan: values.pan || undefined,
        propertyAddress: values.propertyAddress || undefined,
        estimatedRooms: values.estimatedRooms ? Number(values.estimatedRooms) : undefined,
      });
      navigate('/partner/verify-otp', { state: { email } });
    } catch (error) {
      const normalized = normalizeError(error);
      if (normalized.code === 'CONFLICT') {
        form.setError('email', { type: 'server', message: normalized.message });
      } else if (!applyServerFieldErrors(form, normalized)) {
        setFormError(normalized.message);
      }
    }
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <div className="mb-8 flex flex-col items-center gap-3 text-center">
        <Logo />
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--text-strong)]">Become a Gokaasa partner</h1>
        <p className="max-w-xl text-sm text-[var(--text-muted)]">
          List your property on Gokaasa. We'll verify your details and get you ready to manage rooms, rates and bookings.
        </p>
      </div>

      <Card>
        <form onSubmit={handleSubmit(onSubmit)} noValidate className="divide-y divide-[var(--border-subtle)]">
          {formError && <div className="p-5 pb-0"><Alert tone="error">{formError}</Alert></div>}

          <CardHeader>
            <CardTitle>Your account</CardTitle>
            <CardDescription>Used to sign in and receive a verification code.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <FormField id="firstName" label="First name" error={errors.firstName?.message}>
              <Input id="firstName" autoComplete="given-name" invalid={!!errors.firstName} {...register('firstName')} />
            </FormField>
            <FormField id="lastName" label="Last name" error={errors.lastName?.message}>
              <Input id="lastName" autoComplete="family-name" invalid={!!errors.lastName} {...register('lastName')} />
            </FormField>
            <FormField id="email" label="Business email" error={errors.email?.message}>
              <Input id="email" type="email" autoComplete="email" invalid={!!errors.email} {...register('email')} />
            </FormField>
            <FormField id="mobile" label="Mobile number" error={errors.mobile?.message}>
              <Input id="mobile" type="tel" autoComplete="tel" placeholder="+91 98765 43210" invalid={!!errors.mobile} {...register('mobile')} />
            </FormField>
            <FormField id="password" label="Password" error={errors.password?.message} hint="At least 10 characters, with a letter and a number." className="sm:col-span-2">
              <Input id="password" type="password" autoComplete="new-password" invalid={!!errors.password} {...register('password')} />
            </FormField>
          </CardContent>

          <CardHeader>
            <CardTitle>Business information</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <FormField id="businessName" label="Legal business name" error={errors.businessName?.message} className="sm:col-span-2">
              <Input id="businessName" invalid={!!errors.businessName} {...register('businessName')} />
            </FormField>
            <FormField id="businessType" label="Business type" error={errors.businessType?.message}>
              <Select id="businessType" invalid={!!errors.businessType} {...register('businessType')}>
                {BUSINESS_TYPE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </Select>
            </FormField>
            <FormField id="gstin" label="GSTIN" error={errors.gstin?.message} hint="Optional">
              <Input id="gstin" invalid={!!errors.gstin} {...register('gstin')} />
            </FormField>
            <FormField id="pan" label="PAN" error={errors.pan?.message} hint="Optional">
              <Input id="pan" invalid={!!errors.pan} {...register('pan')} />
            </FormField>
          </CardContent>

          <CardHeader>
            <CardTitle>Property information</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <FormField id="propertyName" label="Property name" error={errors.propertyName?.message} className="sm:col-span-2">
              <Input id="propertyName" invalid={!!errors.propertyName} {...register('propertyName')} />
            </FormField>
            <FormField id="propertyCity" label="City" error={errors.propertyCity?.message}>
              <Input id="propertyCity" invalid={!!errors.propertyCity} {...register('propertyCity')} />
            </FormField>
            <FormField id="estimatedRooms" label="Total rooms" error={errors.estimatedRooms?.message} hint="Optional">
              <Input id="estimatedRooms" inputMode="numeric" invalid={!!errors.estimatedRooms} {...register('estimatedRooms')} />
            </FormField>
            <FormField id="propertyAddress" label="Property address" error={errors.propertyAddress?.message} hint="Optional" className="sm:col-span-2">
              <Input id="propertyAddress" invalid={!!errors.propertyAddress} {...register('propertyAddress')} />
            </FormField>
          </CardContent>

          <CardContent>
            <Button type="submit" size="lg" className="group w-full" loading={formState.isSubmitting}>
              Continue
              {!formState.isSubmitting && <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />}
            </Button>
            <p className="mt-4 text-center text-sm text-[var(--text-muted)]">
              Already a partner? <Link to="/login" className="font-semibold text-brand-600 hover:underline">Sign in</Link>
            </p>
          </CardContent>
        </form>
      </Card>
    </div>
  );
}
