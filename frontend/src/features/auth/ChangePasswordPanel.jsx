import { useState } from 'react';
import { KeyRound, Mail, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button.jsx';
import { Alert, Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/surfaces.jsx';
import { authApi } from '@/services/endpoints.js';
import { useAuth } from './AuthContext.jsx';

export function ChangePasswordPanel() {
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);

  const handleSendResetLink = async () => {
    setError('');
    if (!user?.email) {
      setError('No email address associated with this account.');
      return;
    }

    setBusy(true);
    try {
      const result = await authApi.forgotPassword({ email: user.email });
      setSent(true);
      toast.success(result?.message || 'Password reset link sent to your email.');
    } catch (requestError) {
      setError(requestError.message || 'Failed to send password reset link.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <KeyRound className="h-5 w-5 text-brand-700" aria-hidden="true" /> Password &amp; Security
        </CardTitle>
        <CardDescription>
          Reset your password securely via email verification.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && <Alert tone="error">{error}</Alert>}

        {sent ? (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-4 dark:border-emerald-900/50 dark:bg-emerald-950/20">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400 mt-0.5 shrink-0" />
              <div className="space-y-1">
                <p className="text-sm font-medium text-emerald-900 dark:text-emerald-200">
                  Password reset link sent
                </p>
                <p className="text-xs text-emerald-700 dark:text-emerald-400">
                  We have sent instructions and a secure reset link to <strong>{user?.email}</strong>. Please check your inbox (and spam folder) to set your new password.
                </p>
                <div className="pt-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    loading={busy}
                    onClick={handleSendResetLink}
                  >
                    Resend link
                  </Button>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-lg border border-[var(--border)] p-4 bg-[var(--surface-muted)]">
            <div className="space-y-1">
              <p className="text-sm font-medium text-[var(--text)]">Change Password</p>
              <p className="text-xs text-[var(--text-muted)]">
                A secure reset link will be sent to <strong>{user?.email || 'your registered email'}</strong>.
              </p>
            </div>
            <Button
              type="button"
              loading={busy}
              disabled={busy}
              onClick={handleSendResetLink}
              className="gap-2 shrink-0"
            >
              <Mail className="h-4 w-4" />
              Send reset link
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
