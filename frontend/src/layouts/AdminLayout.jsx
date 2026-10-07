import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { BarChart3, Building2, LogOut, Menu, Search, X } from 'lucide-react';
import { Logo } from '@/components/shared/index.jsx';
import { Button } from '@/components/ui/button.jsx';
import { useAuth } from '@/features/auth/AuthContext.jsx';
import { cn } from '@/lib/utils.js';

const NAV = [
  { to: '/admin/dashboard', label: 'Dashboard', icon: BarChart3 },
  { to: '/admin/hotels', label: 'Hotels', icon: Building2, end: true },
  { to: '/admin/hotels/onboarding', label: 'Add hotel (import)', icon: Search },
];

function SidebarNav({ onNavigate }) {
  return (
    <nav aria-label="Admin" className="flex flex-col gap-1">
      {NAV.map(({ to, label, icon: Icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          onClick={onNavigate}
          className={({ isActive }) =>
            cn(
              'flex items-center gap-3 rounded-[var(--radius-control)] px-3 py-2 text-sm font-medium transition-colors',
              isActive ? 'bg-brand-50 text-brand-700' : 'text-[var(--text-body)] hover:bg-[var(--surface-muted)]',
            )
          }
        >
          <Icon className="h-4 w-4" aria-hidden="true" />
          {label}
        </NavLink>
      ))}
    </nav>
  );
}

export function AdminLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="min-h-screen md:flex">
      <aside className="hidden w-60 shrink-0 flex-col gap-6 border-r border-[var(--border-subtle)] bg-[var(--surface-card)] p-4 md:flex">
        <Logo to="/admin/dashboard" />
        <SidebarNav />
      </aside>

      {open && (
        <div className="fixed inset-0 z-40 md:hidden">
          <button className="absolute inset-0 bg-black/30" aria-label="Close menu" onClick={() => setOpen(false)} />
          <aside className="relative flex h-full w-64 flex-col gap-6 bg-[var(--surface-card)] p-4 shadow-lg">
            <div className="flex items-center justify-between">
              <Logo to="/admin/dashboard" />
              <Button variant="ghost" size="icon" aria-label="Close menu" onClick={() => setOpen(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            <SidebarNav onNavigate={() => setOpen(false)} />
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center justify-between gap-3 border-b border-[var(--border-subtle)] bg-[var(--surface-card)] px-4 sm:px-6">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" className="md:hidden" aria-label="Open menu" onClick={() => setOpen(true)}>
              <Menu className="h-5 w-5" />
            </Button>
            <span className="text-sm text-[var(--text-muted)]">Hotel operations</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden text-right text-sm sm:block">
              <p className="font-medium text-[var(--text-strong)]">{user?.firstName} {user?.lastName}</p>
              <p className="text-xs text-[var(--text-muted)]">{user?.roles?.join(' · ')}</p>
            </div>
            <Button variant="secondary" size="sm" onClick={handleLogout}>
              <LogOut className="h-4 w-4" aria-hidden="true" />
              <span className="hidden sm:inline">Sign out</span>
            </Button>
          </div>
        </header>
        <main id="main" className="flex-1 p-4 sm:p-6 lg:p-8">
          <div className="mx-auto w-full max-w-6xl">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
