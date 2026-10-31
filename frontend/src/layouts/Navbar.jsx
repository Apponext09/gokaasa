import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  BriefcaseBusiness,
  ChevronDown,
  Heart,
  House,
  Hotel,
  Info,
  KeyRound,
  LogOut,
  Luggage,
  Mail,
  Menu,
  MapPin,
  Tag,
  UserRound,
  X,
} from 'lucide-react';

import { NotificationBell } from '@/components/shared/NotificationBell.jsx';
import { useAuth } from '@/features/auth/AuthContext.jsx';
import { cn } from '@/lib/utils.js';
import logoMark from '@/assets/logo.png';

/* =========================================================
   INDIA FLAG
   Inline SVG so no external asset / icon package is needed.
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
      <circle cx="12" cy="8" r="2.1" fill="none" stroke="#0B3D91" strokeWidth="0.35" />
      <circle cx="12" cy="8" r="0.35" fill="#0B3D91" />
    </svg>
  );
}

/* =========================================================
   PRODUCT NAV ITEMS
   The site's primary pages, reused by the desktop Explore
   dropdown below and by CustomerLayout's mobile drawer.
========================================================= */

export const CUSTOMER_NAV_ITEMS = [
  { label: 'Home', to: '/', icon: House, isActive: (p) => p === '/' },
  {
    label: 'Hotels',
    to: '/hotels',
    icon: Hotel,
    isActive: (p) => p === '/hotels' || p.startsWith('/hotels/'),
  },
  {
    label: 'Top Destinations',
    to: '/destinations',
    icon: MapPin,
    isActive: (p) => p.startsWith('/destinations'),
  },
  { label: 'Offers', to: '/offers', icon: Tag, isActive: (p) => p.startsWith('/offers') },
  { label: 'About Us', to: '/about', icon: Info, isActive: (p) => p.startsWith('/about') },
  { label: 'Contact Us', to: '/contact', icon: Mail, isActive: (p) => p.startsWith('/contact') },
];

/** Inline text links with an animated underline -- used inside the mobile drawer (light surface). */
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
            <Icon className="customer-nav-icon h-4 w-4" strokeWidth={active ? 2.2 : 1.8} aria-hidden="true" />
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
   Shared outside-click / Escape handling for every popover.
========================================================= */

