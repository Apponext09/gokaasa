import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  ChevronDown,
  Heart,
  House,
  Hotel,
  KeyRound,
  Luggage,
  Menu,
  MapPin,
  UserRound,
  X,
} from 'lucide-react';

import { NotificationBell } from '@/components/shared/NotificationBell.jsx';
import { useAuth } from '@/features/auth/AuthContext.jsx';
import { useHomepageBackground } from '@/features/home/HomepageBackgroundContext.jsx';
import { cn } from '@/lib/utils.js';
import logoMark from '@/assets/logo.png';

/* =========================================================
   INDIA FLAG
========================================================= */

export function IndiaFlagIcon({ className }) {
  return (
    <svg
      viewBox="0 0 24 16"
      className={cn('h-3.5 w-5 shrink-0 overflow-hidden rounded-[2px]', className)}
      aria-hidden="true"
    >
      <rect width="24" height="16" fill="#F7F7F7" />
      <rect width="24" height="5.33" fill="#FF9933" />
      <rect y="10.67" width="24" height="5.33" fill="#138808" />
      <circle
        cx="12"
        cy="8"
        r="2.1"
        fill="none"
        stroke="#0B3D91"
        strokeWidth="0.35"
      />
      <circle cx="12" cy="8" r="0.35" fill="#0B3D91" />
    </svg>
  );
}

/* =========================================================
   NAVIGATION ITEMS
========================================================= */

export const CUSTOMER_NAV_ITEMS = [
  {
    label: 'Home',
    to: '/',
    icon: House,
    iconColor: '#3B82F6',
    isActive: (p) => p === '/',
  },
  {
    label: 'Hotels',
    to: '/hotels',
    icon: Hotel,
    iconColor: '#0EA5E9',
    isActive: (p) => p === '/hotels' || p.startsWith('/hotels/'),
  },
  {
    label: 'Top Destinations',
    to: '/destinations',
    icon: MapPin,
    iconColor: '#F59E0B',
    isActive: (p) => p.startsWith('/destinations'),
  },
];

/* =========================================================
   MOBILE DRAWER NAV LINKS
========================================================= */

export function ProductNavLinks({ className, onNavigate }) {
  const location = useLocation();

  return (
    <>
      {CUSTOMER_NAV_ITEMS.map((item) => {
        const active = item.isActive(location.pathname);
        const Icon = item.icon;

        return (
          <Link
            key={item.to}
            to={item.to}
            onClick={onNavigate}
            aria-current={active ? 'page' : undefined}
            className={cn(
              className,
              'customer-nav-link relative flex items-center transition-all duration-300 hover:text-brand-600',
              active ? 'text-brand-700' : 'text-[var(--text-body)]',
            )}
          >
            <Icon
              className="customer-nav-icon h-4 w-4"
              strokeWidth={active ? 2.2 : 1.8}
              style={{ color: item.iconColor }}
              aria-hidden="true"
            />

            {item.label}

            <span
              className={cn(
                'customer-nav-active-bar absolute -bottom-[7px] left-0 h-[2px] rounded-full bg-gradient-to-r from-brand-600 to-[#E7BD62] transition-all duration-300',
                active ? 'w-full opacity-100' : 'w-0 opacity-0',
              )}
            />
          </Link>
        );
      })}
    </>
  );
}

/* =========================================================
   DROPDOWN HOOK
========================================================= */

function useDropdown() {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;

    const onPointerDown = (event) => {
      if (!rootRef.current?.contains(event.target)) {
        setOpen(false);
      }
    };

    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    };

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);

    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return { open, setOpen, rootRef };
}

/* =========================================================
   DESKTOP NAV LINK
========================================================= */

function DesktopNavLink({ to, label, icon: Icon, iconColor, isActive }) {
  const location = useLocation();
  const active = isActive(location.pathname);

  return (
    <Link
      to={to}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'relative flex h-full shrink-0 items-center gap-2 whitespace-nowrap px-2 text-[14.5px] font-semibold tracking-tight transition-colors duration-200 [text-shadow:0_1px_3px_rgba(0,0,0,0.65)]',
        active ? 'text-white' : 'text-white/90 hover:text-white',
      )}
    >
      {Icon && (
        <Icon
          className="h-[21px] w-[21px] shrink-0 drop-shadow-[0_1px_2px_rgba(0,0,0,0.5)]"
          style={{ color: iconColor }}
          aria-hidden="true"
        />
      )}

      {label}

      <span
        aria-hidden="true"
        className={cn(
          'absolute inset-x-2 -bottom-px h-[2px] rounded-full bg-[#D9B66F] transition-opacity duration-200',
          active ? 'opacity-100' : 'opacity-0',
        )}
      />
    </Link>
  );
}

