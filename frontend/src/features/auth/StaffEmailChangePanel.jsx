import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MailCheck } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button.jsx';
import { Input, Label } from '@/components/ui/form-controls.jsx';
import { Alert, Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/surfaces.jsx';
import { useAuth } from './AuthContext.jsx';
import { authApi } from '@/services/endpoints.js';

function expiryLabel(value) {
  if (!value) return '';
  return new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

export function StaffEmailChangePanel() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [pending, setPending] = useState(undefined);
  const [newEmail, setNewEmail] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    authApi.pendingEmailChange()
      .then((result) => !cancelled && setPending(result))
      .catch((requestError) => !cancelled && setError(requestError.message))
      .finally(() => !cancelled && setPending((value) => value === undefined ? null : value));
    return () => { cancelled = true; };
  }, []);

  const requestChange = async (event) => {
    event.preventDefault();
    setBusy('request');
    setError('');
    try {
      const result = await authApi.requestEmailChange({ newEmail: newEmail.trim(), currentPassword });
      setPending(result.pending);
      setCurrentPassword('');
      setCode('');
      toast.success(result.message);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(null);
    }
  };

  const verify = async (event) => {
    event.preventDefault();
    setBusy('verify');
    setError('');
    try {
      const result = await authApi.verifyEmailChange({ code: code.trim() });
      toast.success(result.message);
      await logout();
      navigate('/login', { replace: true });
    } catch (requestError) {
      setError(requestError.message);
      setBusy(null);
    }
  };

  const resend = async () => {
    setBusy('resend');
    setError('');
    try {
      const result = await authApi.resendEmailChange();
      setPending(result.pending);
      setCode('');
      toast.success(result.message);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(null);
    }
  };

  const cancel = async () => {
    setBusy('cancel');
    setError('');
    try {
      await authApi.cancelEmailChange();
      setPending(null);
      setNewEmail('');
      setCode('');
      toast.success('Email change cancelled');
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><MailCheck className="h-5 w-5 text-brand-700" aria-hidden="true" /> Change sign-in email</CardTitle>
        <CardDescription>Your new address becomes active only after you verify the code sent to it. No administrator approval is required.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && <Alert tone="error">{error}</Alert>}
        {pending === undefined ? (
          <p className="text-sm text-[var(--text-muted)]">Checking for a pending email change…</p>
        ) : pending ? (
          <form className="space-y-4" onSubmit={verify}>
            <Alert tone={pending.expired ? 'warning' : 'info'} title={pending.expired ? 'Verification code expired' : 'Verification required'}>
              A code was sent to <strong>{pending.newEmail}</strong>. {pending.expired ? 'Request a new code to continue.' : `It expires on ${expiryLabel(pending.expiresAt)}.`}
            </Alert>
            <div className="space-y-1.5">
              <Label htmlFor="staff-email-code">6-digit verification code</Label>
              <Input
                id="staff-email-code"
                value={code}
                onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="123456"
                disabled={pending.expired || Boolean(busy)}
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="submit" loading={busy === 'verify'} disabled={pending.expired || code.length !== 6 || Boolean(busy)}>Verify and change email</Button>
              <Button variant="secondary" onClick={resend} loading={busy === 'resend'} disabled={Boolean(busy)}>Resend code</Button>
              <Button variant="ghost" onClick={cancel} loading={busy === 'cancel'} disabled={Boolean(busy)}>Cancel</Button>
            </div>
          </form>
        ) : (
          <form className="space-y-4" onSubmit={requestChange}>
            <div className="space-y-1.5">
              <Label htmlFor="staff-current-email">Current email</Label>
              <Input id="staff-current-email" value={user?.email ?? ''} disabled />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="staff-new-email">New email</Label>
              <Input id="staff-new-email" type="email" value={newEmail} onChange={(event) => setNewEmail(event.target.value)} autoComplete="email" placeholder="name@company.com" disabled={Boolean(busy)} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="staff-current-password">Current password</Label>
              <Input id="staff-current-password" type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} autoComplete="current-password" disabled={Boolean(busy)} required />
            </div>
            <Button type="submit" loading={busy === 'request'} disabled={!newEmail.trim() || !currentPassword || Boolean(busy)}>Send verification code</Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
