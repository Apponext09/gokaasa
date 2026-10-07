import { Mail, Phone } from 'lucide-react';
import { PageHeader } from '@/components/shared/index.jsx';
import { useDocumentMeta } from '@/hooks/useDocumentMeta.js';

const FAQS = [
  { q: 'How do I cancel a booking?', a: "Open My Trips, select the booking, and use Cancel Booking. The refund you'll receive is shown before you confirm, based on the policy you booked under." },
  { q: 'When is my card charged?', a: 'Payment is collected at the time of booking, through our payment partner. You never need to pay anything extra at the hotel beyond what was shown at booking, unless you add paid extras on site.' },
  { q: 'Can I change my dates after booking?', a: "Date changes aren't available directly yet -- cancel (subject to the policy you booked) and make a new booking for your new dates." },
];

export function ContactPage() {
  useDocumentMeta({
    title: 'Contact Us | Gokaasa',
    description: 'Get in touch with Gokaasa support, or find answers to common questions.',
    canonicalPath: '/contact',
  });

  return (
    <div className="mx-auto w-full max-w-4xl space-y-10 px-4 py-12 sm:px-6">
      <PageHeader title="Contact Us" description="We're here to help, before and after you book." />

      <div className="grid gap-4 sm:grid-cols-2">
        <a href="tel:+919876543210" className="flex items-center gap-3 rounded-[var(--radius-card)] border border-[var(--border-subtle)] bg-[var(--surface-card)] p-5 hover:shadow-md">
          <Phone className="h-5 w-5 text-brand-700" aria-hidden="true" />
          <div>
            <p className="text-sm font-medium text-[var(--text-strong)]">Call support</p>
            <p className="text-sm text-[var(--text-muted)]">+91-9876543210</p>
          </div>
        </a>
        <a href="mailto:support@gokaasa.com" className="flex items-center gap-3 rounded-[var(--radius-card)] border border-[var(--border-subtle)] bg-[var(--surface-card)] p-5 hover:shadow-md">
          <Mail className="h-5 w-5 text-brand-700" aria-hidden="true" />
          <div>
            <p className="text-sm font-medium text-[var(--text-strong)]">Email support</p>
            <p className="text-sm text-[var(--text-muted)]">support@gokaasa.com</p>
          </div>
        </a>
      </div>

      <section id="faqs" className="space-y-4 border-t border-[var(--border-subtle)] pt-8">
        <h2 className="text-lg font-semibold text-[var(--text-strong)]">Frequently asked questions</h2>
        <dl className="space-y-4">
          {FAQS.map(({ q, a }) => (
            <div key={q}>
              <dt className="text-sm font-medium text-[var(--text-strong)]">{q}</dt>
              <dd className="mt-1 text-sm text-[var(--text-muted)]">{a}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section id="terms" className="space-y-2 border-t border-[var(--border-subtle)] pt-8">
        <h2 className="text-lg font-semibold text-[var(--text-strong)]">Terms &amp; Conditions</h2>
        <p className="text-sm text-[var(--text-muted)]">
          By booking through Gokaasa you agree to the rate, cancellation policy and guest details shown at checkout
          for that booking. Full terms are available on request from support.
        </p>
      </section>

      <section id="privacy" className="space-y-2 border-t border-[var(--border-subtle)] pt-8">
        <h2 className="text-lg font-semibold text-[var(--text-strong)]">Privacy Policy</h2>
        <p className="text-sm text-[var(--text-muted)]">
          We use your details only to process bookings, process payments and provide support. We never sell your
          data. Card details are handled entirely by our payment partner and never stored on Gokaasa's servers.
        </p>
      </section>

      <section id="refunds" className="space-y-2 border-t border-[var(--border-subtle)] pt-8">
        <h2 className="text-lg font-semibold text-[var(--text-strong)]">Refund Policy</h2>
        <p className="text-sm text-[var(--text-muted)]">
          Refunds follow the cancellation policy shown at the time of booking. Approved refunds are returned to your
          original payment method; timing depends on your bank or card issuer.
        </p>
      </section>
    </div>
  );
}
