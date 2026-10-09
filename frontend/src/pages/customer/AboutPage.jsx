import { Award, ArrowRight, CheckCircle2, ShieldCheck, Sparkles, Users } from 'lucide-react';
import { Link } from 'react-router-dom';
import { PageHeader } from '@/components/shared/index.jsx';
import { useDocumentMeta } from '@/hooks/useDocumentMeta.js';

const VALUES = [
  {
    icon: ShieldCheck,
    title: 'Verified stays',
    text: 'Every property is carefully reviewed before going live, from photos and amenities to availability and policies.',
  },
  {
    icon: Award,
    title: 'Transparent pricing',
    text: 'We believe in clear pricing. Taxes, fees and important booking details are presented upfront.',
  },
  {
    icon: Users,
    title: 'Built for travellers',
    text: 'We are building the booking experience we would want ourselves — simple, reliable and genuinely enjoyable.',
  },
];

const STATS = [
  { value: '100%', label: 'Transparent pricing' },
  { value: '24/7', label: 'Booking support' },
  { value: 'Verified', label: 'Property listings' },
  { value: 'Secure', label: 'Payments & bookings' },
];

const HIGHLIGHTS = [
  'Real availability from our hotel partners',
  'Clear cancellation and booking policies',
  'Secure online payments',
  'Dedicated customer support',
];

