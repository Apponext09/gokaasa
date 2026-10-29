import { ChevronRight, Mail, ShieldCheck, UserRound, Users } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Card } from '@/components/ui/surfaces.jsx';
import { PageHeader } from '@/components/shared/index.jsx';
import { useAuth } from '@/features/auth/AuthContext.jsx';
import { StaffEmailChangePanel } from '@/features/auth/StaffEmailChangePanel.jsx';
import { setStaffCustomerView } from '@/features/auth/viewMode.js';

export function AdminProfilePage() {
  const { user, isStaff } = useAuth();
  const navigate = useNavigate();

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
        {isStaff && (
          <button
            type="button"
            onClick={() => {
              setStaffCustomerView(true);
              navigate('/');
            }}
            className="flex w-full items-center gap-3 p-5 text-left transition-colors hover:bg-[var(--surface-muted)]"
          >
            <Users className="h-5 w-5 text-brand-700" aria-hidden="true" />
            <div className="flex-1">
              <p className="text-xs text-[var(--text-muted)]">Browsing</p>
              <p className="text-sm font-medium text-[var(--text-strong)]">Switch to customer view</p>
            </div>
            <ChevronRight className="h-4 w-4 text-[var(--text-muted)]" aria-hidden="true" />
          </button>
        )}
      </Card>
      <StaffEmailChangePanel />
      <p className="text-xs text-[var(--text-muted)]">Editing your name or password isn't available yet.</p>
    </div>
  );
}
