import { useEffect, useState } from 'react';
import {
  Link,
  useLocation,
  useNavigate,
  useSearchParams,
} from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';

import {
  ArrowRight,
  CheckCircle2,
  Eye,
  EyeOff,
  LockKeyhole,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';

import {
  Alert,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/surfaces.jsx';

import { Button } from '@/components/ui/button.jsx';
import { Input } from '@/components/ui/form-controls.jsx';

import {
  FormField,
  Logo,
  resolvePostLoginTarget,
} from '@/components/shared/index.jsx';

import { useAuth } from '@/features/auth/AuthContext.jsx';
import { GoogleSignInButton } from '@/features/auth/GoogleSignInButton.jsx';

import {
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
} from '@/features/auth/schemas.js';

import {
  applyServerFieldErrors,
  normalizeError,
} from '@/services/api.js';

import { authApi } from '@/services/endpoints.js';

/* ==========================================================================
   AUTH BACKGROUND IMAGES
   ========================================================================== */

const AUTH_IMAGES = [
  'https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=1800&q=90',
  'https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?auto=format&fit=crop&w=1800&q=90',
  'https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?auto=format&fit=crop&w=1800&q=90',
  'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=1800&q=90',
  'https://images.unsplash.com/photo-1564501049412-61c2a3083791?auto=format&fit=crop&w=1800&q=90',
];

/* ==========================================================================
   PASSWORD INPUT
   ========================================================================== */

function PasswordInput({
  id,
  autoComplete,
  invalid,
  registerField,
}) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="relative">
      <Input
        id={id}
        type={visible ? 'text' : 'password'}
        autoComplete={autoComplete}
        invalid={invalid}
        className="pr-11"
        {...registerField}
      />

      <button
        type="button"
        onClick={() => setVisible((value) => !value)}
        aria-label={visible ? 'Hide password' : 'Show password'}
        className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-muted)] hover:text-[var(--text-strong)]"
      >
        {visible ? (
          <EyeOff className="h-4 w-4" />
        ) : (
          <Eye className="h-4 w-4" />
        )}
      </button>
    </div>
  );
}

/* ==========================================================================
   TRUST POINTS
   ========================================================================== */

function TrustPoints() {
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
        <ShieldCheck className="h-4 w-4 shrink-0 text-brand-600" />
        Secure booking
      </div>

      <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
        <LockKeyhole className="h-4 w-4 shrink-0 text-brand-600" />
        Protected account
      </div>

      <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
        <CheckCircle2 className="h-4 w-4 shrink-0 text-brand-600" />
        Trusted experience
      </div>
    </div>
  );
}

/* ==========================================================================
   AUTH SHELL
   ========================================================================== */

