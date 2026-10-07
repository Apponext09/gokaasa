import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { LogOut, UserRound } from 'lucide-react';
import { Logo } from '@/components/shared/index.jsx';
import { Button } from '@/components/ui/button.jsx';
import { useAuth } from '@/features/auth/AuthContext.jsx';
import { cn } from '@/lib/utils.js';

function UserMenu() {
  const { user, logout, isStaff } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/', { replace: true });
  };

  return (
    <div className="flex items-center gap-2">
      {isStaff && (
        <Link to="/admin/dashboard" className="hidden text-sm font-medium text-brand-700 hover:underline sm:inline">
          Admin
        </Link>
      )}
      <span className="hidden items-center gap-1.5 text-sm text-[var(--text-body)] md:inline-flex">
        <UserRound className="h-4 w-4" aria-hidden="true" />
        {user?.firstName}
      </span>
      <Button variant="ghost" size="sm" onClick={handleLogout} aria-label="Sign out">
        <LogOut className="h-4 w-4" aria-hidden="true" />
        <span className="hidden sm:inline">Sign out</span>
      </Button>
    </div>
  );
}

function GuestLinks() {
  return (
    <div className="flex items-center gap-2">
      <Link
        to="/login"
        className="inline-flex h-8 items-center rounded-[var(--radius-control)] px-3 text-sm font-medium text-[var(--text-body)] hover:bg-[var(--surface-muted)]"
      >
        Sign in
      </Link>
      <Link
        to="/register"
        className="inline-flex h-8 items-center rounded-[var(--radius-control)] bg-brand-600 px-3 text-sm font-medium text-white hover:bg-brand-700"
      >
        Create account
      </Link>
    </div>
  );
}

export function CustomerLayout() {
  const { isAuthenticated, status } = useAuth();

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-30 border-b border-[var(--border-subtle)] bg-[var(--surface-card)]/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
          <div className="flex items-center gap-8">
            <Logo />
            <nav aria-label="Main" className="hidden items-center gap-6 md:flex">
              <NavLink
                to="/"
                end
                className={({ isActive }) =>
                  cn('text-sm font-medium transition-colors hover:text-brand-600', isActive ? 'text-brand-700' : 'text-[var(--text-body)]')
                }
              >
                Home
              </NavLink>
            </nav>
          </div>
          {status !== 'loading' && (isAuthenticated ? <UserMenu /> : <GuestLinks />)}
        </div>
      </header>

      <main id="main" className="flex-1">
        <Outlet />
      </main>

      <footer className="border-t border-[var(--border-subtle)] bg-[var(--surface-card)]">
        <div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 py-6 text-sm text-[var(--text-muted)] sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <span>© {new Date().getFullYear()} Gokaasa. Making travel accessible and extraordinary.</span>
          <span>Trusted by 2M+ travellers across 180+ countries.</span>
        </div>
      </footer>
    </div>
  );
}