function useDropdown() {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;

    const onPointerDown = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };
    const onKeyDown = (event) => {
      if (event.key === 'Escape') setOpen(false);
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
   EXPLORE DROPDOWN (desktop)
   Houses Home / Hotels / Top Destinations / Offers / About /
   Contact, plus List Your Property / Gokaasa for Business so
   both stay reachable even when their inline cards collapse
   at the `xl` breakpoint (see Navbar's card group below).
========================================================= */

function ExploreDropdown({ partnerTo, showPartnerLinks = false }) {
  const location = useLocation();
  const { open, setOpen, rootRef } = useDropdown();

  return (
    <div className="relative shrink-0" ref={rootRef}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Explore Gokaasa"
        className="
          flex h-9 items-center gap-1 whitespace-nowrap rounded-full px-2 text-[13px] font-medium text-white/90
          transition-colors duration-200 hover:bg-white/10 hover:text-white
          focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#D9B66F]
          min-[1600px]:px-3
        "
      >
        <Menu className="h-4 w-4" aria-hidden="true" />
        <span className="hidden min-[1600px]:inline">Explore</span>
        <ChevronDown className={cn('h-3.5 w-3.5 transition-transform duration-200', open && 'rotate-180')} aria-hidden="true" />
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Explore Gokaasa"
          className="
            absolute left-0 top-full z-40 mt-2 w-60 origin-top-left overflow-hidden rounded-[var(--radius-card)]
            border border-[var(--border-subtle)] bg-[var(--surface-card)] py-1.5 shadow-xl shadow-[#101E35]/15
            animate-[goDropdownIn_180ms_ease-out]
          "
        >
          {showPartnerLinks && (
            <>
              <Link
                role="menuitem"
                to={partnerTo}
                onClick={() => setOpen(false)}
                className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-[var(--text-body)] transition-colors duration-150 hover:bg-[var(--surface-muted)] focus-visible:bg-[var(--surface-muted)] focus-visible:outline-none"
              >
                <KeyRound className="h-4 w-4 text-amber-600" aria-hidden="true" /> List Your Property
              </Link>
              <Link
                role="menuitem"
                to={partnerTo}
                onClick={() => setOpen(false)}
                className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-[var(--text-body)] transition-colors duration-150 hover:bg-[var(--surface-muted)] focus-visible:bg-[var(--surface-muted)] focus-visible:outline-none"
              >
                <BriefcaseBusiness className="h-4 w-4 text-sky-600" aria-hidden="true" /> Gokaasa for Business
              </Link>
              <div className="my-1.5 border-t border-[var(--border-subtle)]" />
            </>
          )}

          {CUSTOMER_NAV_ITEMS.map((item) => {
            const active = item.isActive(location.pathname);
            const Icon = item.icon;
            return (
              <Link
                key={item.to}
                role="menuitem"
                to={item.to}
                onClick={() => setOpen(false)}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex items-center gap-2.5 border-l-2 px-[14px] py-2.5 text-sm transition-colors duration-150 hover:bg-[var(--surface-muted)] focus-visible:bg-[var(--surface-muted)] focus-visible:outline-none',
                  active ? 'border-brand-600 font-semibold text-brand-700' : 'border-transparent text-[var(--text-body)]',
                )}
              >
                <Icon className="h-4 w-4" aria-hidden="true" /> {item.label}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* =========================================================
   INFO ITEM (My Trips / Wishlist, 2xl+: Property / Business)
   Single-line, never truncated -- the row's width budget is
   sized so this never needs to wrap (wrapping here would grow
   past the header's fixed height since dropdowns need the
   header to stay un-clipped, i.e. not auto-sized to overflow).
   Icon circles share one consistent translucent treatment;
   only the glyph colour varies per item, for a premium rather
   than "each card is its own colour" feel.
========================================================= */

function TopBarItem({ to, icon: Icon, iconClass, heading, subtitle, className }) {
  const location = useLocation();
  const active = location.pathname === to || (to !== '/' && location.pathname.startsWith(`${to}/`));

  return (
    <Link
      to={to}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'go-topbar-item group relative flex h-full items-center gap-2.5 px-2 transition-colors duration-200 hover:bg-white/[0.06] focus-visible:bg-white/[0.06] focus-visible:outline-none',
        className,
      )}
    >
      <span className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-full border border-white/15 bg-white/[0.07] transition-colors duration-200 group-hover:border-[#D9B66F]/40 group-hover:bg-white/[0.12]">
        <Icon className={cn('h-5 w-5 transition-colors duration-200', iconClass)} strokeWidth={1.7} aria-hidden="true" />
      </span>

      <span className="flex flex-col">
        <span
          className={cn(
            'whitespace-nowrap text-[13px] font-semibold leading-tight transition-colors duration-200',
            active ? 'text-white' : 'text-white/90 group-hover:text-white',
          )}
        >
          {heading}
        </span>
        <span className="mt-0.5 whitespace-nowrap text-[10.5px] leading-tight text-white/60 transition-colors duration-200 group-hover:text-white/80">
          {subtitle}
        </span>
      </span>

      <span
        aria-hidden="true"
        className={cn(
          'absolute inset-x-2 bottom-0 h-[2px] rounded-full bg-[#D9B66F] transition-opacity duration-200',
          active ? 'opacity-100' : 'opacity-0 group-hover:opacity-35',
        )}
      />
    </Link>
  );
}

/* =========================================================
   LOGIN / ACCOUNT BUTTON
   `compact` renders an icon-only trigger for the mobile/tablet
   bar; both share the same dropdown content and auth logic.
========================================================= */

function AccountButton({ compact = false }) {
  const { isAuthenticated, isStaff, user, logout } = useAuth();
  const { open, setOpen, rootRef } = useDropdown();

  const handleLogout = async () => {
    setOpen(false);
    await logout();
  };

  return (
    <div className="relative shrink-0" ref={rootRef}>
      {compact ? (
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label="Account"
          className="flex h-10 w-10 items-center justify-center rounded-full text-white/90 transition-colors duration-200 hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#D9B66F]"
        >
          <UserRound className="h-5 w-5" aria-hidden="true" />
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-haspopup="menu"
          aria-expanded={open}
          className="
            go-topbar-login flex items-center gap-1.5 whitespace-nowrap rounded-full
            bg-gradient-to-r from-[#2563EB] to-[#1457D6] py-2 pl-1.5 pr-2.5 text-white shadow-md shadow-[#101E35]/35
            transition-all duration-200 hover:-translate-y-px hover:shadow-lg hover:shadow-[#101E35]/40
            focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#D9B66F]
          "
        >
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white text-[#1457D6]">
            <UserRound className="h-[15px] w-[15px]" aria-hidden="true" />
          </span>
          <span className="text-[13.5px] font-semibold">
            {isAuthenticated ? `Hi, ${user?.firstName ?? 'there'}` : 'Login or Create Account'}
          </span>
          <ChevronDown className={cn('h-[13px] w-[13px] shrink-0 transition-transform duration-200', open && 'rotate-180')} aria-hidden="true" />
        </button>
      )}

      {open && (
        <div
          role="menu"
          aria-label="Account"
          className="
            absolute right-0 top-full z-40 mt-2 w-56 overflow-hidden rounded-[var(--radius-card)]
            border border-[var(--border-subtle)] bg-[var(--surface-card)] py-1.5 shadow-xl shadow-[#101E35]/15
            animate-[goDropdownIn_180ms_ease-out]
          "
        >
          {isAuthenticated ? (
            <>
              <Link role="menuitem" to="/profile" onClick={() => setOpen(false)} className="flex items-center gap-2 px-4 py-2.5 text-sm text-[var(--text-body)] transition-colors duration-150 hover:bg-[var(--surface-muted)] focus-visible:bg-[var(--surface-muted)] focus-visible:outline-none">
                <UserRound className="h-4 w-4" aria-hidden="true" /> My Profile
              </Link>
              <Link role="menuitem" to="/my-trips" onClick={() => setOpen(false)} className="flex items-center gap-2 px-4 py-2.5 text-sm text-[var(--text-body)] transition-colors duration-150 hover:bg-[var(--surface-muted)] focus-visible:bg-[var(--surface-muted)] focus-visible:outline-none">
                <Luggage className="h-4 w-4" aria-hidden="true" /> My Trips
              </Link>
              <Link role="menuitem" to="/wishlist" onClick={() => setOpen(false)} className="flex items-center gap-2 px-4 py-2.5 text-sm text-[var(--text-body)] transition-colors duration-150 hover:bg-[var(--surface-muted)] focus-visible:bg-[var(--surface-muted)] focus-visible:outline-none">
                <Heart className="h-4 w-4" aria-hidden="true" /> Wishlist
              </Link>
              {isStaff && (
                <Link role="menuitem" to="/admin/dashboard" onClick={() => setOpen(false)} className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-brand-700 transition-colors duration-150 hover:bg-brand-50 focus-visible:bg-brand-50 focus-visible:outline-none">
                  <BriefcaseBusiness className="h-4 w-4" aria-hidden="true" /> Admin
                </Link>
              )}
              <button role="menuitem" type="button" onClick={handleLogout} className="flex w-full items-center gap-2 border-t border-[var(--border-subtle)] px-4 py-2.5 text-left text-sm text-danger-600 transition-colors duration-150 hover:bg-danger-50 focus-visible:bg-danger-50 focus-visible:outline-none">
                <LogOut className="h-4 w-4" aria-hidden="true" /> Logout
              </button>
            </>
          ) : (
            <>
              <Link role="menuitem" to="/login" onClick={() => setOpen(false)} className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-[var(--text-body)] transition-colors duration-150 hover:bg-[var(--surface-muted)] focus-visible:bg-[var(--surface-muted)] focus-visible:outline-none">
                <UserRound className="h-4 w-4" aria-hidden="true" /> Login
              </Link>
              <Link role="menuitem" to="/register" onClick={() => setOpen(false)} className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-[var(--text-body)] transition-colors duration-150 hover:bg-[var(--surface-muted)] focus-visible:bg-[var(--surface-muted)] focus-visible:outline-none">
                <UserRound className="h-4 w-4" aria-hidden="true" /> Create Account
              </Link>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/* =========================================================
   CURRENCY / LANGUAGE SELECTOR
   Currency conversion and multilingual support are not yet
   implemented, so this is an honest "defaults only" picker.
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
          flex items-center gap-1.5 whitespace-nowrap rounded-full border border-white/[0.14] bg-white/[0.08] px-2.5 py-3
          text-[13px] font-medium text-white backdrop-blur-sm transition-colors duration-200 hover:border-white/25 hover:bg-white/[0.14]
          focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#D9B66F]
        "
      >
        <IndiaFlagIcon className="h-[14px] w-[19px]" />
        <span>INR</span>
        <span className="h-3.5 w-px bg-white/25" aria-hidden="true" />
        <span>English</span>
        <ChevronDown className={cn('h-3.5 w-3.5 transition-transform duration-200', open && 'rotate-180')} aria-hidden="true" />
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Currency and language"
          className="
            absolute right-0 top-full z-40 mt-2 w-64 rounded-[var(--radius-card)] border border-[var(--border-subtle)]
            bg-[var(--surface-card)] p-3 text-sm shadow-xl shadow-[#101E35]/15
            animate-[goDropdownIn_180ms_ease-out]
          "
        >
          <p className="mb-1.5 px-1 text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--text-muted)]">Currency</p>
          <div className="mb-3 flex items-center justify-between rounded-lg bg-[var(--surface-muted)] px-3 py-2">
            <span className="flex items-center gap-2 font-medium text-[var(--text-strong)]">
              <IndiaFlagIcon /> INR — Indian Rupee
            </span>
            <span className="text-xs font-semibold text-brand-600">Default</span>
          </div>

          <p className="mb-1.5 px-1 text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--text-muted)]">Language</p>
          <div className="mb-3 flex items-center justify-between rounded-lg bg-[var(--surface-muted)] px-3 py-2">
            <span className="font-medium text-[var(--text-strong)]">English</span>
            <span className="text-xs font-semibold text-brand-600">Default</span>
          </div>

          <p className="px-1 text-xs leading-5 text-[var(--text-muted)]">More currencies and languages are coming soon.</p>
        </div>
      )}
    </div>
  );
}

/* =========================================================
   UNIFIED NAVBAR
   One sticky header for every breakpoint: a full premium row
   from `xl` up, a compact icon row below it. No second bar.
========================================================= */

export function Navbar({ drawerOpen, onToggleDrawer }) {
  const { isAuthenticated, user } = useAuth();
  const isPartner = Boolean(user?.roles?.includes('HOTEL_OWNER'));
  const partnerTo = isPartner ? '/partner/status' : '/partner/register';

  return (
    <header className="go-navbar sticky top-0 z-50 w-full border-b border-[#D9B66F]/15 shadow-[0_6px_24px_-6px_rgba(16,30,53,0.45)]">
      {/* Photographic background -- its own layer so it never needs to clip the dropdowns below */}
      <div className="absolute inset-0 -z-10 overflow-hidden" aria-hidden="true">
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: "url('/destinations/navi-mumbai.jpg')" }}
        />
        <div className="absolute inset-0 bg-gradient-to-r from-[#101E35]/90 via-[#13284d]/80 to-[#101E35]/90" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#0A1526]/60 via-[#101E35]/10 to-[#101E35]/30" />
        <div className="absolute inset-0 bg-gradient-to-b from-white/[0.04] to-transparent" />
      </div>

      {/* =====================================================
          DESKTOP ROW (xl and up) -- the single premium navbar
      ===================================================== */}

      <div className="relative mx-auto hidden h-[84px] max-w-[1680px] items-stretch gap-2 px-3 xl:flex">
        <Link
          to="/"
          className="go-navbar-logo flex shrink-0 self-center items-center rounded-[11px] border border-white/40 bg-white/90 px-2 py-1 backdrop-blur-sm transition-colors duration-200 hover:bg-white/95"
        >
          <img src={logoMark} alt="Gokaasa" className="h-[40px] w-auto object-contain" />
        </Link>

        <div className="flex shrink-0 self-center items-center">
          <ExploreDropdown partnerTo={partnerTo} showPartnerLinks />
        </div>

        <div className="flex h-full items-stretch divide-x divide-dashed divide-white/15 border-x border-dashed border-white/15">
          <TopBarItem
            to={partnerTo}
            icon={KeyRound}
            iconClass="text-[#D9B66F]"
            heading="List Your Property"
            subtitle="Grow your business!"
          />
          <TopBarItem
            to="/my-trips"
            icon={Luggage}
            iconClass="text-orange-300"
            heading="My Trips"
            subtitle="Manage your bookings"
          />
          <TopBarItem
            to="/wishlist"
            icon={Heart}
            iconClass="text-rose-300"
            heading="Wishlist"
            subtitle="Save favourites"
          />
          <TopBarItem
            to={partnerTo}
            icon={BriefcaseBusiness}
            iconClass="text-sky-300"
            heading="Gokaasa for Business"
            subtitle="Grow your hotel business with us"
            className="hidden min-[1600px]:flex"
          />
        </div>

        <div className="ml-auto flex shrink-0 self-center items-center gap-1.5">
          {isAuthenticated && <NotificationBellDark />}
          <AccountButton />
          <CurrencyLanguageSelector />
        </div>
      </div>

      {/* =====================================================
          COMPACT ROW (below xl) -- tablet + mobile
      ===================================================== */}

      <div className="relative mx-auto flex h-[60px] max-w-[1680px] items-center justify-between gap-2 px-4 sm:h-[68px] sm:px-6 xl:hidden">
        <Link
          to="/"
          className="go-navbar-logo flex shrink-0 items-center rounded-[11px] border border-white/40 bg-white/90 px-2 py-1 backdrop-blur-sm transition-colors duration-200 hover:bg-white/95"
        >
          <img src={logoMark} alt="Gokaasa" className="h-7 w-auto object-contain sm:h-8" />
        </Link>

        <div className="flex shrink-0 items-center gap-1">
          {isAuthenticated && <NotificationBellDark />}

          {isAuthenticated && (
            <Link
              to="/my-trips"
              aria-label="My Trips"
              title="My Trips"
              className="flex h-10 w-10 items-center justify-center rounded-full text-white/90 transition-colors duration-200 hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#D9B66F]"
            >
              <Luggage className="h-[18px] w-[18px]" aria-hidden="true" />
            </Link>
          )}

          {isAuthenticated && (
            <Link
              to="/wishlist"
              aria-label="Wishlist"
              title="Wishlist"
              className="flex h-10 w-10 items-center justify-center rounded-full text-white/90 transition-colors duration-200 hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#D9B66F]"
            >
              <Heart className="h-[18px] w-[18px]" aria-hidden="true" />
            </Link>
          )}

          <AccountButton compact />

          <button
            type="button"
            aria-label={drawerOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={drawerOpen}
            onClick={onToggleDrawer}
            className="flex h-10 w-10 items-center justify-center rounded-full border border-white/15 text-white/90 transition-colors duration-200 hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#D9B66F]"
          >
            {drawerOpen ? <X className="h-5 w-5" aria-hidden="true" /> : <Menu className="h-5 w-5" aria-hidden="true" />}
          </button>
        </div>
      </div>
    </header>
  );
}

/** NotificationBell's trigger is styled for a light surface; wrap it for contrast on the dark navbar. */
function NotificationBellDark() {
  return (
    <span className="go-navbar-bell inline-flex items-center justify-center rounded-full bg-white/90 shadow-sm">
      <NotificationBell />
    </span>
  );
}
