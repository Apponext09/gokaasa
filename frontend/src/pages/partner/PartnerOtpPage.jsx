import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowRight } from 'lucide-react';
import { Alert, Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/surfaces.jsx';
import { Button } from '@/components/ui/button.jsx';
import { Input } from '@/components/ui/form-controls.jsx';
import { FormField, Logo, homePathFor } from '@/components/shared/index.jsx';
import { otpVerifySchema } from '@/features/partner/schemas.js';
import { normalizeError } from '@/services/api.js';
import { partnerApi } from '@/services/endpoints.js';
import { useAuth } from '@/features/auth/AuthContext.jsx';

export function PartnerOtpPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { verifyPartnerOtp } = useAuth();
  const email = location.state?.email;

  const [formError, setFormError] = useState(null);
  const [resent, setResent] = useState(false);

  const form = useForm({ resolver: zodResolver(otpVerifySchema), defaultValues: { email: email ?? '', code: '' } });
  const { register, handleSubmit, formState } = form;

  if (!email) return <Navigate to="/partner/register" replace />;

  const onSubmit = async (values) => {
    setFormError(null);
    try {
      const user = await verifyPartnerOtp(values);
      navigate(homePathFor(user), { replace: true });
    } catch (error) {
      setFormError(normalizeError(error).message);
    }
  };

  const onResend = async () => {
    setFormError(null);
    setResent(false);
    try {
      await partnerApi.resendOtp({ email });
      setResent(true);
    } catch (error) {
      setFormError(normalizeError(error).message);
    }
  };

  return (
    <div className="mx-auto max-w-md px-4 py-16 sm:px-6">
      <div className="mb-8 flex flex-col items-center gap-3 text-center">
        <Logo />
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--text-strong)]">Verify your email</h1>
        <p className="text-sm text-[var(--text-muted)]">We sent a 6-digit code to <span className="font-medium text-[var(--text-strong)]">{email}</span>.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Enter verification code</CardTitle>
          <CardDescription>The code expires after a few minutes.</CardDescription>
        </CardHeader>
        <CardContent>
          {formError && <div className="mb-4"><Alert tone="error">{formError}</Alert></div>}
          {resent && <div className="mb-4"><Alert tone="success">A new code has been sent.</Alert></div>}

          <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">
            <FormField id="code" label="6-digit code" error={formState.errors.code?.message}>
              <Input
                id="code"
                inputMode="numeric"
                maxLength={6}
                placeholder="000000"
                className="text-center text-lg tracking-[0.3em]"
                invalid={!!formState.errors.code}
                {...register('code')}
              />
            </FormField>

            <Button type="submit" size="lg" className="group w-full" loading={formState.isSubmitting}>
              Verify and continue
              {!formState.isSubmitting && <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />}
            </Button>

            <div className="flex items-center justify-between text-sm">
              <button type="button" onClick={onResend} className="font-semibold text-brand-600 hover:underline">Resend code</button>
              <Link to="/partner/register" className="text-[var(--text-muted)] hover:text-[var(--text-strong)]">Edit details</Link>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
