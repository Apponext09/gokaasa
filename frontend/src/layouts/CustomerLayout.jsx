import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet } from 'react-router-dom';
import { Heart, Menu, X } from 'lucide-react';
import { Logo } from '@/components/shared/index.jsx';
import { ProfileMenu } from '@/components/shared/ProfileMenu.jsx';
import { NotificationBell } from '@/components/shared/NotificationBell.jsx';
import { Button } from '@/components/ui/button.jsx';
import { useAuth } from '@/features/auth/AuthContext.jsx';
import { discoveryApi } from '@/services/endpoints.js';
import { cn } from '@/lib/utils.js';

const NAV_LINKS = [
  { to: '/', label: 'Home', end: true },
  { to: '/destinations', label: 'Hotels' },
  { to: '/destinations', label: 'Top Destinations', key: 'top-destinations' },
  { to: '/about', label: 'About Us' },
  { to: '/contact', label: 'Contact Us' },
];

function NavLinks({ className, onNavigate }) {
  return (
    <>
      {NAV_LINKS.map((link) => (
        <NavLink
          key={link.key ?? link.to}
          to={link.to}
          end={link.end}
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

function GuestLinks() {
  return (
    <div className="flex items-center gap-2">
      <Link
        to="/login"
        className="inline-flex h-8 items-center rounded-[var(--radius-control)] px-3 text-sm font-medium text-[var(--text-body)] hover:bg-[var(--surface-muted)]"
      >
        Login
      </Link>
      <Link
        to="/register"
        className="inline-flex h-8 items-center rounded-[var(--radius-control)] bg-brand-600 px-3 text-sm font-medium text-white hover:bg-brand-700"
      >
        Sign Up
      </Link>
    </div>
  );
}

/** Body-scroll lock while the mobile drawer is open. */
function useBodyScrollLock(locked) {
  useEffect(() => {
    if (!locked) return undefined;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [locked]);
}

function MobileDrawer({ open, onClose }) {
  useBodyScrollLock(open);
  const { isAuthenticated, isStaff, logout } = useAuth();

  const handleLogout = async () => {
    onClose();
    await logout();
  };

  return (
    <div
      className={cn(
        'fixed inset-0 z-40 md:hidden transition-opacity duration-300 motion-reduce:transition-none',
        open ? 'opacity-100' : 'pointer-events-none opacity-0',
      )}
    >
      <button aria-label="Close menu" className="absolute inset-0 bg-black/40" onClick={onClose} tabIndex={open ? 0 : -1} />
      <aside
        inert={!open}
        aria-label="Main"
        className={cn(
          'absolute inset-y-0 right-0 flex w-80 max-w-[85vw] flex-col gap-1 overflow-y-auto bg-[var(--surface-card)] p-5 shadow-xl shadow-black/10 transition-transform duration-300 motion-reduce:transition-none',
          open ? 'translate-x-0' : 'translate-x-full',
        )}
      >
        <div className="mb-4 flex items-center justify-between">
          <Logo />
          <Button variant="ghost" size="icon" aria-label="Close menu" onClick={onClose}>
            <X className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>
        <NavLinks className="rounded-[var(--radius-control)] px-3 py-2.5 text-base font-medium" onNavigate={onClose} />
        {isAuthenticated && (
          <>
            <div className="my-2 border-t border-[var(--border-subtle)]" />
            <Link to="/my-trips" onClick={onClose} className="rounded-[var(--radius-control)] px-3 py-2.5 text-base font-medium text-[var(--text-body)] hover:bg-[var(--surface-muted)]">My Trips</Link>
            <Link to="/wishlist" onClick={onClose} className="rounded-[var(--radius-control)] px-3 py-2.5 text-base font-medium text-[var(--text-body)] hover:bg-[var(--surface-muted)]">Wishlist</Link>
            <Link to="/profile" onClick={onClose} className="rounded-[var(--radius-control)] px-3 py-2.5 text-base font-medium text-[var(--text-body)] hover:bg-[var(--surface-muted)]">My Profile</Link>
            <Link to="/notifications" onClick={onClose} className="rounded-[var(--radius-control)] px-3 py-2.5 text-base font-medium text-[var(--text-body)] hover:bg-[var(--surface-muted)]">Notifications</Link>
            {isStaff && (
              <Link to="/admin/dashboard" onClick={onClose} className="rounded-[var(--radius-control)] px-3 py-2.5 text-base font-medium text-brand-700 hover:bg-[var(--surface-muted)]">Admin</Link>
            )}
            <button type="button" onClick={handleLogout} className="mt-2 rounded-[var(--radius-control)] border-t border-[var(--border-subtle)] px-3 py-2.5 text-left text-base font-medium text-danger-600 hover:bg-danger-50">
              Logout
            </button>
          </>
        )}
        {!isAuthenticated && (
          <>
            <div className="my-2 border-t border-[var(--border-subtle)]" />
            <Link to="/login" onClick={onClose} className="rounded-[var(--radius-control)] px-3 py-2.5 text-base font-medium text-[var(--text-body)] hover:bg-[var(--surface-muted)]">Login</Link>
            <Link to="/register" onClick={onClose} className="rounded-[var(--radius-control)] px-3 py-2.5 text-base font-medium text-brand-700 hover:bg-[var(--surface-muted)]">Sign Up</Link>
          </>
        )}
      </aside>
    </div>
  );
}

function Footer() {
  const [stats, setStats] = useState(null);
  const [destinations, setDestinations] = useState(null);

  useEffect(() => {
    let cancelled = false;
    discoveryApi.stats().then((data) => !cancelled && setStats(data)).catch(() => {});
    discoveryApi.popularDestinations({ limit: 5 }).then((items) => !cancelled && setDestinations(items)).catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const trustLine = (() => {
    const parts = [];
    if (stats?.destinations?.countries > 0) parts.push(`${stats.destinations.countries} countr${stats.destinations.countries === 1 ? 'y' : 'ies'}`);
    if (stats?.hotels?.published > 0) parts.push(`${stats.hotels.published} hotel${stats.hotels.published === 1 ? '' : 's'}`);
    return parts.length === 0 ? 'Verified hotels, secure payments, support when you need it.' : `Trusted stays across ${parts.join(' and ')}.`;
  })();

  const linkClass = 'text-sm text-brand-100/80 hover:text-white hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-400 rounded-sm';

  return (
    <footer className="bg-brand-900 text-brand-50">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-3">
            <Logo className="text-white" />
            <p className="text-sm text-brand-100/80">{trustLine}</p>
          </div>

          <div className="space-y-3">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-white">About</h3>
            <ul className="space-y-2">
              <li><Link to="/about" className={linkClass}>About Us</Link></li>
              <li><Link to="/about#blog" className={linkClass}>Blog</Link></li>
              <li><Link to="/about#careers" className={linkClass}>Career</Link></li>
              <li><Link to="/about#partner" className={linkClass}>Partner With Us</Link></li>
            </ul>
          </div>

          <div className="space-y-3">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-white">Explore</h3>
            <ul className="space-y-2">
              {destinations?.map((place) => (
                <li key={place.destination}><Link to={`/hotels/${place.destination}`} className={linkClass}>{place.label}</Link></li>
              ))}
              <li><Link to="/destinations" className={cn(linkClass, 'font-medium text-accent-300')}>View All</Link></li>
            </ul>
          </div>

          <div className="space-y-3">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-white">Other Links</h3>
            <ul className="space-y-2">
              <li><Link to="/contact" className={linkClass}>Contact Us</Link></li>
              <li><Link to="/contact#faqs" className={linkClass}>FAQs</Link></li>
              <li><Link to="/contact#terms" className={linkClass}>Terms &amp; Conditions</Link></li>
              <li><Link to="/contact#privacy" className={linkClass}>Privacy Policy</Link></li>
              <li><Link to="/contact#refunds" className={linkClass}>Refund Policy</Link></li>
            </ul>
            <h3 className="pt-2 text-sm font-semibold uppercase tracking-wide text-white">Follow Us</h3>
            {/* No social accounts are configured yet, so these are shown as inert labels rather than fake links. */}
            <ul className="flex flex-wrap gap-3 text-sm text-brand-100/60" aria-label="Follow us (coming soon)">
              {['Instagram', 'Facebook', 'LinkedIn', 'YouTube'].map((name) => (
                <li key={name} aria-disabled="true" title="Coming soon">{name}</li>
              ))}
            </ul>
          </div>
        </div>
      </div>
      <div className="border-t border-white/10">
        <div className="mx-auto max-w-7xl px-4 py-4 text-xs text-brand-100/70 sm:px-6">
          Copyright © {new Date().getFullYear()} GOKAASA. All rights reserved.
        </div>
      </div>
    </footer>
  );
}

export function CustomerLayout() {
  const { isAuthenticated, status } = useAuth();
  const [drawerOpen, setDrawerOpen] = useState(false);

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
            {isAuthenticated && (
              <Link to="/my-trips" className="hidden text-sm font-medium text-[var(--text-body)] hover:text-brand-600 md:inline-flex">
                My Trips
              </Link>
            )}
            {isAuthenticated && <div className="hidden md:block"><NotificationBell /></div>}
            <div className="hidden md:block">{status !== 'loading' && (isAuthenticated ? <ProfileMenu /> : <GuestLinks />)}</div>
            {isAuthenticated && (
              <Link to="/wishlist" aria-label="Wishlist" className="inline-flex h-9 w-9 items-center justify-center rounded-full text-[var(--text-body)] hover:bg-[var(--surface-muted)] md:hidden">
                <Heart className="h-4 w-4" aria-hidden="true" />
              </Link>
            )}
            {isAuthenticated && <div className="md:hidden"><NotificationBell /></div>}
            <button
              type="button"
              aria-label={drawerOpen ? 'Close menu' : 'Open menu'}
              aria-expanded={drawerOpen}
              onClick={() => setDrawerOpen((open) => !open)}
              className="inline-flex h-9 w-9 items-center justify-center rounded-[var(--radius-control)] text-[var(--text-body)] hover:bg-[var(--surface-muted)] md:hidden"
            >
              {drawerOpen ? <X className="h-5 w-5" aria-hidden="true" /> : <Menu className="h-5 w-5" aria-hidden="true" />}
            </button>
          </div>
        </div>
      </header>

      <MobileDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />

      <main id="main" className="flex-1">
        <Outlet />
      </main>

      <Footer />
    </div>
  );
}
