import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { KeyRound } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button.jsx';
import { Input, Label } from '@/components/ui/form-controls.jsx';
import { Alert, Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/surfaces.jsx';
import { authApi } from '@/services/endpoints.js';
import { useAuth } from './AuthContext.jsx';

const passwordRule = /^(?=.*[A-Za-z])(?=.*\d).{10,128}$/;

export function ChangePasswordPanel() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    if (!passwordRule.test(newPassword)) {
      setError('New password must be 10–128 characters and include a letter and a number.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('New password and confirmation do not match.');
      return;
    }

    setBusy(true);
    try {
      const result = await authApi.changePassword({ currentPassword, newPassword });
      toast.success(result.message);
      await logout();
      navigate('/login', { replace: true });
    } catch (requestError) {
      setError(requestError.message);
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><KeyRound className="h-5 w-5 text-brand-700" aria-hidden="true" /> Change password</CardTitle>
        <CardDescription>Use your current password. After it changes, you will be signed out on every device.</CardDescription>
      </CardHeader>
      <CardContent>
        {user?.isGuest ? (
          <Alert tone="info">This account does not have a password yet. Sign out and use Forgot password to verify your email and create one.</Alert>
        ) : (
          <form className="space-y-4" onSubmit={submit}>
            {error && <Alert tone="error">{error}</Alert>}
            <div className="space-y-1.5">
              <Label htmlFor="profile-current-password">Current password</Label>
              <Input id="profile-current-password" type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} autoComplete="current-password" disabled={busy} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="profile-new-password">New password</Label>
              <Input id="profile-new-password" type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} autoComplete="new-password" disabled={busy} required />
              <p className="text-xs text-[var(--text-muted)]">At least 10 characters, including a letter and a number.</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="profile-confirm-password">Confirm new password</Label>
              <Input id="profile-confirm-password" type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} autoComplete="new-password" disabled={busy} required />
            </div>
            <Button type="submit" loading={busy} disabled={!currentPassword || !newPassword || !confirmPassword || busy}>Change password</Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