export function AboutPage() {
  useDocumentMeta({
    title: 'About Us | Gokaasa',
    description:
      'Gokaasa is on a mission to make hotel booking transparent, fast and dependable.',
    canonicalPath: '/about',
  });

  return (
    <div className="min-h-screen bg-[var(--surface-page)]">
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-brand-50/80 via-white to-amber-50/50" />
        <div className="absolute -right-32 -top-32 h-80 w-80 rounded-full bg-brand-200/30 blur-3xl" />
        <div className="absolute -left-32 top-40 h-72 w-72 rounded-full bg-amber-200/20 blur-3xl" />

        <div className="relative mx-auto w-full max-w-7xl px-4 pb-16 pt-12 sm:px-6 lg:px-8 lg:pb-20 lg:pt-16">
          <div className="max-w-3xl">
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-brand-200 bg-white/80 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-brand-700 shadow-sm backdrop-blur">
              <Sparkles className="h-4 w-4" />
              The Gokaasa story
            </div>

            <PageHeader
              title="Travel better. Stay better."
              description="We're making hotel booking simpler, more transparent and more dependable — so you can spend less time searching and more time enjoying your journey."
            />

            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                to="/destinations"
                className="group inline-flex items-center gap-2 rounded-xl bg-brand-700 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-brand-700/20 transition-all duration-300 hover:-translate-y-0.5 hover:bg-brand-800 hover:shadow-xl"
              >
                Explore stays
                <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
              </Link>

              <Link
                to="/contact"
                className="inline-flex items-center rounded-xl border border-[var(--border-subtle)] bg-white px-5 py-3 text-sm font-semibold text-[var(--text-strong)] shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:border-brand-200 hover:text-brand-700 hover:shadow-md"
              >
                Talk to us
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="relative z-10 mx-auto -mt-7 w-full max-w-6xl px-4 sm:px-6">
        <div className="grid overflow-hidden rounded-2xl border border-[var(--border-subtle)] bg-white shadow-[0_20px_60px_rgba(15,23,42,0.10)] sm:grid-cols-2 lg:grid-cols-4">
          {STATS.map(({ value, label }, index) => (
            <div
              key={label}
              className={`px-6 py-6 text-center sm:py-7 ${
                index !== 0 ? 'border-t border-[var(--border-subtle)] sm:border-l sm:border-t-0' : ''
              }`}
            >
              <div className="text-2xl font-bold tracking-tight text-[var(--text-strong)]">
                {value}
              </div>
              <div className="mt-1 text-xs font-medium uppercase tracking-wider text-[var(--text-muted)]">
                {label}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Main Story */}
      <section className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-6 lg:py-24">
        <div className="grid items-center gap-12 lg:grid-cols-[1.05fr_0.95fr] lg:gap-20">
          <div>
            <span className="text-xs font-bold uppercase tracking-[0.2em] text-brand-700">
              Why Gokaasa
            </span>

            <h2 className="mt-3 text-3xl font-bold tracking-tight text-[var(--text-strong)] sm:text-4xl">
              A better way to find your next stay.
            </h2>

            <div className="mt-6 space-y-5 text-base leading-8 text-[var(--text-body)]">
              <p>
                Gokaasa is a hotel booking platform built around one simple idea:
                finding and booking a great stay should feel effortless.
              </p>

              <p>
                We work closely with hotels to bring travellers reliable
                availability, transparent pricing and clear cancellation
                information — helping you make confident decisions before you
                book.
              </p>

              <p>
                From independent boutique properties to premium stays and
                trusted hotel brands, we're creating one place where discovering
                your next stay feels simple, personal and dependable.
              </p>
            </div>

            <div className="mt-8 grid gap-3 sm:grid-cols-2">
              {HIGHLIGHTS.map((item) => (
                <div
                  key={item}
                  className="flex items-start gap-3 rounded-xl border border-[var(--border-subtle)] bg-white p-3.5 shadow-sm"
                >
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-brand-700" />
                  <span className="text-sm font-medium text-[var(--text-body)]">
                    {item}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Premium visual card */}
          <div className="relative">
            <div className="absolute -inset-4 rounded-[2rem] bg-gradient-to-br from-brand-100/60 via-transparent to-amber-100/50 blur-2xl" />

            <div className="relative overflow-hidden rounded-[2rem] border border-white/70 bg-gradient-to-br from-slate-950 via-slate-900 to-brand-950 p-8 shadow-[0_30px_80px_rgba(15,23,42,0.20)] sm:p-10">
              <div className="absolute -right-16 -top-16 h-48 w-48 rounded-full bg-brand-500/20 blur-3xl" />
              <div className="absolute -bottom-20 -left-10 h-48 w-48 rounded-full bg-amber-400/10 blur-3xl" />

              <div className="relative">
                <div className="mb-8 flex h-14 w-14 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/15">
                  <Sparkles className="h-7 w-7 text-amber-300" />
                </div>

                <p className="text-sm font-semibold uppercase tracking-[0.2em] text-amber-300">
                  Our mission
                </p>

                <h3 className="mt-4 text-3xl font-bold leading-tight text-white">
                  Make every stay worth remembering.
                </h3>

                <p className="mt-5 text-sm leading-7 text-slate-300">
                  Great travel starts with confidence. That's why we're focused
                  on making every part of the booking journey clear, secure and
                  beautifully simple.
                </p>

                <div className="mt-8 flex items-center gap-3 border-t border-white/10 pt-6">
                  <div className="flex -space-x-2">
                    <span className="h-9 w-9 rounded-full border-2 border-slate-900 bg-brand-400" />
                    <span className="h-9 w-9 rounded-full border-2 border-slate-900 bg-amber-300" />
                    <span className="h-9 w-9 rounded-full border-2 border-slate-900 bg-sky-400" />
                  </div>

                  <span className="text-xs font-medium text-slate-300">
                    Built with travellers in mind
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Values */}
      <section className="border-y border-[var(--border-subtle)] bg-white/60">
        <div className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-6 lg:py-24">
          <div className="mx-auto max-w-2xl text-center">
            <span className="text-xs font-bold uppercase tracking-[0.2em] text-brand-700">
              What we stand for
            </span>

            <h2 className="mt-3 text-3xl font-bold tracking-tight text-[var(--text-strong)] sm:text-4xl">
              The principles behind Gokaasa
            </h2>

            <p className="mt-4 text-sm leading-7 text-[var(--text-muted)] sm:text-base">
              Everything we build is guided by a few simple principles designed
              to make travel booking better.
            </p>
          </div>

          <div className="mt-12 grid gap-5 md:grid-cols-3">
            {VALUES.map(({ icon: Icon, title, text }) => (
              <div
                key={title}
                className="group relative overflow-hidden rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-card)] p-7 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-brand-200 hover:shadow-[0_18px_45px_rgba(15,23,42,0.10)]"
              >
                <div className="absolute right-0 top-0 h-24 w-24 rounded-full bg-brand-100/40 blur-2xl transition-all duration-300 group-hover:bg-brand-200/50" />

                <div className="relative">
                  <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-xl bg-brand-50 text-brand-700 ring-1 ring-brand-100 transition-transform duration-300 group-hover:scale-105">
                    <Icon className="h-6 w-6" aria-hidden="true" />
                  </div>

                  <h3 className="text-lg font-semibold text-[var(--text-strong)]">
                    {title}
                  </h3>

                  <p className="mt-3 text-sm leading-7 text-[var(--text-muted)]">
                    {text}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Blog / Careers / Partner */}
      <section className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-6 lg:py-24">
        <div className="grid gap-5 md:grid-cols-3">
          {/* Blog */}
          <section
            id="blog"
            className="group rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-card)] p-6 transition-all duration-300 hover:-translate-y-1 hover:border-brand-200 hover:shadow-lg"
          >
            <div className="mb-5 flex h-11 w-11 items-center justify-center rounded-xl bg-brand-50 text-brand-700">
              <Sparkles className="h-5 w-5" />
            </div>

            <h2 className="text-lg font-semibold text-[var(--text-strong)]">
              Blog
            </h2>

            <p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">
              Travel stories, destination inspiration and useful guides are
              coming soon.
            </p>

            <span className="mt-5 inline-flex text-xs font-semibold uppercase tracking-wider text-brand-700">
              Coming soon
            </span>
          </section>

          {/* Careers */}
          <section
            id="careers"
            className="group rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-card)] p-6 transition-all duration-300 hover:-translate-y-1 hover:border-brand-200 hover:shadow-lg"
          >
            <div className="mb-5 flex h-11 w-11 items-center justify-center rounded-xl bg-brand-50 text-brand-700">
              <Users className="h-5 w-5" />
            </div>

            <h2 className="text-lg font-semibold text-[var(--text-strong)]">
              Careers
            </h2>

            <p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">
              We're not actively hiring right now, but we'd still love to hear
              from talented people who believe in what we're building.
            </p>

            <a
              href="mailto:careers@gokaasa.com"
              className="mt-5 inline-flex text-sm font-semibold text-brand-700 transition-colors hover:text-brand-800 hover:underline"
            >
              careers@gokaasa.com
            </a>
          </section>

          {/* Partner */}
          <section
            id="partner"
            className="group rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-card)] p-6 transition-all duration-300 hover:-translate-y-1 hover:border-brand-200 hover:shadow-lg"
          >
            <div className="mb-5 flex h-11 w-11 items-center justify-center rounded-xl bg-brand-50 text-brand-700">
              <Award className="h-5 w-5" />
            </div>

            <h2 className="text-lg font-semibold text-[var(--text-strong)]">
              Partner with us
            </h2>

            <p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">
              Have a property you'd like to showcase? Join Gokaasa and reach
              travellers looking for their next stay.
            </p>

            <a
              href="mailto:partners@gokaasa.com"
              className="mt-5 inline-flex text-sm font-semibold text-brand-700 transition-colors hover:text-brand-800 hover:underline"
            >
              partners@gokaasa.com
            </a>
          </section>
        </div>
      </section>

      {/* Bottom CTA */}
      <section className="px-4 pb-16 sm:px-6 lg:pb-24">
        <div className="mx-auto max-w-6xl overflow-hidden rounded-[2rem] bg-gradient-to-br from-slate-950 via-slate-900 to-brand-950 px-6 py-12 text-center shadow-[0_25px_70px_rgba(15,23,42,0.18)] sm:px-10 sm:py-16">
          <div className="mx-auto max-w-2xl">
            <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10">
              <Sparkles className="h-6 w-6 text-amber-300" />
            </div>

            <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
              Your next stay is waiting.
            </h2>

            <p className="mt-4 text-sm leading-7 text-slate-300 sm:text-base">
              Discover handpicked stays, compare options and book with
              confidence on Gokaasa.
            </p>

            <Link
              to="/destinations"
              className="mt-7 inline-flex items-center gap-2 rounded-xl bg-white px-6 py-3.5 text-sm font-bold text-slate-900 shadow-lg transition-all duration-300 hover:-translate-y-0.5 hover:bg-slate-100 hover:shadow-xl"
            >
              Explore hotels
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
