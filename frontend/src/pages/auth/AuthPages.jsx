import { useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { Alert, Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/surfaces.jsx';
import { Button } from '@/components/ui/button.jsx';
import { Input } from '@/components/ui/form-controls.jsx';
import { FormField, Logo, homePathFor } from '@/components/shared/index.jsx';
import { useAuth } from '@/features/auth/AuthContext.jsx';
import {
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
} from '@/features/auth/schemas.js';
import { applyServerFieldErrors, normalizeError } from '@/services/api.js';
import { authApi } from '@/services/endpoints.js';

function AuthShell({ title, description, children, footer }) {
  return (
    <div className="flex min-h-[calc(100vh-4rem)] flex-col items-center justify-center px-4 py-12">
      <div className="mb-8">
        <Logo />
      </div>
      <Card className="w-full max-w-md shadow-sm">
        <CardHeader>
          <CardTitle className="text-xl">{title}</CardTitle>
          {description && <CardDescription>{description}</CardDescription>}
        </CardHeader>
        <CardContent className="space-y-5">{children}</CardContent>
        {footer && <CardFooter className="justify-center bg-[var(--surface-muted)]/50">{footer}</CardFooter>}
      </Card>
    </div>
  );
}

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [formError, setFormError] = useState(null);
  const form = useForm({ resolver: zodResolver(loginSchema), defaultValues: { email: '', password: '' } });
  const { register, handleSubmit, formState } = form;

  const onSubmit = async (values) => {
    setFormError(null);
    try {
      const user = await login(values);
      const target = location.state?.from ?? homePathFor(user);
      navigate(target, { replace: true });
    } catch (error) {
      setFormError(normalizeError(error).message);
    }
  };

  return (
    <AuthShell
      title="Welcome back"
      description="Sign in to manage your bookings and saved hotels."
      footer={
        <p className="text-sm text-[var(--text-muted)]">
          New to Gokaasa?{' '}
          <Link to="/register" className="font-medium text-brand-600 hover:underline">
            Create an account
          </Link>
        </p>
      }
    >
      {formError && <Alert tone="error">{formError}</Alert>}
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
        <FormField id="email" label="Email" error={formState.errors.email?.message}>
          <Input id="email" type="email" autoComplete="email" invalid={!!formState.errors.email} {...register('email')} />
        </FormField>
        <FormField id="password" label="Password" error={formState.errors.password?.message}>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            invalid={!!formState.errors.password}
            {...register('password')}
          />
        </FormField>
        <div className="flex justify-end">
          <Link to="/forgot-password" className="text-sm font-medium text-brand-600 hover:underline">
            Forgot password?
          </Link>
        </div>
        <Button type="submit" className="w-full" size="lg" loading={formState.isSubmitting}>
          Sign in
        </Button>
      </form>
    </AuthShell>
  );
}

export function RegisterPage() {
  const { register: registerAccount } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [formError, setFormError] = useState(null);
  const form = useForm({
    resolver: zodResolver(registerSchema),
    defaultValues: { firstName: '', lastName: '', email: '', phone: '', password: '', confirmPassword: '' },
  });
  const { register, handleSubmit, formState, setError } = form;
  const errors = formState.errors;

  const onSubmit = async (values) => {
    setFormError(null);
    const { confirmPassword: _ignored, ...payload } = values;
    try {
      await registerAccount({ ...payload, phone: payload.phone || undefined });
      toast.success('Welcome to Gokaasa');
      navigate(location.state?.from ?? '/', { replace: true });
    } catch (error) {
      const normalized = normalizeError(error);
      if (normalized.code === 'CONFLICT') {
        setError('email', { type: 'server', message: normalized.message });
      } else if (!applyServerFieldErrors(form, normalized)) {
        setFormError(normalized.message);
      }
    }
  };

  return (
    <AuthShell
      title="Create your account"
      description="Save hotels, manage bookings and get trip updates in one place."
      footer={
        <p className="text-sm text-[var(--text-muted)]">
          Already have an account?{' '}
          <Link to="/login" className="font-medium text-brand-600 hover:underline">
            Sign in
          </Link>
        </p>
      }
    >
      {formError && <Alert tone="error">{formError}</Alert>}
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField id="firstName" label="First name" error={errors.firstName?.message}>
            <Input id="firstName" autoComplete="given-name" invalid={!!errors.firstName} {...register('firstName')} />
          </FormField>
          <FormField id="lastName" label="Last name" error={errors.lastName?.message}>
            <Input id="lastName" autoComplete="family-name" invalid={!!errors.lastName} {...register('lastName')} />
          </FormField>
        </div>
        <FormField id="email" label="Email" error={errors.email?.message}>
          <Input id="email" type="email" autoComplete="email" invalid={!!errors.email} {...register('email')} />
        </FormField>
        <FormField id="phone" label="Mobile number (optional)" error={errors.phone?.message}>
          <Input id="phone" type="tel" autoComplete="tel" invalid={!!errors.phone} {...register('phone')} />
        </FormField>
        <FormField id="password" label="Password" error={errors.password?.message} hint="At least 10 characters, with a letter and a number.">
          <Input id="password" type="password" autoComplete="new-password" invalid={!!errors.password} {...register('password')} />
        </FormField>
        <FormField id="confirmPassword" label="Confirm password" error={errors.confirmPassword?.message}>
          <Input
            id="confirmPassword"
            type="password"
            autoComplete="new-password"
            invalid={!!errors.confirmPassword}
            {...register('confirmPassword')}
          />
        </FormField>
        <Button type="submit" className="w-full" size="lg" loading={formState.isSubmitting}>
          Create account
        </Button>
      </form>
    </AuthShell>
  );
}

export function ForgotPasswordPage() {
  const [sent, setSent] = useState(false);
  const [formError, setFormError] = useState(null);
  const form = useForm({ resolver: zodResolver(forgotPasswordSchema), defaultValues: { email: '' } });
  const { register, handleSubmit, formState } = form;

  const onSubmit = async (values) => {
    setFormError(null);
    try {
      await authApi.forgotPassword(values);
      setSent(true);
    } catch (error) {
      setFormError(normalizeError(error).message);
    }
  };

  return (
    <AuthShell title="Reset your password" description="Enter the email linked to your account and we will send a reset link.">
      {sent ? (
        <Alert tone="success" title="Check your inbox">
          If an account exists for that email, a reset link is on its way. The link expires in 30 minutes.
        </Alert>
      ) : (
        <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
          {formError && <Alert tone="error">{formError}</Alert>}
          <FormField id="email" label="Email" error={formState.errors.email?.message}>
            <Input id="email" type="email" autoComplete="email" invalid={!!formState.errors.email} {...register('email')} />
          </FormField>
          <Button type="submit" className="w-full" size="lg" loading={formState.isSubmitting}>
            Send reset link
          </Button>
        </form>
      )}
      <p className="text-center text-sm">
        <Link to="/login" className="font-medium text-brand-600 hover:underline">
          Back to sign in
        </Link>
      </p>
    </AuthShell>
  );
}

export function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token');
  const [formError, setFormError] = useState(null);
  const form = useForm({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { password: '', confirmPassword: '' },
  });
  const { register, handleSubmit, formState } = form;

  const onSubmit = async ({ password }) => {
    setFormError(null);
    try {
      await authApi.resetPassword({ token, password });
      toast.success('Password updated. Please sign in with your new password.');
      navigate('/login', { replace: true });
    } catch (error) {
      setFormError(normalizeError(error).message);
    }
  };

  if (!token) {
    return (
      <AuthShell title="Link not valid">
        <Alert tone="error">This reset link is incomplete. Request a new one from the sign-in page.</Alert>
        <p className="text-center text-sm">
          <Link to="/forgot-password" className="font-medium text-brand-600 hover:underline">
            Request a new link
          </Link>
        </p>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Choose a new password" description="This will sign you out on all devices.">
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
        {formError && <Alert tone="error">{formError}</Alert>}
        <FormField id="password" label="New password" error={formState.errors.password?.message}>
          <Input id="password" type="password" autoComplete="new-password" invalid={!!formState.errors.password} {...register('password')} />
        </FormField>
        <FormField id="confirmPassword" label="Confirm new password" error={formState.errors.confirmPassword?.message}>
          <Input
            id="confirmPassword"
            type="password"
            autoComplete="new-password"
            invalid={!!formState.errors.confirmPassword}
            {...register('confirmPassword')}
          />
        </FormField>
        <Button type="submit" className="w-full" size="lg" loading={formState.isSubmitting}>
          Update password
        </Button>
      </form>
    </AuthShell>
  );
}
