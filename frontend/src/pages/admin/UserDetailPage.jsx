import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, LogOut, Pencil, X } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle, Skeleton, Badge, Alert } from '@/components/ui/surfaces.jsx';
import { Input, Select } from '@/components/ui/form-controls.jsx';
import { Button } from '@/components/ui/button.jsx';
import { ConfirmDialog } from '@/components/ui/dialog.jsx';
import { EmptyState, PageHeader, formatDateTime } from '@/components/shared/index.jsx';
import { adminApi } from '@/services/endpoints.js';
import { normalizeError } from '@/services/api.js';
import { PresenceDot } from '@/features/users/PresenceDot.jsx';
import { relativeTimeLabel } from '@/features/users/presenceFormat.js';
import { roleLabel } from '@/features/auth/roleLabels.js';

const STAFF_ROLE_OPTIONS = ['SALES_EXECUTIVE', 'HOTEL_ONBOARDING_EXECUTIVE', 'HOTEL_REVIEW_EXECUTIVE'];

export function UserDetailPage() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const [user, setUser] = useState(null);
  const [error, setError] = useState(null);
  const [statusConfirmOpen, setStatusConfirmOpen] = useState(false);
  const [signOutConfirmOpen, setSignOutConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [revokingId, setRevokingId] = useState(null);
  const [now, setNow] = useState(Date.now());
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);

  const load = () => {
    setError(null);
    adminApi.getUser(id).then(setUser).catch((err) => setError(normalizeError(err).message));
  };
  useEffect(load, [id]);

  const startEdit = (currentUser) => {
    const currentRole = currentUser.roles[0];
    setForm({
      firstName: currentUser.firstName ?? '',
      lastName: currentUser.lastName ?? '',
      email: currentUser.email ?? '',
      phone: currentUser.phone ?? '',
      role: currentRole,
      isActive: currentUser.isActive,
      hotelReviewAccess: currentUser.hotelReviewAccess ?? false,
    });
    setSaveError(null);
    setEditing(true);
  };

  useEffect(() => {
    if (user && params.get('edit') === '1' && !editing) startEdit(user);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const saveEdit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setSaveError(null);
    try {
      const roleEditable = STAFF_ROLE_OPTIONS.includes(user.roles[0]);
      const updated = await adminApi.updateStaff(id, {
        firstName: form.firstName,
        lastName: form.lastName,
        email: form.email,
        phone: form.phone,
        ...(roleEditable && { role: form.role }),
        isActive: form.isActive,
        hotelReviewAccess: (roleEditable ? form.role : user.roles[0]) === 'HOTEL_ONBOARDING_EXECUTIVE' ? form.hotelReviewAccess : false,
      });
      setUser(updated);
      setEditing(false);
      toast.success('User updated');
    } catch (err) {
      setSaveError(normalizeError(err).message);
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    const ticker = setInterval(() => setNow(Date.now()), 10_000);
    return () => clearInterval(ticker);
  }, []);

  const toggleStatus = async () => {
    setBusy(true);
    try {
      const next = !user.isActive;
      const updated = await adminApi.setUserStatus(id, next);
      setUser((prev) => ({ ...prev, ...updated }));
      setStatusConfirmOpen(false);
      toast.success(next ? 'Account reactivated' : 'Account deactivated and signed out everywhere');
    } catch (err) {
      toast.error(normalizeError(err).message);
    } finally {
      setBusy(false);
    }
  };

  const forceSignOut = async () => {
    setBusy(true);
    try {
      await adminApi.forceSignOutUser(id);
      setSignOutConfirmOpen(false);
      toast.success('Every session was signed out. Open browser tabs stay logged in for up to 15 minutes until their access token naturally expires.');
    } catch (err) {
      toast.error(normalizeError(err).message);
    } finally {
      setBusy(false);
    }
  };

  const revokeSession = async (sessionId) => {
    setRevokingId(sessionId);
    try {
      await adminApi.revokeUserSession(id, sessionId);
      setUser((prev) => ({ ...prev, sessions: prev.sessions.map((s) => (s.id === sessionId ? { ...s, active: false, endedAt: new Date().toISOString() } : s)) }));
      toast.success('Session ended');
    } catch (err) {
      toast.error(normalizeError(err).message);
    } finally {
      setRevokingId(null);
    }
  };

  if (error) {
    return (
      <div className="space-y-4">
        <Link to="/admin/users" className="inline-flex items-center gap-1 text-sm text-brand-600 hover:underline"><ArrowLeft className="h-4 w-4" /> Back to users</Link>
        <EmptyState title="We couldn't load this user" description={error} action={<Button onClick={load}>Try again</Button>} />
      </div>
    );
  }
  if (!user) return <Skeleton className="h-64" />;

  return (
    <div className="space-y-6">
      <Link to="/admin/users" className="inline-flex items-center gap-1 text-sm text-brand-600 hover:underline"><ArrowLeft className="h-4 w-4" /> Back to users</Link>
      <PageHeader
        title={user.name || user.email}
        description={user.email}
        actions={
          <>
            {!user.isActive && <Badge tone="danger">Inactive</Badge>}
            <Button variant="secondary" size="sm" onClick={() => startEdit(user)}>
              <Pencil className="h-3.5 w-3.5" aria-hidden="true" /> Edit
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setSignOutConfirmOpen(true)}>
              <LogOut className="h-3.5 w-3.5" aria-hidden="true" /> Force sign-out
            </Button>
            <Button variant={user.isActive ? 'danger-outline' : 'secondary'} size="sm" onClick={() => setStatusConfirmOpen(true)}>
              {user.isActive ? 'Deactivate account' : 'Reactivate account'}
            </Button>
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="p-4"><p className="text-xs text-[var(--text-muted)]">Roles</p><div className="mt-1 flex gap-1">{user.roles.map((r) => <Badge key={r} tone={r === 'ADMIN' ? 'premium' : r === 'HOTEL_OWNER' ? 'brand' : 'neutral'}>{roleLabel(r)}</Badge>)}</div></Card>
        <Card className="p-4"><p className="text-xs text-[var(--text-muted)]">Presence</p><div className="mt-1"><PresenceDot lastHeartbeatAt={user.session?.lastHeartbeatAt} now={now} /></div></Card>
        <Card className="p-4"><p className="text-xs text-[var(--text-muted)]">Last activity</p><p className="text-sm font-medium text-[var(--text-strong)]" title={formatDateTime(user.session?.lastHeartbeatAt ?? user.lastLoginAt)}>{relativeTimeLabel(user.session?.lastHeartbeatAt ?? user.lastLoginAt, now)}</p></Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Profile</CardTitle></CardHeader>
        <CardContent className="pt-0">
          {editing ? (
            <form onSubmit={saveEdit} className="space-y-4">
              {saveError && <Alert tone="error">{saveError}</Alert>}
              <div className="grid gap-3 sm:grid-cols-2">
                <Input required placeholder="First name" aria-label="First name" value={form.firstName} onChange={(e) => setForm((v) => ({ ...v, firstName: e.target.value }))} />
                <Input required placeholder="Last name" aria-label="Last name" value={form.lastName} onChange={(e) => setForm((v) => ({ ...v, lastName: e.target.value }))} />
                <Input required type="email" placeholder="Email" aria-label="Email" value={form.email} onChange={(e) => setForm((v) => ({ ...v, email: e.target.value }))} />
                <Input placeholder="Phone" aria-label="Phone" value={form.phone} onChange={(e) => setForm((v) => ({ ...v, phone: e.target.value }))} />
                {STAFF_ROLE_OPTIONS.includes(user.roles[0]) ? (
                  <Select aria-label="Role" value={form.role} onChange={(e) => setForm((v) => ({ ...v, role: e.target.value, hotelReviewAccess: false }))}>
                    <option value="SALES_EXECUTIVE">Sales Executive</option>
                    <option value="HOTEL_ONBOARDING_EXECUTIVE">Hotel Onboarding Executive</option>
                    <option value="HOTEL_REVIEW_EXECUTIVE">Hotel Review Executive</option>
                  </Select>
                ) : (
                  <p className="flex items-center text-sm"><span className="text-[var(--text-muted)]">Role: </span><span className="ml-1 font-medium text-[var(--text-strong)]">{roleLabel(user.roles[0])}</span></p>
                )}
                <Select aria-label="Account status" value={form.isActive ? 'active' : 'inactive'} onChange={(e) => setForm((v) => ({ ...v, isActive: e.target.value === 'active' }))}>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </Select>
                {form.role === 'HOTEL_ONBOARDING_EXECUTIVE' && (
                  <Select
                    aria-label="Hotel Onboarding Review Access"
                    value={form.hotelReviewAccess ? 'yes' : 'no'}
                    onChange={(e) => setForm((v) => ({ ...v, hotelReviewAccess: e.target.value === 'yes' }))}
                  >
                    <option value="no">Review access: No</option>
                    <option value="yes">Review access: Yes</option>
                  </Select>
                )}
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="secondary" onClick={() => setEditing(false)}>Cancel</Button>
                <Button type="submit" loading={saving}>Save changes</Button>
              </div>
            </form>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              <p className="text-sm"><span className="text-[var(--text-muted)]">User ID: </span><span className="font-medium text-[var(--text-strong)]">{user.id}</span></p>
              <p className="text-sm"><span className="text-[var(--text-muted)]">Phone: </span><span className="font-medium text-[var(--text-strong)]">{user.phone ?? 'Not available'}</span></p>
              <p className="text-sm"><span className="text-[var(--text-muted)]">Joined: </span><span className="font-medium text-[var(--text-strong)]">{formatDateTime(user.joinedAt)}</span></p>
              <p className="text-sm"><span className="text-[var(--text-muted)]">Last login: </span><span className="font-medium text-[var(--text-strong)]">{formatDateTime(user.lastLoginAt)}</span></p>
              <p className="text-sm"><span className="text-[var(--text-muted)]">Current page: </span><span className="font-medium text-[var(--text-strong)]">{user.session?.routeLabel ?? 'Not available'}</span></p>
              <p className="text-sm"><span className="text-[var(--text-muted)]">Device: </span><span className="font-medium text-[var(--text-strong)]">{user.session ? [user.session.platform, user.session.browser, user.session.os].filter(Boolean).join(' · ') : 'Not available'}</span></p>
              {user.roles.includes('HOTEL_ONBOARDING_EXECUTIVE') && (
                <p className="text-sm"><span className="text-[var(--text-muted)]">Hotel Onboarding Review Access: </span><span className="font-medium text-[var(--text-strong)]">{user.hotelReviewAccess ? 'Yes' : 'No'}</span></p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Sessions</CardTitle></CardHeader>
        <CardContent className="pt-0">
          {user.sessions.length === 0 ? (
            <p className="text-sm text-[var(--text-muted)]">No recorded sessions yet.</p>
          ) : (
            <div className="divide-y divide-[var(--border-subtle)]">
              {user.sessions.map((s) => (
                <div key={s.id} className="flex items-center justify-between gap-3 py-3 text-sm">
                  <div>
                    <p className="font-medium text-[var(--text-strong)]">
                      {[s.platform, s.browser, s.os].filter(Boolean).join(' · ') || 'Not available'}
                      {s.active && <Badge tone="success" className="ml-2">Active</Badge>}
                    </p>
                    <p className="text-xs text-[var(--text-muted)]">
                      {s.routeLabel} · Started {formatDateTime(s.startedAt)} · Last activity {relativeTimeLabel(s.lastHeartbeatAt, now)}
                    </p>
                  </div>
                  {s.active && (
                    <Button variant="ghost" size="sm" loading={revokingId === s.id} onClick={() => revokeSession(s.id)}>
                      <X className="h-3.5 w-3.5" aria-hidden="true" /> End session
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <ConfirmDialog
        open={statusConfirmOpen}
        title={user.isActive ? `Deactivate ${user.name || user.email}?` : `Reactivate ${user.name || user.email}?`}
        description={user.isActive ? 'They will be signed out everywhere and unable to sign in again until reactivated.' : 'They will be able to sign in again.'}
        confirmLabel={user.isActive ? 'Deactivate account' : 'Reactivate account'}
        tone={user.isActive ? 'danger' : 'primary'}
        loading={busy}
        onConfirm={toggleStatus}
        onCancel={() => setStatusConfirmOpen(false)}
      />
      <ConfirmDialog
        open={signOutConfirmOpen}
        title={`Force sign-out for ${user.name || user.email}?`}
        description="Every refresh session is revoked immediately. An access token already in a browser tab stays valid for up to 15 minutes until it naturally expires -- it cannot be revoked early."
        confirmLabel="Force sign-out"
        tone="danger"
        loading={busy}
        onConfirm={forceSignOut}
        onCancel={() => setSignOutConfirmOpen(false)}
      />
    </div>
  );
}
