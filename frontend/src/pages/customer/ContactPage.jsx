import {
  ArrowRight,
  CheckCircle2,
  Clock3,
  Mail,
  MapPin,
  Phone,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader } from '@/components/shared/index.jsx';
import { Button } from '@/components/ui/button.jsx';
import { Input } from '@/components/ui/form-controls.jsx';
import { useDocumentMeta } from '@/hooks/useDocumentMeta.js';
import { discoveryApi } from '@/services/endpoints.js';
import { normalizeError } from '@/services/api.js';

const POLICIES = [
  {
    id: 'terms',
    icon: ShieldCheck,
    title: 'Terms & Conditions',
    text: 'By booking through Gokaasa you agree to the rate, cancellation policy and guest details shown at checkout for that booking. Full terms are available on request from support.',
  },
  {
    id: 'privacy',
    icon: ShieldCheck,
    title: 'Privacy Policy',
    text: "We use your details only to process bookings, process payments and provide support. We never sell your data. Card details are handled entirely by our payment partner and never stored on Gokaasa's servers.",
  },
  {
    id: 'refunds',
    icon: ArrowRight,
    title: 'Refund Policy',
    text: 'Refunds follow the cancellation policy shown at the time of booking. Approved refunds are returned to your original payment method; timing depends on your bank or card issuer.',
  },
];

