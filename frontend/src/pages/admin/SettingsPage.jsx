import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Card } from '@/components/ui/surfaces.jsx';
import { Button } from '@/components/ui/button.jsx';
import { Input } from '@/components/ui/form-controls.jsx';
import { FormField, PageHeader } from '@/components/shared/index.jsx';
import { useAuth } from '@/features/auth/AuthContext.jsx';
import { adminApi } from '@/services/endpoints.js';
import { normalizeError } from '@/services/api.js';

function ReadOnlyRow({ label, value }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2 text-sm">
      <dt className="text-[var(--text-muted)]">{label}</dt>
      <dd className="font-medium text-[var(--text-strong)]">{value}</dd>
    </div>
  );
}

export function SettingsPage() {
  const { isAdmin } = useAuth();
  const [settings, setSettings] = useState(null);
  const [form, setForm] = useState({ companyName: '', supportPhone: '', supportEmail: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    adminApi
      .getSettings()
      .then((result) => {
        if (cancelled) return;
        setSettings(result);
        setForm(result.platform);
      })
      .catch((err) => !cancelled && setError(normalizeError(err).message));
    return () => {
      cancelled = true;
    };
  }, []);

  const save = async (event) => {
    event.preventDefault();
    setSaving(true);
    try {
      const result = await adminApi.updateSettings(form);
      setSettings(result);
      toast.success('Settings saved.');
    } catch (err) {
      toast.error(normalizeError(err).message);
    } finally {
      setSaving(false);
    }
  };

  if (!settings) return <p className="text-sm text-[var(--text-muted)]">{error ?? 'Loading settings…'}</p>;

  return (
    <div className="space-y-6">
      <PageHeader title="Settings" description={isAdmin ? 'Platform-wide configuration.' : 'Platform configuration (read-only for your role).'} />

      <Card className="p-5">
        <h2 className="mb-1 text-base font-semibold text-[var(--text-strong)]">Platform</h2>
        <p className="mb-4 text-sm text-[var(--text-muted)]">Shown on the customer-facing site's support and contact pages.</p>
        <form onSubmit={save} className="grid gap-4 sm:grid-cols-2">
          <FormField id="companyName" label="Company name">
            <Input id="companyName" value={form.companyName} disabled={!isAdmin} onChange={(e) => setForm((f) => ({ ...f, companyName: e.target.value }))} />
          </FormField>
          <FormField id="supportPhone" label="Support phone">
            <Input id="supportPhone" value={form.supportPhone} disabled={!isAdmin} onChange={(e) => setForm((f) => ({ ...f, supportPhone: e.target.value }))} />
          </FormField>
          <FormField id="supportEmail" label="Support email" className="sm:col-span-2">
            <Input id="supportEmail" type="email" value={form.supportEmail} disabled={!isAdmin} onChange={(e) => setForm((f) => ({ ...f, supportEmail: e.target.value }))} />
          </FormField>
          {isAdmin && (
            <div className="sm:col-span-2">
              <Button type="submit" loading={saving}>Save changes</Button>
            </div>
          )}
        </form>
      </Card>

      <Card className="p-5">
        <h2 className="mb-1 text-base font-semibold text-[var(--text-strong)]">Booking</h2>
        <p className="mb-2 text-sm text-[var(--text-muted)]">Read-only -- changing these affects live holds and cancellation deadlines, so they are set at deployment, not here.</p>
        <dl className="divide-y divide-[var(--border-subtle)]">
          <ReadOnlyRow label="Hold duration" value={`${settings.booking.holdDurationMinutes} minutes`} />
          <ReadOnlyRow label="Business timezone" value={settings.booking.businessTimezone} />
        </dl>
      </Card>

      <Card className="p-5">
        <h2 className="mb-1 text-base font-semibold text-[var(--text-strong)]">Notifications</h2>
        <dl className="divide-y divide-[var(--border-subtle)]">
          <ReadOnlyRow label="Email delivery" value={settings.notifications.emailConfigured ? 'Configured (SMTP)' : 'Not configured -- emails are logged, not sent'} />
        </dl>
      </Card>

      <Card className="p-5">
        <h2 className="mb-1 text-base font-semibold text-[var(--text-strong)]">Branding</h2>
        <p className="text-sm text-[var(--text-muted)]">The logo and favicon are managed in the codebase, not here, to avoid an unreviewed brand change going live instantly.</p>
      </Card>

      <Card className="p-5">
        <h2 className="mb-1 text-base font-semibold text-[var(--text-strong)]">Security</h2>
        <dl className="divide-y divide-[var(--border-subtle)]">
          <ReadOnlyRow label="Password reset link validity" value={`${settings.security.passwordResetTtlMinutes} minutes`} />
        </dl>
      </Card>
    </div>
  );
}