/* =========================================================
   MY PROFILE
========================================================= */

function MyProfileLink({ compact = false }) {
  const { isAuthenticated } = useAuth();
  const to = isAuthenticated ? '/profile' : '/login';

  if (compact) {
    return (
      <Link
        to={to}
        aria-label="My Profile"
        title="My Profile"
        className="flex h-10 w-10 items-center justify-center rounded-full text-white/90 transition-colors duration-200 hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#D9B66F]"
      >
        <UserRound
          className="h-5 w-5 drop-shadow-[0_1px_2px_rgba(0,0,0,0.5)]"
          style={{ color: '#60A5FA' }}
          aria-hidden="true"
        />
      </Link>
    );
  }

  return (
    <Link
      to={to}
      className="flex shrink-0 items-center gap-2 whitespace-nowrap rounded-full border border-white/20 bg-white/[0.10] px-3 py-2 text-[14.5px] font-semibold text-white shadow-sm backdrop-blur-sm transition-colors duration-200 [text-shadow:0_1px_3px_rgba(0,0,0,0.55)] hover:border-white/35 hover:bg-white/[0.16] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#D9B66F]"
    >
      <UserRound
        className="h-[21px] w-[21px] drop-shadow-[0_1px_2px_rgba(0,0,0,0.5)]"
        style={{ color: '#60A5FA' }}
        aria-hidden="true"
      />

      My Profile
    </Link>
  );
}

/* =========================================================
   CURRENCY / LANGUAGE SELECTOR
========================================================= */

function CurrencyLanguageSelector() {
  const { open, setOpen, rootRef } = useDropdown();

  return (
    <div className="relative shrink-0" ref={rootRef}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="
          flex items-center gap-1 whitespace-nowrap rounded-full
          border border-white/[0.18] bg-white/[0.10] px-2 py-2
          text-[12.5px] font-medium text-white shadow-sm backdrop-blur-sm
          transition-colors duration-200
          [text-shadow:0_1px_3px_rgba(0,0,0,0.55)]
          hover:border-white/30 hover:bg-white/[0.16]
          focus-visible:outline-2 focus-visible:outline-offset-2
          focus-visible:outline-[#D9B66F]
        "
      >
        <IndiaFlagIcon className="h-[14px] w-[19px]" />

        <span>INR</span>

        <span className="h-3.5 w-px bg-white/25" aria-hidden="true" />

        <span>English</span>

        <ChevronDown
          className={cn(
            'h-3.5 w-3.5 transition-transform duration-200',
            open && 'rotate-180',
          )}
          aria-hidden="true"
        />
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Currency and language"
          className="
            absolute right-0 top-full z-40 mt-2 w-64
            rounded-[var(--radius-card)] border border-[var(--border-subtle)]
            bg-[var(--surface-card)] p-3 text-sm
            shadow-xl shadow-[#101E35]/15
            animate-[goDropdownIn_180ms_ease-out]
          "
        >
          <p className="mb-1.5 px-1 text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--text-muted)]">
            Currency
          </p>

          <div className="mb-3 flex items-center justify-between rounded-lg bg-[var(--surface-muted)] px-3 py-2">
            <span className="flex items-center gap-2 font-medium text-[var(--text-strong)]">
              <IndiaFlagIcon />
              INR — Indian Rupee
            </span>

            <span className="text-xs font-semibold text-brand-600">
              Default
            </span>
          </div>

          <p className="mb-1.5 px-1 text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--text-muted)]">
            Language
          </p>

          <div className="mb-3 flex items-center justify-between rounded-lg bg-[var(--surface-muted)] px-3 py-2">
            <span className="font-medium text-[var(--text-strong)]">
              English
            </span>

            <span className="text-xs font-semibold text-brand-600">
              Default
            </span>
          </div>

          <p className="px-1 text-xs leading-5 text-[var(--text-muted)]">
            More currencies and languages are coming soon.
          </p>
        </div>
      )}
    </div>
  );
}

