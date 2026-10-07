import { Mail, ShieldCheck, UserRound } from 'lucide-react';
import { Card } from '@/components/ui/surfaces.jsx';
import { PageHeader } from '@/components/shared/index.jsx';
import { useAuth } from '@/features/auth/AuthContext.jsx';
import { useDocumentMeta } from '@/hooks/useDocumentMeta.js';

/** Read-only for now: there is no profile-edit endpoint yet, so this shows the session's own details only. */
export function ProfilePage() {
  const { user } = useAuth();

  useDocumentMeta({ title: 'My Profile | Gokaasa', description: 'Your Gokaasa account details.' });

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6 px-4 py-10 sm:px-6">
      <PageHeader title="My Profile" description="Your account details." />

      <Card className="divide-y divide-[var(--border-subtle)]">
        <div className="flex items-center gap-3 p-5">
          <UserRound className="h-5 w-5 text-brand-700" aria-hidden="true" />
          <div>
            <p className="text-xs text-[var(--text-muted)]">Name</p>
            <p className="text-sm font-medium text-[var(--text-strong)]">{user?.firstName} {user?.lastName}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 p-5">
          <Mail className="h-5 w-5 text-brand-700" aria-hidden="true" />
          <div>
            <p className="text-xs text-[var(--text-muted)]">Email</p>
            <p className="text-sm font-medium text-[var(--text-strong)]">{user?.email}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 p-5">
          <ShieldCheck className="h-5 w-5 text-brand-700" aria-hidden="true" />
          <div>
            <p className="text-xs text-[var(--text-muted)]">Account type</p>
            <p className="text-sm font-medium capitalize text-[var(--text-strong)]">{user?.roles?.join(', ').toLowerCase()}</p>
          </div>
        </div>
      </Card>
      <p className="text-xs text-[var(--text-muted)]">Editing your name or password isn't available yet -- contact support if you need a change.</p>
    </div>
  );
}