function AuthShell({
  title,
  description,
  children,
  footer,
  eyebrow = 'Welcome to Gokaasa',
  compact = false,
}) {
  const [activeImage, setActiveImage] = useState(0);

  /*
   * Background image changes every 9 seconds.
   * Cleanup prevents memory leaks when the page unmounts.
   */
  useEffect(() => {
    const interval = window.setInterval(() => {
      setActiveImage((current) => (current + 1) % AUTH_IMAGES.length);
    }, 9000);

    return () => {
      window.clearInterval(interval);
    };
  }, []);

  return (
    <div className="customer-auth-shell relative min-h-[calc(100vh-4rem)] overflow-hidden bg-gray-950">

      {/* ================================================================
          BACKGROUND DECORATION
          ================================================================ */}

      <div className="pointer-events-none absolute inset-0 overflow-hidden">

        {/* ── Random organic blobs — various sizes & positions ── */}
        <div className="absolute top-[-80px] left-[-60px]  w-64 h-64 rounded-[60%_40%_30%_70%/60%_30%_70%_40%] bg-blue-300/40 blur-2xl" />
        <div className="absolute top-[10%]  right-[5%]    w-40 h-40 rounded-[40%_60%_70%_30%/40%_50%_60%_50%] bg-sky-300/35  blur-xl"  />
        <div className="absolute top-[35%] left-[3%]      w-28 h-28 rounded-[70%_30%_50%_50%/30%_60%_40%_70%] bg-indigo-200/40 blur-xl" />
        <div className="absolute top-[20%] left-[35%]     w-20 h-20 rounded-[50%_50%_30%_70%/60%_40%_60%_40%] bg-blue-200/35  blur-lg"  />
        <div className="absolute top-[55%] right-[8%]     w-32 h-32 rounded-[30%_70%_70%_30%/30%_30%_70%_70%] bg-sky-200/40   blur-xl"  />
        <div className="absolute top-[65%] left-[12%]     w-24 h-24 rounded-[60%_40%_60%_40%/50%_60%_40%_50%] bg-blue-300/30  blur-xl"  />
        <div className="absolute bottom-[-60px] right-[-50px] w-56 h-56 rounded-[40%_60%_30%_70%/50%_40%_60%_50%] bg-sky-300/35  blur-2xl" />
        <div className="absolute bottom-[20%] left-[40%]  w-16 h-16 rounded-[50%_50%_40%_60%/40%_60%_50%_50%] bg-indigo-200/30 blur-lg"  />
        <div className="absolute bottom-[8%]  left-[-20px] w-36 h-36 rounded-[60%_40%_50%_50%/40%_60%_40%_60%] bg-blue-200/35  blur-xl"  />

        {/* ── Random thin floating rings ── */}
        <div className="absolute top-[8%]   left-[20%] w-16 h-16 rounded-full border-2 border-blue-400/30" />
        <div className="absolute top-[45%]  right-[15%] w-10 h-10 rounded-full border   border-sky-400/35" />
        <div className="absolute bottom-[25%] left-[25%] w-14 h-14 rounded-full border-2 border-indigo-300/30" />
        <div className="absolute top-[70%]  right-[30%] w-8  h-8  rounded-full border   border-blue-300/40" />
        <div className="absolute top-[18%]  right-[35%] w-6  h-6  rounded-full border   border-sky-300/35" />


        {/* ── Soft wave — bottom only ── */}
        <svg className="absolute bottom-0 left-0 w-full opacity-35" viewBox="0 0 1440 110" preserveAspectRatio="none">
          <path d="M0,55 C240,10 480,100 720,55 C960,10 1200,90 1440,50 L1440,110 L0,110 Z" fill="#1877f2" fillOpacity="0.20"/>
          <path d="M0,80 C360,40 720,110 1080,65 C1260,45 1380,85 1440,75 L1440,110 L0,110 Z" fill="#0a42ba" fillOpacity="0.12"/>
        </svg>

      </div>

      {/* ================================================================
          MAIN CONTAINER
          ================================================================ */}

      <div className={`relative mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-7xl items-center justify-center px-4 sm:px-6 lg:px-8 ${compact ? 'py-0 sm:py-2' : 'py-8'}`}>

        <div className={`grid w-full overflow-hidden rounded-[2rem] border border-white/10 bg-[var(--surface-card)] shadow-[0_30px_100px_rgba(0,0,0,0.30)] ${compact ? 'max-w-5xl lg:scale-[0.8] lg:origin-center lg:grid-cols-[0.9fr_1.1fr]' : 'max-w-6xl lg:grid-cols-[0.92fr_1.08fr]'}`}>

          {/* ============================================================
              PREMIUM IMAGE PANEL
              ============================================================ */}

          <div className={`relative hidden overflow-hidden lg:block ${compact ? 'min-h-[560px]' : 'min-h-[720px]'}`}>

            {/* ----------------------------------------------------------
                SLIDESHOW IMAGES
                ---------------------------------------------------------- */}

            {AUTH_IMAGES.map((image, index) => (
              <img
                key={image}
                src={image}
                alt=""
                aria-hidden="true"
                className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-[1800ms] ease-in-out ${
                  index === activeImage
                    ? 'opacity-100'
                    : 'opacity-0'
                }`}
              />
            ))}

            {/* ----------------------------------------------------------
                IMAGE OVERLAYS
                Strong overlays ensure text is always readable.
                ---------------------------------------------------------- */}

            {/* Overall dark overlay */}
            <div className="absolute inset-0 bg-black/40" />

            {/* Left side dark gradient */}
            <div className="absolute inset-0 bg-gradient-to-r from-slate-950/95 via-slate-950/70 to-slate-950/25" />

            {/* Bottom cinematic gradient */}
            <div className="absolute inset-0 bg-gradient-to-t from-slate-950/95 via-slate-950/20 to-slate-950/35" />

            {/* Brand tint */}
            <div className="absolute inset-0 bg-brand-950/15" />

            {/* ==========================================================
                IMAGE CONTENT
                ========================================================== */}

            <div className={`relative z-10 flex h-full flex-col justify-between text-white ${compact ? 'p-7 xl:p-8' : 'p-8 xl:p-12'}`}>

              {/* ========================================================
                  TOP CONTENT
                  ======================================================== */}

              <div>

                {/* ------------------------------------------------------
                    LOGO
                    ------------------------------------------------------ */}

                <div className={`inline-flex rounded-2xl bg-white px-5 py-3.5 shadow-[0_10px_35px_rgba(0,0,0,0.30)] ring-1 ring-white/30 ${compact ? 'mb-7' : 'mb-12'}`}>
                  <Logo />
                </div>

                {/* ------------------------------------------------------
                    HERO CONTENT
                    ------------------------------------------------------ */}

                <div className="max-w-xl">

                  {/* Eyebrow */}
                  <div className={`inline-flex items-center gap-2 rounded-full border border-white/25 bg-black/30 px-4 py-2 text-xs font-bold uppercase tracking-[0.18em] text-white shadow-lg backdrop-blur-md ${compact ? 'mb-4' : 'mb-6'}`}>
                    <Sparkles className="h-3.5 w-3.5 text-amber-300" />

                    Premium stays
                  </div>

                  {/* Main heading */}
                  <h2 className={`font-[var(--font-display)] font-bold leading-[1.08] tracking-tight text-white drop-shadow-[0_3px_14px_rgba(0,0,0,0.65)] ${compact ? 'text-3xl xl:text-4xl' : 'text-4xl xl:text-5xl'}`}>
                    Your next
                    <br />
                    unforgettable stay
                    <br />
                    starts here.
                  </h2>

                  {/* Description */}
                  <p className={`max-w-lg font-medium text-white/90 drop-shadow-[0_2px_8px_rgba(0,0,0,0.75)] ${compact ? 'mt-4 text-sm leading-6' : 'mt-6 text-base leading-7'}`}>
                    Discover exceptional hotels, exclusive deals,
                    flexible bookings and memorable experiences
                    with Gokaasa.
                  </p>

                </div>
              </div>

              {/* ========================================================
                  BOTTOM CONTENT
                  ======================================================== */}

              <div>

                <div className="mb-7 h-px bg-white/20" />

                {/* Stats */}
                <div className="grid grid-cols-3 gap-5">

                  <div>
                    <p className="text-xl font-bold text-white">
                      Premium
                    </p>

                    <p className="mt-1 text-xs font-medium text-white/65">
                      Hotel stays
                    </p>
                  </div>

                  <div>
                    <p className="text-xl font-bold text-white">
                      Secure
                    </p>

                    <p className="mt-1 text-xs font-medium text-white/65">
                      Payments
                    </p>
                  </div>

                  <div>
                    <p className="text-xl font-bold text-white">
                      24/7
                    </p>

                    <p className="mt-1 text-xs font-medium text-white/65">
                      Support
                    </p>
                  </div>

                </div>

                {/* ------------------------------------------------------
                    SLIDESHOW CONTROLS
                    ------------------------------------------------------ */}

                <div className="mt-8 flex items-center gap-2">

                  {AUTH_IMAGES.map((image, index) => (
                    <button
                      key={image}
                      type="button"
                      onClick={() => setActiveImage(index)}
                      aria-label={`Show background image ${index + 1}`}
                      className={`h-1.5 rounded-full transition-all duration-500 ${
                        index === activeImage
                          ? 'w-8 bg-white'
                          : 'w-2 bg-white/35 hover:bg-white/60'
                      }`}
                    />
                  ))}

                  <span className="ml-2 text-[10px] font-medium uppercase tracking-wider text-white/50">
                  </span>

                </div>
              </div>

            </div>
          </div>

          {/* ============================================================
              FORM PANEL
              ============================================================ */}

          <div className={`flex flex-col justify-center bg-[var(--surface-card)] ${compact ? 'min-h-[560px]' : 'min-h-[650px]'}`}>

            <div className={compact ? 'px-5 py-5 sm:px-8 sm:py-6 xl:px-10' : 'px-5 py-8 sm:px-10 sm:py-10 xl:px-14'}>

              {/* --------------------------------------------------------
                  MOBILE LOGO
                  -------------------------------------------------------- */}

              <div className="mb-8 flex justify-center lg:hidden">
                <div className="rounded-2xl bg-white px-5 py-3 shadow-md ring-1 ring-[var(--border-subtle)]">
                  <Logo />
                </div>
              </div>

              <div className={`mx-auto w-full ${compact ? 'max-w-sm' : 'max-w-md'}`}>

                {/* ------------------------------------------------------
                    FORM HEADER
                    ------------------------------------------------------ */}

                <div className={compact ? 'mb-4' : 'mb-8'}>

                  <p className="mb-2 text-xs font-bold uppercase tracking-[0.18em] text-brand-600">
                    {eyebrow}
                  </p>

                  <h1 className={`font-[var(--font-display)] font-bold tracking-tight text-[var(--text-strong)] ${compact ? 'text-2xl sm:text-3xl' : 'text-3xl sm:text-4xl'}`}>
                    {title}
                  </h1>

                  {description && (
                    <p className={`text-[var(--text-muted)] ${compact ? 'mt-1.5 text-xs' : 'mt-3 text-sm leading-6'}`}>
                      {description}
                    </p>
                  )}

                </div>

                {children}

                <div className={compact ? 'mt-4' : 'mt-8'}>
                  <TrustPoints />
                </div>

              </div>
            </div>

            {/* Footer */}
            {footer && (
              <div className={`border-t border-[var(--border-subtle)] bg-[var(--surface-muted)]/50 px-5 text-center sm:px-10 ${compact ? 'py-3' : 'py-5'}`}>
                {footer}
              </div>
            )}

          </div>
        </div>
      </div>
    </div>
  );
}

/* ==========================================================================
   LOGIN PAGE
   ========================================================================== */

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [formError, setFormError] = useState(null);

  const form = useForm({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: '',
      password: '',
    },
  });

  const {
    register,
    handleSubmit,
    formState,
  } = form;

  const onSubmit = async (values) => {
    setFormError(null);

    try {
      const user = await login(values);

      const target = resolvePostLoginTarget(user, location.state?.from);

      if (import.meta.env.DEV) {
        console.debug('[auth] login navigation', { roles: user.roles, from: location.state?.from, target });
      }

      navigate(target, {
        replace: true,
      });
    } catch (error) {
      setFormError(
        normalizeError(error).message,
      );
    }
  };

  return (
    <AuthShell
      title="Welcome back"
      description="Sign in to manage your bookings, saved hotels and trips."
      eyebrow="Welcome back"
      compact
      footer={
        <p className="text-sm text-[var(--text-muted)]">
          New to Gokaasa?{' '}
          <Link
            to="/register"
            className="font-semibold text-brand-600 hover:text-brand-700 hover:underline"
          >
            Create an account
          </Link>
        </p>
      }
    >
      {formError && (
        <div className="mb-5">
          <Alert tone="error">
            {formError}
          </Alert>
        </div>
      )}

      <form
        onSubmit={handleSubmit(onSubmit)}
        noValidate
        className="space-y-5"
      >
        <FormField
          id="email"
          label="Email address"
          error={formState.errors.email?.message}
        >
          <Input
            id="email"
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            invalid={!!formState.errors.email}
            {...register('email')}
          />
        </FormField>

        <FormField
          id="password"
          label="Password"
          error={formState.errors.password?.message}
        >
          <PasswordInput
            id="password"
            autoComplete="current-password"
            invalid={!!formState.errors.password}
            registerField={register('password')}
          />
        </FormField>

        <div className="flex justify-end">
          <Link
            to="/forgot-password"
            className="text-sm font-semibold text-brand-600 hover:text-brand-700 hover:underline"
          >
            Forgot password?
          </Link>
        </div>

        <Button
          type="submit"
          className="group w-full"
          size="lg"
          loading={formState.isSubmitting}
        >
          Sign in

          {!formState.isSubmitting && (
            <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
          )}
        </Button>

        <div className="relative my-4 flex items-center justify-center">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-[var(--border-subtle)]" />
          </div>
          <span className="relative bg-white px-3 text-xs uppercase tracking-wider text-[var(--text-muted)]">
            or continue with
          </span>
        </div>

        <GoogleSignInButton
          onSuccess={(user) => {
            const target = resolvePostLoginTarget(user, location.state?.from);
            navigate(target, { replace: true });
          }}
          onError={setFormError}
        />

        <p className="text-center text-sm text-[var(--text-muted)]">
          Own a hotel?{' '}
          <Link to="/partner/register" className="font-semibold text-brand-600 hover:text-brand-700 hover:underline">
            List your property
          </Link>
        </p>
      </form>
    </AuthShell>
  );
}

/* ==========================================================================
   REGISTER PAGE
   ========================================================================== */

export function RegisterPage() {
  const { register: registerAccount } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [formError, setFormError] = useState(null);
  const [consent, setConsent] = useState(false);

  const form = useForm({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      firstName: '',
      lastName: '',
      email: '',
      phone: '',
      password: '',
      confirmPassword: '',
    },
  });

  const {
    register,
    handleSubmit,
    formState,
    setError,
  } = form;

  const errors = formState.errors;

  const onSubmit = async (values) => {
    setFormError(null);

    if (!consent) {
      setFormError(
        'Please accept the Privacy Policy and Terms & Conditions to create your account.',
      );
      return;
    }

    const {
      confirmPassword: _ignored,
      ...payload
    } = values;

    try {
      await registerAccount({
        ...payload,
        phone: payload.phone || undefined,
      });

      toast.success('Welcome to Gokaasa');

      navigate(
        location.state?.from ?? '/',
        {
          replace: true,
        },
      );
    } catch (error) {
      const normalized = normalizeError(error);

      if (normalized.code === 'CONFLICT') {
        setError('email', {
          type: 'server',
          message: normalized.message,
        });
      } else if (
        !applyServerFieldErrors(form, normalized)
      ) {
        setFormError(normalized.message);
      }
    }
  };

  return (
    <AuthShell
      title="Create your account"
      description="Join Gokaasa to save hotels, manage bookings and get personalized trip updates."
      eyebrow="Join Gokaasa"
      compact
      footer={
        <p className="text-sm text-[var(--text-muted)]">
          Already have an account?{' '}
          <Link
            to="/login"
            className="font-semibold text-brand-600 hover:text-brand-700 hover:underline"
          >
            Sign in
          </Link>
        </p>
      }
    >
      {formError && (
        <div className="mb-5">
          <Alert tone="error">
            {formError}
          </Alert>
        </div>
      )}

      <form
        onSubmit={handleSubmit(onSubmit)}
        noValidate
        className="space-y-3"
      >
        {/* Name */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <FormField
            id="firstName"
            label="First name"
            error={errors.firstName?.message}
          >
            <Input
              id="firstName"
              autoComplete="given-name"
              placeholder="First name"
              invalid={!!errors.firstName}
              {...register('firstName')}
            />
          </FormField>

          <FormField
            id="lastName"
            label="Last name"
            error={errors.lastName?.message}
          >
            <Input
              id="lastName"
              autoComplete="family-name"
              placeholder="Last name"
              invalid={!!errors.lastName}
              {...register('lastName')}
            />
          </FormField>
        </div>

        {/* Email & Phone */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <FormField
            id="email"
            label="Email address"
            error={errors.email?.message}
          >
            <Input
              id="email"
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              invalid={!!errors.email}
              {...register('email')}
            />
          </FormField>

          <FormField
            id="phone"
            label="Mobile number"
            error={errors.phone?.message}
            hint="Optional"
          >
            <Input
              id="phone"
              type="tel"
              autoComplete="tel"
              placeholder="+91 98765 43210"
              invalid={!!errors.phone}
              {...register('phone')}
            />
          </FormField>
        </div>

        {/* Password & Confirm password */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <FormField
            id="password"
            label="Password"
            error={errors.password?.message}
          >
            <PasswordInput
              id="password"
              autoComplete="new-password"
              invalid={!!errors.password}
              registerField={register('password')}
            />
          </FormField>

          <FormField
            id="confirmPassword"
            label="Confirm password"
            error={errors.confirmPassword?.message}
          >
            <PasswordInput
              id="confirmPassword"
              autoComplete="new-password"
              invalid={!!errors.confirmPassword}
              registerField={register('confirmPassword')}
            />
          </FormField>
        </div>

        {/* ==============================================================
            DPDP / PRIVACY CONSENT
            ============================================================== */}

        <div
          className={`rounded-xl border p-3 transition-colors ${
            !consent && formError
              ? 'border-red-300 bg-red-50/50'
              : 'border-[var(--border-subtle)] bg-[var(--surface-muted)]/60'
          }`}
        >
          <label
            htmlFor="privacy-consent"
            className="flex cursor-pointer items-start gap-2.5"
          >
            <input
              id="privacy-consent"
              type="checkbox"
              checked={consent}
              onChange={(event) =>
                setConsent(event.target.checked)
              }
              className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer rounded border-gray-300 text-brand-700 accent-brand-700 focus:ring-brand-600"
            />

            <span className="text-[11px] leading-4 text-[var(--text-muted)]">
              I agree to Gokaasa&apos;s{' '}
              <Link
                to="/privacy"
                target="_blank"
                className="font-semibold text-brand-600 hover:underline"
              >
                Privacy Policy
              </Link>{' '}
              and{' '}
              <Link
                to="/terms"
                target="_blank"
                className="font-semibold text-brand-600 hover:underline"
              >
                Terms &amp; Conditions
              </Link>
              , and consent to processing of my information under the DPDP Act, 2023.
            </span>
          </label>
        </div>

        {/* Create account */}
        <Button
          type="submit"
          className="group w-full"
          loading={formState.isSubmitting}
        >
          Create account

          {!formState.isSubmitting && (
            <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
          )}
        </Button>

        <div className="relative my-2.5 flex items-center justify-center">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-[var(--border-subtle)]" />
          </div>
          <span className="relative bg-white px-2.5 text-[11px] uppercase tracking-wider text-[var(--text-muted)]">
            or continue with
          </span>
        </div>

        <GoogleSignInButton
          text="Sign up with Google"
          onSuccess={(user) => {
            const target = resolvePostLoginTarget(user, location.state?.from);
            navigate(target, { replace: true });
          }}
          onError={setFormError}
        />
      </form>
    </AuthShell>
  );
}

/* ==========================================================================
   FORGOT PASSWORD PAGE
   ========================================================================== */

export function ForgotPasswordPage() {
  const [sent, setSent] = useState(false);
  const [formError, setFormError] = useState(null);

  const form = useForm({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: {
      email: '',
    },
  });

  const {
    register,
    handleSubmit,
    formState,
  } = form;

  const onSubmit = async (values) => {
    setFormError(null);

    try {
      await authApi.forgotPassword(values);
      setSent(true);
    } catch (error) {
      setFormError(
        normalizeError(error).message,
      );
    }
  };

  return (
    <AuthShell
      title="Reset your password"
      description="Enter the email linked to your account and we will send a secure reset link."
      eyebrow="Account recovery"
    >
      {sent ? (
        <div className="space-y-5">

          <Alert
            tone="success"
            title="Check your inbox"
          >
            If an account exists for that email, a reset
            link is on its way. The link expires in 30
            minutes.
          </Alert>

          <Link
            to="/login"
            className="flex items-center justify-center gap-2 text-sm font-semibold text-brand-600 hover:text-brand-700 hover:underline"
          >
            Back to sign in
            <ArrowRight className="h-4 w-4" />
          </Link>

        </div>
      ) : (
        <form
          onSubmit={handleSubmit(onSubmit)}
          noValidate
          className="space-y-5"
        >
          {formError && (
            <Alert tone="error">
              {formError}
            </Alert>
          )}

          <FormField
            id="email"
            label="Email address"
            error={formState.errors.email?.message}
          >
            <Input
              id="email"
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              invalid={!!formState.errors.email}
              {...register('email')}
            />
          </FormField>

          <Button
            type="submit"
            className="group w-full"
            size="lg"
            loading={formState.isSubmitting}
          >
            Send reset link

            {!formState.isSubmitting && (
              <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
            )}
          </Button>

          <p className="text-center text-sm">
            <Link
              to="/login"
              className="font-semibold text-brand-600 hover:text-brand-700 hover:underline"
            >
              Back to sign in
            </Link>
          </p>
        </form>
      )}
    </AuthShell>
  );
}

/* ==========================================================================
   RESET PASSWORD PAGE
   ========================================================================== */

export function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const token = searchParams.get('token');

  const [formError, setFormError] = useState(null);

  const form = useForm({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: {
      password: '',
      confirmPassword: '',
    },
  });

  const {
    register,
    handleSubmit,
    formState,
  } = form;

  const onSubmit = async ({ password }) => {
    setFormError(null);

    try {
      await authApi.resetPassword({
        token,
        password,
      });

      toast.success(
        'Password updated. Please sign in with your new password.',
      );

      navigate('/login', {
        replace: true,
      });
    } catch (error) {
      setFormError(
        normalizeError(error).message,
      );
    }
  };

  if (!token) {
    return (
      <AuthShell
        title="Link not valid"
        description="This password reset link cannot be used."
        eyebrow="Account recovery"
      >
        <div className="space-y-5">

          <Alert tone="error">
            This reset link is incomplete. Request a
            new one from the sign-in page.
          </Alert>

          <Link
            to="/forgot-password"
            className="flex items-center justify-center gap-2 text-sm font-semibold text-brand-600 hover:text-brand-700 hover:underline"
          >
            Request a new link
            <ArrowRight className="h-4 w-4" />
          </Link>

        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Choose a new password"
      description="Create a new secure password for your Gokaasa account."
      eyebrow="Account security"
    >
      <form
        onSubmit={handleSubmit(onSubmit)}
        noValidate
        className="space-y-5"
      >
        {formError && (
          <Alert tone="error">
            {formError}
          </Alert>
        )}

        <FormField
          id="password"
          label="New password"
          error={formState.errors.password?.message}
        >
          <PasswordInput
            id="password"
            autoComplete="new-password"
            invalid={!!formState.errors.password}
            registerField={register('password')}
          />
        </FormField>

        <FormField
          id="confirmPassword"
          label="Confirm new password"
          error={formState.errors.confirmPassword?.message}
        >
          <PasswordInput
            id="confirmPassword"
            autoComplete="new-password"
            invalid={!!formState.errors.confirmPassword}
            registerField={register('confirmPassword')}
          />
        </FormField>

        <div className="rounded-xl border border-brand-200 bg-brand-50/60 p-4">
          <div className="flex gap-3">
            <LockKeyhole className="mt-0.5 h-4 w-4 shrink-0 text-brand-700" />

            <p className="text-xs leading-5 text-brand-900/70">
              For your security, changing your password
              will invalidate your existing sessions on
              other devices.
            </p>
          </div>
        </div>

        <Button
          type="submit"
          className="group w-full"
          size="lg"
          loading={formState.isSubmitting}
        >
          Update password

          {!formState.isSubmitting && (
            <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
          )}
        </Button>
      </form>
    </AuthShell>
  );
}