/* =========================================================
   MAIN NAVBAR
========================================================= */

export function Navbar({ drawerOpen, onToggleDrawer }) {
  const { isAuthenticated, user } = useAuth();

  const isPartner = Boolean(user?.roles?.includes('HOTEL_OWNER'));
  const partnerTo = isPartner ? '/partner/status' : '/partner/register';

  const location = useLocation();
  const isHome = location.pathname === '/';

  const { heroSlides, setNavbarHeight } = useHomepageBackground();

  const useUploadedBackground = isHome && heroSlides.length > 0;

  const headerRef = useRef(null);

  /* =====================================================
     SCROLL STATE
  ===================================================== */

  const [isScrolled, setIsScrolled] = useState(
    () => window.scrollY > 40,
  );

  useEffect(() => {
    let ticking = false;

    const handleScroll = () => {
      if (ticking) return;

      ticking = true;

      window.requestAnimationFrame(() => {
        setIsScrolled(window.scrollY > 40);
        ticking = false;
      });
    };

    window.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      window.removeEventListener('scroll', handleScroll);
    };
  }, []);

  /* =====================================================
     NAVBAR HEIGHT OBSERVER
  ===================================================== */

  useEffect(() => {
    const el = headerRef.current;

    if (!el || typeof ResizeObserver === 'undefined') {
      return undefined;
    }

    const observer = new ResizeObserver(([entry]) => {
      const height =
        entry.borderBoxSize?.[0]?.blockSize ??
        entry.contentRect.height;

      setNavbarHeight(height);
    });

    observer.observe(el, { box: 'border-box' });

    return () => observer.disconnect();
  }, [setNavbarHeight]);

  /* =====================================================
     DESKTOP NAVIGATION ITEMS
  ===================================================== */

  const desktopNavItems = [
    ...CUSTOMER_NAV_ITEMS,
    {
      label: 'List Your Property',
      to: partnerTo,
      icon: KeyRound,
      iconColor: '#FBBF24',
      isActive: (p) => p === partnerTo,
    },
    {
      label: 'My Trips',
      to: '/my-trips',
      icon: Luggage,
      iconColor: '#FB923C',
      isActive: (p) => p === '/my-trips' || p.startsWith('/my-trips/'),
    },
    {
      label: 'Wishlist',
      to: '/wishlist',
      icon: Heart,
      iconColor: '#F43F5E',
      isActive: (p) => p === '/wishlist',
    },
  ];

  return (
    <header
      ref={headerRef}
      className="
        go-navbar sticky top-0 z-50 isolate w-full
        shadow-[0_6px_24px_-6px_rgba(16,30,53,0.35)]
      "
    >
      {/* FALLBACK BACKGROUND FOR OTHER PAGES */}

      {!useUploadedBackground && (
        <div
          className="pointer-events-none absolute inset-0 -z-10 overflow-hidden"
          aria-hidden="true"
        >
          <div
            className="absolute inset-0 bg-cover bg-center"
            style={{
              backgroundImage: "url('/destinations/navi-mumbai.jpg')",
            }}
          />

          <div className="absolute inset-0 bg-gradient-to-r from-[#101E35]/90 via-[#13284d]/80 to-[#101E35]/90" />

          <div className="absolute inset-0 bg-gradient-to-t from-[#0A1526]/60 via-[#101E35]/10 to-[#101E35]/30" />

          <div className="absolute inset-0 bg-gradient-to-b from-white/[0.04] to-transparent" />
        </div>
      )}

      {/* DYNAMIC GLASSMORPHISM BACKGROUND */}

      <div
        aria-hidden="true"
        className={cn(
          'pointer-events-none absolute inset-0 z-0',
          'border-b transition-all duration-300 ease-in-out',
          isScrolled
            ? [
                'border-white/[0.12]',
                'bg-[#101E35]/75',
                'backdrop-blur-xl',
                'supports-[backdrop-filter]:bg-[#101E35]/65',
                'shadow-[0_4px_20px_rgba(0,0,0,0.18)]',
              ].join(' ')
            : [
                'border-white/[0.10]',
                'bg-white/[0.08]',
                'backdrop-blur-md',
                'supports-[backdrop-filter]:bg-white/[0.07]',
              ].join(' '),
        )}
      />

      {/* DESKTOP NAVBAR */}

      <div
        className="
          relative z-10 mx-auto hidden h-[72px] max-w-[1680px]
          items-center gap-2 px-3
          lg:grid lg:grid-cols-[auto_1fr_auto]
        "
      >
        {/* DESKTOP LOGO — NO BACKGROUND / NO BLUR */}

        <Link
          to="/"
          className="go-navbar-logo flex shrink-0 items-center rounded-[11px] px-2 py-1 transition-colors duration-200"
        >
          <img
            src={logoMark}
            alt="Gokaasa"
            className="
              h-[40px] w-auto object-contain
              drop-shadow-[0_1px_3px_rgba(0,0,0,0.35)]
            "
          />
        </Link>

        {/* CENTER NAVIGATION */}

        <nav
          aria-label="Primary"
          className="
            flex min-w-0 flex-nowrap items-center
            justify-center gap-1 overflow-hidden
          "
        >
          {desktopNavItems.map((item) => (
            <DesktopNavLink
              key={item.to}
              to={item.to}
              label={item.label}
              icon={item.icon}
              iconColor={item.iconColor}
              isActive={item.isActive}
            />
          ))}
        </nav>

        {/* RIGHT ACTIONS */}

        <div className="flex shrink-0 items-center gap-1.5">
          {isAuthenticated && <NotificationBellDark />}

          <MyProfileLink />

          <CurrencyLanguageSelector />
        </div>
      </div>

      {/* MOBILE / TABLET NAVBAR */}

      <div
        className="
          relative z-10 mx-auto flex h-[60px] max-w-[1680px]
          items-center justify-between gap-2 px-4
          sm:h-[68px] sm:px-6 lg:hidden
        "
      >
        {/* MOBILE LOGO — NO BACKGROUND / NO BLUR */}

        <Link
          to="/"
          className="go-navbar-logo flex shrink-0 items-center rounded-[11px] px-2 py-1 transition-colors duration-200"
        >
          <img
            src={logoMark}
            alt="Gokaasa"
            className="
              h-7 w-auto object-contain
              drop-shadow-[0_1px_3px_rgba(0,0,0,0.35)]
              sm:h-8
            "
          />
        </Link>

        {/* MOBILE ACTIONS */}

        <div className="flex shrink-0 items-center gap-1">
          {isAuthenticated && <NotificationBellDark />}

          {isAuthenticated && (
            <Link
              to="/my-trips"
              aria-label="My Trips"
              title="My Trips"
              className="
                flex h-10 w-10 items-center justify-center
                rounded-full text-white/90
                transition-colors duration-200
                hover:bg-white/10 hover:text-white
              "
            >
              <Luggage
                className="h-[18px] w-[18px]"
                style={{ color: '#FB923C' }}
                aria-hidden="true"
              />
            </Link>
          )}

          {isAuthenticated && (
            <Link
              to="/wishlist"
              aria-label="Wishlist"
              title="Wishlist"
              className="
                flex h-10 w-10 items-center justify-center
                rounded-full text-white/90
                transition-colors duration-200
                hover:bg-white/10 hover:text-white
              "
            >
              <Heart
                className="h-[18px] w-[18px]"
                style={{ color: '#F43F5E' }}
                aria-hidden="true"
              />
            </Link>
          )}

          <MyProfileLink compact />

          {/* HAMBURGER */}

          <button
            type="button"
            aria-label={drawerOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={drawerOpen}
            onClick={onToggleDrawer}
            className="
              flex h-10 w-10 items-center justify-center
              rounded-full border border-white/20
              bg-white/[0.06] text-white/90
              backdrop-blur-sm
              transition-colors duration-200
              hover:bg-white/[0.14] hover:text-white
              focus-visible:outline-2 focus-visible:outline-offset-2
              focus-visible:outline-[#D9B66F]
            "
          >
            {drawerOpen ? (
              <X className="h-5 w-5" aria-hidden="true" />
            ) : (
              <Menu className="h-5 w-5" aria-hidden="true" />
            )}
          </button>
        </div>
      </div>
    </header>
  );
}

/* =========================================================
   NOTIFICATION BELL
========================================================= */

function NotificationBellDark() {
  return (
    <span
      className="
        go-navbar-bell inline-flex items-center justify-center
        rounded-full border border-white/15
        bg-white/90 shadow-sm
      "
    >
      <NotificationBell />
    </span>
  );
}