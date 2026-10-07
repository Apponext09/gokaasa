import { Award, ShieldCheck, Users } from 'lucide-react';
import { PageHeader } from '@/components/shared/index.jsx';
import { useDocumentMeta } from '@/hooks/useDocumentMeta.js';

const VALUES = [
  { icon: ShieldCheck, title: 'Verified hotels', text: 'Every listing is checked by our team before it goes live -- photos, amenities and policies included.' },
  { icon: Award, title: 'Honest pricing', text: 'Taxes and fees are shown with every price. The total you see is the total you pay.' },
  { icon: Users, title: 'Built for travellers', text: "We're a small, focused team building the booking experience we'd want to use ourselves." },
];

export function AboutPage() {
  useDocumentMeta({
    title: 'About Us | Gokaasa',
    description: 'Gokaasa is on a mission to make hotel booking transparent, fast and dependable.',
    canonicalPath: '/about',
  });

  return (
    <div className="mx-auto w-full max-w-4xl space-y-10 px-4 py-12 sm:px-6">
      <PageHeader title="About Gokaasa" description="Making travel accessible and extraordinary." />

      <div className="space-y-4 text-sm leading-7 text-[var(--text-body)]">
        <p>
          Gokaasa is a hotel booking platform built around one idea: finding and booking a great stay should be
          straightforward. We work directly with hotels to show real availability, real prices and real cancellation
          terms, so there are no surprises between search and check-in.
        </p>
        <p>
          From independent boutique stays to well-known chains, every hotel on Gokaasa is reviewed before it goes
          live, and every booking is backed by clear policies and responsive support.
        </p>
      </div>

      <div className="grid gap-5 sm:grid-cols-3">
        {VALUES.map(({ icon: Icon, title, text }) => (
          <div key={title} className="rounded-[var(--radius-card)] border border-[var(--border-subtle)] bg-[var(--surface-card)] p-5">
            <Icon className="mb-3 h-5 w-5 text-brand-700" aria-hidden="true" />
            <h2 className="mb-1 text-base font-semibold text-[var(--text-strong)]">{title}</h2>
            <p className="text-sm text-[var(--text-muted)]">{text}</p>
          </div>
        ))}
      </div>

      <section id="blog" className="space-y-2 border-t border-[var(--border-subtle)] pt-8">
        <h2 className="text-lg font-semibold text-[var(--text-strong)]">Blog</h2>
        <p className="text-sm text-[var(--text-muted)]">Travel stories and destination guides are coming soon.</p>
      </section>

      <section id="careers" className="space-y-2 border-t border-[var(--border-subtle)] pt-8">
        <h2 className="text-lg font-semibold text-[var(--text-strong)]">Careers</h2>
        <p className="text-sm text-[var(--text-muted)]">
          We're not actively hiring right now, but we'd still love to hear from you --{' '}
          <a href="mailto:careers@gokaasa.com" className="font-medium text-brand-700 hover:underline">careers@gokaasa.com</a>.
        </p>
      </section>

      <section id="partner" className="space-y-2 border-t border-[var(--border-subtle)] pt-8">
        <h2 className="text-lg font-semibold text-[var(--text-strong)]">Partner with us</h2>
        <p className="text-sm text-[var(--text-muted)]">
          List your property on Gokaasa --{' '}
          <a href="mailto:partners@gokaasa.com" className="font-medium text-brand-700 hover:underline">partners@gokaasa.com</a>.
        </p>
      </section>
    </div>
  );
}
