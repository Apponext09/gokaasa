import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { Heart, LogOut, Menu, UserRound, X } from 'lucide-react';
import { Logo } from '@/components/shared/index.jsx';
import { Button } from '@/components/ui/button.jsx';
import { useAuth } from '@/features/auth/AuthContext.jsx';
import { discoveryApi } from '@/services/endpoints.js';
import { cn } from '@/lib/utils.js';

const NAV_LINKS = [
  { to: '/destinations', label: 'Destinations' },
  { to: '/my-trips', label: 'My Trips', authOnly: true },
  { to: '/wishlist', label: 'Wishlist', authOnly: true, mobileOnly: true },
];

function NavLinks({ className, onNavigate, mobile = false }) {
  const { isAuthenticated } = useAuth();
  return (
    <>
      {NAV_LINKS.filter((link) => (!link.authOnly || isAuthenticated) && (mobile || !link.mobileOnly)).map((link) => (
        <NavLink
          key={link.to}
          to={link.to}
          onClick={onNavigate}
          className={({ isActive }) =>
            cn(className, 'transition-colors hover:text-brand-600', isActive ? 'text-brand-700' : 'text-[var(--text-body)]')
          }
        >
          {link.label}
        </NavLink>
      ))}
    </>
  );
}

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

function FooterTrustLine() {
  const [stats, setStats] = useState(null);

  useEffect(() => {
    let cancelled = false;
    discoveryApi.stats().then((data) => !cancelled && setStats(data)).catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const parts = [];
  if (stats?.destinations?.countries > 0) parts.push(`${stats.destinations.countries} countr${stats.destinations.countries === 1 ? 'y' : 'ies'}`);
  if (stats?.hotels?.published > 0) parts.push(`${stats.hotels.published} hotel${stats.hotels.published === 1 ? '' : 's'}`);

  if (parts.length === 0) return <span>Verified hotels, secure payments, support when you need it.</span>;
  return <span>Trusted stays across {parts.join(' and ')}.</span>;
}

export function CustomerLayout() {
  const { isAuthenticated, status } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-30 border-b border-[var(--border-subtle)] bg-[var(--surface-card)]/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
          <div className="flex items-center gap-8">
            <Logo />
            <nav aria-label="Main" className="hidden items-center gap-6 md:flex">
              <NavLinks className="text-sm font-medium" />
            </nav>
          </div>
          <div className="flex items-center gap-2">
            {isAuthenticated && (
              <Link
                to="/wishlist"
                aria-label="Wishlist"
                title="Wishlist"
                className="hidden h-9 w-9 items-center justify-center rounded-full text-[var(--text-body)] hover:bg-[var(--surface-muted)] md:inline-flex"
              >
                <Heart className="h-4 w-4" aria-hidden="true" />
              </Link>
            )}
            {status !== 'loading' && (isAuthenticated ? <UserMenu /> : <GuestLinks />)}
            <button
              type="button"
              aria-label={menuOpen ? 'Close menu' : 'Open menu'}
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((open) => !open)}
              className="inline-flex h-9 w-9 items-center justify-center rounded-[var(--radius-control)] text-[var(--text-body)] hover:bg-[var(--surface-muted)] md:hidden"
            >
              {menuOpen ? <X className="h-5 w-5" aria-hidden="true" /> : <Menu className="h-5 w-5" aria-hidden="true" />}
            </button>
          </div>
        </div>
      </header>

      {menuOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <button aria-label="Close menu" className="absolute inset-0 bg-black/30" onClick={() => setMenuOpen(false)} tabIndex={-1} />
          <nav
            aria-label="Main"
            className="absolute inset-x-0 top-16 flex flex-col gap-1 border-b border-[var(--border-subtle)] bg-[var(--surface-card)] p-4 shadow-xl shadow-black/10"
          >
            <NavLinks className="rounded-[var(--radius-control)] px-3 py-2.5 text-base font-medium" onNavigate={() => setMenuOpen(false)} mobile />
          </nav>
        </div>
      )}

      <main id="main" className="flex-1">
        <Outlet />
      </main>

      <footer className="border-t border-[var(--border-subtle)] bg-[var(--surface-card)]">
        <div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 py-6 text-sm text-[var(--text-muted)] sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <span>© {new Date().getFullYear()} Gokaasa. Making travel accessible and extraordinary.</span>
          <FooterTrustLine />
        </div>
      </footer>
    </div>
  );
}