function NewsletterSection() {
  const [email, setEmail] = useState('');
  const [state, setState] = useState('idle');
  const [error, setError] = useState(null);

  const submit = async (event) => {
    event.preventDefault();
    setState('loading');
    setError(null);

    try {
      await discoveryApi.subscribeNewsletter(email);
      setState('success');
      setEmail('');
    } catch (err) {
      setError(normalizeError(err).message);
      setState('error');
    }
  };

  return (
    <section
      aria-labelledby="newsletter-heading"
      className="border-t border-slate-200 bg-slate-50"
    >
      <div className="mx-auto grid max-w-5xl gap-5 px-4 py-8 sm:px-6 lg:grid-cols-[1fr_1.15fr] lg:items-center lg:py-10">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-700">
            <Mail className="h-5 w-5" aria-hidden="true" />
          </span>
          <div>
            <h2
              id="newsletter-heading"
              className="font-[var(--font-display)] text-xl font-semibold text-[var(--text-strong)] sm:text-2xl"
            >
              Get travel offers by email
            </h2>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              Hotel deals and useful travel updates, without the noise.
            </p>
          </div>
        </div>

        <div>
          {state === 'success' ? (
            <p
              className="inline-flex items-center gap-2 text-sm font-medium text-emerald-700"
              role="status"
            >
              <CheckCircle2 className="h-4 w-4" />
              You're subscribed! Keep an eye on your inbox.
            </p>
          ) : (
            <form onSubmit={submit} className="flex flex-col gap-2 sm:flex-row">
              <Input
                type="email"
                required
                aria-label="Email address"
                placeholder="Enter your email address"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                disabled={state === 'loading'}
                className="min-h-11 flex-1 bg-white"
              />
              <Button
                type="submit"
                loading={state === 'loading'}
                className="min-h-11 px-6"
              >
                Subscribe
              </Button>
            </form>
          )}
          {state === 'error' && (
            <p role="alert" className="mt-2 text-sm text-danger-600">
              {error}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

export function ContactPage() {
  useDocumentMeta({
    title: 'Contact Us | Gokaasa',
    description:
      'Get in touch with Gokaasa support. Whether you have a question about a booking or need assistance, our support team is here for you.',
    canonicalPath: '/contact',
  });

  return (
    <div className="contact-page min-h-screen bg-[var(--surface-page)]">
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-brand-50/80 via-white to-amber-50/50" />

        <div className="absolute -right-32 -top-32 h-80 w-80 rounded-full bg-brand-200/30 blur-3xl" />

        <div className="absolute -left-32 top-40 h-72 w-72 rounded-full bg-amber-200/20 blur-3xl" />

        <div className="relative mx-auto w-full max-w-7xl px-4 pb-12 pt-10 sm:px-6 lg:px-8 lg:pb-14 lg:pt-12">
          <div className="mx-auto max-w-3xl text-center">
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-brand-200 bg-white/80 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-brand-700 shadow-sm backdrop-blur">
              <Sparkles className="h-4 w-4" />
              Gokaasa Support
            </div>

            <PageHeader
              title="We're here to help."
              description="Whether you have a question about a booking, need help with a cancellation, or simply want to talk to us — our support team is here for you."
            />
          </div>
        </div>
      </section>

      {/* Contact cards */}
      <section className="relative z-10 mx-auto -mt-7 w-full max-w-5xl px-4 sm:px-6">
        <div className="grid gap-5 md:grid-cols-2">
          <a
            href="tel:+919876543210"
            className="group relative overflow-hidden rounded-xl border border-[var(--border-subtle)] bg-white p-6 shadow-[0_14px_38px_rgba(15,23,42,0.08)] transition-all duration-300 hover:-translate-y-1 hover:border-brand-200 hover:shadow-[0_20px_48px_rgba(15,23,42,0.11)]"
          >
            <div className="absolute -right-10 -top-10 h-32 w-32 rounded-full bg-brand-50 blur-2xl transition-all duration-300 group-hover:bg-brand-100" />

            <div className="relative flex items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700 ring-1 ring-brand-100 transition-transform duration-300 group-hover:scale-105">
                <Phone className="h-5 w-5" aria-hidden="true" />
              </div>

              <div>
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-brand-700">
                  Phone support
                </p>

                <h2 className="mt-1 text-lg font-semibold text-[var(--text-strong)]">
                  Call us directly
                </h2>

                <p className="mt-1 text-sm text-[var(--text-muted)]">
                  +91-9876543210
                </p>

                <div className="mt-4 inline-flex items-center gap-2 text-xs font-semibold text-brand-700">
                  <Clock3 className="h-3.5 w-3.5" />
                  Support available for booking assistance
                </div>
              </div>
            </div>
          </a>

          <a
            href="mailto:support@gokaasa.com"
            className="group relative overflow-hidden rounded-xl border border-[var(--border-subtle)] bg-white p-6 shadow-[0_14px_38px_rgba(15,23,42,0.08)] transition-all duration-300 hover:-translate-y-1 hover:border-brand-200 hover:shadow-[0_20px_48px_rgba(15,23,42,0.11)]"
          >
            <div className="absolute -right-10 -top-10 h-32 w-32 rounded-full bg-amber-50 blur-2xl transition-all duration-300 group-hover:bg-amber-100" />

            <div className="relative flex items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-700 ring-1 ring-amber-100 transition-transform duration-300 group-hover:scale-105">
                <Mail className="h-5 w-5" aria-hidden="true" />
              </div>

              <div>
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-amber-700">
                  Email support
                </p>

                <h2 className="mt-1 text-lg font-semibold text-[var(--text-strong)]">
                  Send us an email
                </h2>

                <p className="mt-1 text-sm text-[var(--text-muted)]">
                  support@gokaasa.com
                </p>

                <div className="mt-4 inline-flex items-center gap-2 text-xs font-semibold text-amber-700">
                  <Mail className="h-3.5 w-3.5" />
                  We&apos;re happy to help
                </div>
              </div>
            </div>
          </a>
        </div>
      </section>

      {/* Policies */}
      <section className="mt-12 border-y border-[var(--border-subtle)] bg-white/60">
        <div className="mx-auto w-full max-w-5xl px-4 py-12 sm:px-6 lg:py-14">
          <div className="mx-auto max-w-2xl text-center">
            <span className="text-xs font-bold uppercase tracking-[0.2em] text-brand-700">
              Important information
            </span>

            <h2 className="mt-3 text-3xl font-bold tracking-tight text-[var(--text-strong)] sm:text-4xl">
              Policies you can understand
            </h2>

            <p className="mt-4 text-sm leading-7 text-[var(--text-muted)] sm:text-base">
              We keep important booking information clear and accessible so
              you know what to expect.
            </p>
          </div>

          <div className="mt-8 grid gap-5 md:grid-cols-3">
            {POLICIES.map(({ id, icon: Icon, title, text }) => (
              <section
                key={id}
                id={id}
                className="group rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] p-6 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-brand-200 hover:shadow-lg"
              >
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-50 text-brand-700 ring-1 ring-brand-100">
                  <Icon className="h-5 w-5" />
                </div>

                <h2 className="mt-5 text-lg font-semibold text-[var(--text-strong)]">
                  {title}
                </h2>

                <p className="mt-3 text-sm leading-7 text-[var(--text-muted)]">
                  {text}
                </p>
              </section>
            ))}
          </div>
        </div>
      </section>

      {/* Support CTA */}
      <section className="px-4 py-12 sm:px-6 lg:py-14">
        <div className="mx-auto max-w-5xl overflow-hidden rounded-2xl bg-gradient-to-br from-slate-950 via-slate-900 to-brand-950 px-6 py-10 shadow-[0_22px_55px_rgba(15,23,42,0.16)] sm:px-10 sm:py-12">
          <div className="mx-auto max-w-2xl text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10">
              <Sparkles className="h-6 w-6 text-amber-300" />
            </div>

            <h2 className="mt-5 text-3xl font-bold tracking-tight text-white sm:text-4xl">
              Still need help?
            </h2>

            <p className="mt-4 text-sm leading-7 text-slate-300 sm:text-base">
              Reach out to our support team and we&apos;ll help you find the
              right answer.
            </p>

            <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
              <a
                href="mailto:support@gokaasa.com"
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-white px-6 py-3.5 text-sm font-bold text-slate-900 shadow-lg transition-all duration-300 hover:-translate-y-0.5 hover:bg-slate-100"
              >
                <Mail className="h-4 w-4" />
                Email support
              </a>

              <Link
                to="/destinations"
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/10 px-6 py-3.5 text-sm font-bold text-white transition-all duration-300 hover:-translate-y-0.5 hover:bg-white/15"
              >
                Explore hotels
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>

            <div className="mt-8 flex items-center justify-center gap-2 text-xs text-slate-400">
              <MapPin className="h-3.5 w-3.5" />
              Gokaasa — making every stay simpler
            </div>
          </div>
        </div>
      </section>

      {/* Newsletter */}
      <NewsletterSection />
    </div>
  );
}
