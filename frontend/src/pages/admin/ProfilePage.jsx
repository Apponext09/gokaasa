import { Mail, ShieldCheck, UserRound } from 'lucide-react';
import { Card } from '@/components/ui/surfaces.jsx';
import { PageHeader } from '@/components/shared/index.jsx';
import { useAuth } from '@/features/auth/AuthContext.jsx';

/** Read-only, same as the customer-facing profile page: there is no profile-edit endpoint yet. */
export function AdminProfilePage() {
  const { user } = useAuth();

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6">
      <PageHeader title="My Profile" description="Your Gokaasa staff account." />

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
            <p className="text-xs text-[var(--text-muted)]">Role</p>
            <p className="text-sm font-medium text-[var(--text-strong)]">{user?.roles?.join(', ')}</p>
          </div>
        </div>
      </Card>
      <p className="text-xs text-[var(--text-muted)]">Editing your name or password isn't available yet -- contact an administrator if you need a change.</p>
    </div>
  );
}
