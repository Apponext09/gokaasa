import { Suspense, useEffect, useState } from 'react';
import {
  Link,
  Outlet,
  useLocation,
} from 'react-router-dom';

import {
  Heart,
  X,
  ChevronRight,
  MapPin,
  ShieldCheck,
  Headphones,
  Sparkles,
  Phone,
  KeyRound,
  BriefcaseBusiness,
} from 'lucide-react';

import { FullPageSpinner, Logo } from '@/components/shared/index.jsx';
import { Button } from '@/components/ui/button.jsx';
import { useAuth } from '@/features/auth/AuthContext.jsx';
import { discoveryApi } from '@/services/endpoints.js';
import { SupportLauncher } from '@/features/support/SupportLauncher.jsx';
import { cn } from '@/lib/utils.js';
import { supportPhoneHref, supportPhoneLabel } from '@/config/support.js';
import { Navbar, IndiaFlagIcon, ProductNavLinks } from '@/layouts/Navbar.jsx';

/* =========================================================
   SOCIAL ICONS
   Inline SVGs so lucide-react is not used for brand icons.
========================================================= */

function InstagramIcon({ size = 18 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle
        cx="17.5"
        cy="6.5"
        r="1"
        fill="currentColor"
        stroke="none"
      />
    </svg>
  );
}

function FacebookIcon({ size = 18 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M14 8h3V4h-3c-2.76 0-5 2.24-5 5v3H6v4h3v4h4v-4h3.2l.8-4H13V9c0-.55.45-1 1-1Z" />
    </svg>
  );
}

function LinkedInIcon({ size = 18 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M6.5 8.5A2.25 2.25 0 1 0 6.5 4a2.25 2.25 0 0 0 0 4.5ZM4.5 10h4v10h-4V10Zm6 0h3.84v1.37h.05c.53-1 1.84-2.05 3.79-2.05 4.05 0 4.82 2.66 4.82 6.12V20h-4v-4.03c0-.96-.02-2.2-1.34-2.2-1.34 0-1.55 1.05-1.55 2.13V20h-4V10Z" />
    </svg>
  );
}

function YouTubeIcon({ size = 18 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M23.5 6.2a3.01 3.01 0 0 0-2.12-2.13C19.5 3.5 12 3.5 12 3.5s-7.5 0-9.38.57A3.01 3.01 0 0 0 .5 6.2 31.3 31.3 0 0 0 0 12a31.3 31.3 0 0 0 .5 5.8 3.01 3.01 0 0 0 2.12 2.13c1.88.57 9.38.57 9.38.57s7.5 0 9.38-.57a3.01 3.01 0 0 0 2.12-2.13A31.3 31.3 0 0 0 24 12a31.3 31.3 0 0 0-.5-5.8ZM9.6 15.9V8.1l6.5 3.9-6.5 3.9Z" />
    </svg>
  );
}

/* =========================================================
   SOCIAL BUTTON
========================================================= */

function SocialButton({ label, children }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={`${label} - Coming soon`}
      className="
        flex h-9 w-9 items-center justify-center
        rounded-full
        border border-white/15
        bg-white/[0.06]
        text-white
        transition-colors duration-150
        hover:border-[#38BDF8]
        hover:bg-[#38BDF8]/10
        hover:text-[#38BDF8]
      "
    >
      {children}
    </button>
  );
}

/* =========================================================
   BODY SCROLL LOCK
========================================================= */

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

/* =========================================================
   MOBILE DRAWER
========================================================= */

function MobileDrawer({ open, onClose }) {
  useBodyScrollLock(open);

  const {
    isAuthenticated,
    isStaff,
    user,
    logout,
  } = useAuth();

  const isPartner = Boolean(user?.roles?.includes('HOTEL_OWNER'));
  const partnerTo = isPartner ? '/partner/status' : '/partner/register';

  const handleLogout = async () => {
    onClose();
    await logout();
  };

  return (
    <div
      className={cn(
        `
          fixed
          inset-0
          z-50
          xl:hidden
          transition-opacity
          duration-300
        `,
        open
          ? 'opacity-100'
          : 'pointer-events-none opacity-0',
      )}
    >
      {/* Backdrop */}

      <button
        aria-label="Close menu"
        className="
          absolute
          inset-0
          bg-[#07111F]/60
          backdrop-blur-sm
        "
        onClick={onClose}
        tabIndex={open ? 0 : -1}
      />

      {/* Drawer */}

      <aside
        inert={!open}
        aria-label="Main"
        className={cn(
          `
            customer-mobile-drawer
            absolute
            inset-y-0
            right-0
            flex
            w-[min(88vw,390px)]
            flex-col
            overflow-y-auto
            bg-[var(--surface-card)]
            shadow-2xl
            transition-transform
            duration-300
          `,
          open
            ? 'translate-x-0'
            : 'translate-x-full',
        )}
      >
        {/* Drawer Header */}

        <div
          className="
            customer-mobile-drawer-header
            flex
            items-center
            justify-between
            border-b
            border-[var(--border-subtle)]
            px-5
            py-5
          "
        >
          <Logo />

          <Button
            variant="ghost"
            size="icon"
            aria-label="Close menu"
            onClick={onClose}
            className="rounded-full"
          >
            <X
              className="h-5 w-5"
              aria-hidden="true"
            />
          </Button>
        </div>

        {/* Premium Drawer Intro */}

        <div className="customer-mobile-drawer-intro px-5 pt-5">
          <div
            className="
              customer-mobile-drawer-promo
              overflow-hidden
              rounded-2xl
              bg-gradient-to-br
              from-[#0B1422]
              via-[#14243B]
              to-[#233B5E]
              p-5
              text-white
              shadow-xl
            "
          >
            <div
              className="
                mb-3
                flex
                h-10
                w-10
                items-center
                justify-center
                rounded-full
                border
                border-white/10
                bg-white/10
              "
            >
              <Sparkles
                size={18}
                className="text-[#F2C66D]"
              />
            </div>

            <h3 className="text-lg font-semibold">
              Your next stay awaits.
            </h3>

            <p className="mt-1.5 text-xs leading-5 text-white/70">
              Discover beautiful stays and memorable
              experiences with Gokaasa.
            </p>

            <Link
              to="/destinations"
              onClick={onClose}
              className="
                mt-4
                inline-flex
                items-center
                gap-2
                rounded-full
                bg-white
                px-4
                py-2
                text-xs
                font-semibold
                text-[#0B1422]
                transition-all
                hover:bg-[#F2C66D]
              "
            >
              Explore Hotels
              <ChevronRight size={14} />
            </Link>
          </div>
        </div>

        {/* Navigation */}

        <div className="customer-mobile-drawer-links px-5 py-5">
          <p
            className="
              mb-2
              px-2
              text-[10px]
              font-bold
              uppercase
              tracking-[0.18em]
              text-[var(--text-muted)]
            "
          >
            Explore
          </p>

          <nav className="customer-drawer-nav flex flex-col gap-1">
            <ProductNavLinks
              className="
                rounded-xl
                px-3
                py-3
                text-base
                font-medium
              "
              onNavigate={onClose}
            />
          </nav>
        </div>

        {/* Partner / Business */}

        <div className="mx-5 border-t border-[var(--border-subtle)]" />

        <div className="customer-mobile-drawer-partner px-5 py-5">
          <p
            className="
              mb-2
              px-2
              text-[10px]
              font-bold
              uppercase
              tracking-[0.18em]
              text-[var(--text-muted)]
            "
          >
            Partner With Us
          </p>

          <div className="flex flex-col gap-1">
            <Link
              to={partnerTo}
              onClick={onClose}
              className="flex items-center gap-3 rounded-xl px-3 py-3 text-[var(--text-body)] transition-colors hover:bg-[var(--surface-muted)]"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-50 text-amber-600">
                <KeyRound size={17} aria-hidden="true" />
              </span>
              <span className="flex flex-col">
                <span className="text-base font-medium">List Your Property</span>
                <span className="text-xs text-[var(--text-muted)]">Grow your business!</span>
              </span>
            </Link>

            <Link
              to={partnerTo}
              onClick={onClose}
              className="flex items-center gap-3 rounded-xl px-3 py-3 text-[var(--text-body)] transition-colors hover:bg-[var(--surface-muted)]"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-sky-50 text-sky-600">
                <BriefcaseBusiness size={17} aria-hidden="true" />
              </span>
              <span className="flex flex-col">
                <span className="text-base font-medium">Gokaasa for Business</span>
                <span className="text-xs text-[var(--text-muted)]">Grow your hotel business with us</span>
              </span>
            </Link>
          </div>
        </div>

        {/* Currency / Language (defaults only -- not yet configurable) */}

        <div className="px-5 pb-5">
          <div
            className="
              flex
              items-center
              justify-between
              rounded-xl
              border
              border-[var(--border-subtle)]
              bg-[var(--surface-muted)]
              px-3
              py-2.5
              text-sm
            "
          >
            <span className="flex items-center gap-2 font-medium text-[var(--text-body)]">
              <IndiaFlagIcon />
              INR &middot; English
            </span>
            <span className="text-xs font-semibold text-[var(--text-muted)]">Default</span>
          </div>
        </div>

        {/* Account */}

        {isAuthenticated && (
          <>
            <div className="mx-5 border-t border-[var(--border-subtle)]" />

            <div className="px-5 py-5">
              <p
                className="
                  mb-2
                  px-2
                  text-[10px]
                  font-bold
                  uppercase
                  tracking-[0.18em]
                  text-[var(--text-muted)]
                "
              >
                Account
              </p>

              <div className="flex flex-col gap-1">
                <Link
                  to="/my-trips"
                  onClick={onClose}
                  className="
                    flex
                    items-center
                    justify-between
                    rounded-xl
                    px-3
                    py-3
                    text-base
                    font-medium
                    text-[var(--text-body)]
                    transition-colors
                    hover:bg-[var(--surface-muted)]
                  "
                >
                  My Trips
                  <ChevronRight size={16} />
                </Link>

                <Link
                  to="/wishlist"
                  onClick={onClose}
                  className="
                    flex
                    items-center
                    justify-between
                    rounded-xl
                    px-3
                    py-3
                    text-base
                    font-medium
                    text-[var(--text-body)]
                    transition-colors
                    hover:bg-[var(--surface-muted)]
                  "
                >
                  Wishlist
                  <Heart size={16} />
                </Link>

                <Link
                  to="/profile"
                  onClick={onClose}
                  className="
                    flex
                    items-center
                    justify-between
                    rounded-xl
                    px-3
                    py-3
                    text-base
                    font-medium
                    text-[var(--text-body)]
                    transition-colors
                    hover:bg-[var(--surface-muted)]
                  "
                >
                  My Profile
                  <ChevronRight size={16} />
                </Link>

                <Link
                  to="/notifications"
                  onClick={onClose}
                  className="
                    flex
                    items-center
                    justify-between
                    rounded-xl
                    px-3
                    py-3
                    text-base
                    font-medium
                    text-[var(--text-body)]
                    transition-colors
                    hover:bg-[var(--surface-muted)]
                  "
                >
                  Notifications
                  <ChevronRight size={16} />
                </Link>

                {isStaff && (
                  <Link
                    to="/admin/dashboard"
                    onClick={onClose}
                    className="
                      mt-1
                      flex
                      items-center
                      justify-between
                      rounded-xl
                      bg-brand-50
                      px-3
                      py-3
                      text-base
                      font-semibold
                      text-brand-700
                    "
                  >
                    Admin
                    <ChevronRight size={16} />
                  </Link>
                )}

                <button
                  type="button"
                  onClick={handleLogout}
                  className="
                    mt-3
                    border-t
                    border-[var(--border-subtle)]
                    px-3
                    pt-4
                    text-left
                    text-base
                    font-medium
                    text-danger-600
                  "
                >
                  Logout
                </button>
              </div>
            </div>
          </>
        )}

        {/* Guest */}

        {!isAuthenticated && (
          <div className="px-5 pb-5">
            <div className="border-t border-[var(--border-subtle)] pt-5">
              <div className="flex flex-col gap-2">
                <Link
                  to="/login"
                  onClick={onClose}
                  className="
                    rounded-xl
                    border
                    border-[var(--border-subtle)]
                    px-4
                    py-3
                    text-center
                    text-sm
                    font-semibold
                    text-[var(--text-body)]
                  "
                >
                  Login
                </Link>

                <Link
                  to="/register"
                  onClick={onClose}
                  className="
                    rounded-xl
                    bg-brand-700
                    px-4
                    py-3
                    text-center
                    text-sm
                    font-semibold
                    text-white
                  "
                >
                  Create Account
                </Link>
              </div>
            </div>
          </div>
        )}

        {/* Mobile Trust */}

        <div className="mt-auto px-5 pb-6 pt-2">
          <div
            className="
              grid
              grid-cols-3
              gap-2
              rounded-2xl
              border
              border-[var(--border-subtle)]
              bg-[var(--surface-muted)]
              p-3
            "
          >
            <div className="text-center">
              <ShieldCheck
                size={17}
                className="mx-auto text-brand-600"
              />
              <p className="mt-1 text-[9px] font-semibold text-[var(--text-muted)]">
                Secure
              </p>
            </div>

            <div className="text-center">
              <MapPin
                size={17}
                className="mx-auto text-brand-600"
              />
              <p className="mt-1 text-[9px] font-semibold text-[var(--text-muted)]">
                Great stays
              </p>
            </div>

            <div className="text-center">
              <Headphones
                size={17}
                className="mx-auto text-brand-600"
              />
              <p className="mt-1 text-[9px] font-semibold text-[var(--text-muted)]">
                Support
              </p>
            </div>
          </div>
        </div>
      </aside>
    </div>
  );
}

/* =========================================================
   FOOTER
   Existing API calls are preserved.
========================================================= */

function Footer() {
  const [stats, setStats] = useState(null);
  const [destinations, setDestinations] = useState(null);

  useEffect(() => {
    let cancelled = false;

    discoveryApi
      .stats()
      .then((data) => {
        if (!cancelled) {
          setStats(data);
        }
      })
      .catch(() => {});

    discoveryApi
      .popularDestinations({ limit: 5 })
      .then((items) => {
        if (!cancelled) {
          setDestinations(items);
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, []);

  /* =======================================================
     EXISTING TRUST LINE LOGIC
  ======================================================= */

  const trustLine = (() => {
    const parts = [];

    if (stats?.destinations?.countries > 0) {
      parts.push(
        `${stats.destinations.countries} countr${
          stats.destinations.countries === 1
            ? 'y'
            : 'ies'
        }`,
      );
    }

    if (stats?.hotels?.published > 0) {
      parts.push(
        `${stats.hotels.published} hotel${
          stats.hotels.published === 1 ? '' : 's'
        }`,
      );
    }

    return parts.length === 0
      ? 'Verified hotels, secure payments, support when you need it.'
      : `Trusted stays across ${parts.join(' and ')}.`;
  })();

  /* =======================================================
     DIRECT COLORS
     No dependency on custom brand text colors.
  ======================================================= */

  const linkClass = `
    inline-block
    text-[13px]
    font-normal
    text-[#CBD5E1]
    transition-colors
    duration-150
    hover:text-[#38BDF8]
    hover:underline
    focus-visible:outline-2
    focus-visible:outline-offset-2
    focus-visible:outline-[#F2C66D]
    rounded-sm
  `;

  return (
    <footer className="customer-footer bg-[#0B1422] text-white">
      {/* =====================================================
          MAIN FOOTER
      ===================================================== */}

      <div
        className="customer-footer-main
          mx-auto
          max-w-[1340px]
          px-4
          py-10
          sm:px-6
          lg:py-10
        "
      >
        <div
          className="customer-footer-grid
            grid
            gap-8
            sm:grid-cols-2
            lg:grid-cols-[1.45fr_1fr_1fr_1fr]
          "
        >
          {/* =================================================
              BRAND
          ================================================= */}

          <div className="customer-footer-brand space-y-3">
            {/* Logo container */}

            <div
              className="customer-footer-logo
                inline-flex
                w-fit
                items-center
                rounded-lg
                bg-white
                px-3
                py-2
              "
            >
              <Logo />
            </div>

            <p
              className="customer-footer-copy
                max-w-sm
                text-[13px]
                leading-6
                text-[#CBD5E1]
              "
            >
              {trustLine}
            </p>

            {/* Trust Badges */}

            <div className="customer-footer-badges flex flex-wrap gap-2">
              <span
                className="
                  inline-flex
                  items-center
                  gap-2
                  rounded-full
                  border
                  border-white/15
                  bg-white/[0.06]
                  px-3
                  py-1.5
                  text-xs
                  font-medium
                  text-white
                "
              >
                <ShieldCheck
                  size={15}
                  className="text-[#F2C66D]"
                />
                Secure Booking
              </span>

              <span
                className="
                  inline-flex
                  items-center
                  gap-2
                  rounded-full
                  border
                  border-white/15
                  bg-white/[0.06]
                  px-3
                  py-1.5
                  text-xs
                  font-medium
                  text-white
                "
              >
                <Headphones
                  size={15}
                  className="text-[#F2C66D]"
                />
                24/7 Support
              </span>

              <a
                href={supportPhoneHref()}
                aria-label={`Call Gokaasa support at ${supportPhoneLabel()}`}
                className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.06] px-3 py-1.5 text-xs font-medium text-white transition-colors hover:border-[#F2C66D]/60 hover:text-[#F2C66D] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#F2C66D]"
              >
                <Phone size={15} className="text-[#F2C66D]" />
                {supportPhoneLabel()}
              </a>
            </div>

            {/* Social */}

            <div className="customer-footer-social pt-2">
              <h3
                className="
                  mb-3
                  text-xs
                  font-bold
                  uppercase
                  tracking-[0.18em]
                  text-white
                "
              >
                Follow Us
              </h3>

              <div className="flex gap-2">
                <SocialButton label="Instagram">
                  <InstagramIcon />
                </SocialButton>

                <SocialButton label="Facebook">
                  <FacebookIcon />
                </SocialButton>

                <SocialButton label="LinkedIn">
                  <LinkedInIcon />
                </SocialButton>

                <SocialButton label="YouTube">
                  <YouTubeIcon />
                </SocialButton>
              </div>

            </div>
          </div>

          {/* =================================================
              ABOUT
          ================================================= */}

          <div className="customer-footer-column space-y-3">
            <h3
              className="
                text-[13px]
                font-bold
                uppercase
                tracking-[0.12em]
                text-[#94A3B8]
              "
            >
              About
            </h3>

            <ul className="space-y-2.5">
              <li>
                <Link
                  to="/about"
                  className={linkClass}
                >
                  About Us
                </Link>
              </li>

              <li>
                <Link
                  to="/about#blog"
                  className={linkClass}
                >
                  Blog
                </Link>
              </li>

              <li>
                <Link
                  to="/about#careers"
                  className={linkClass}
                >
                  Career
                </Link>
              </li>

              <li>
                <Link
                  to="/partner/register"
                  className={linkClass}
                >
                  Partner With Us
                </Link>
              </li>
            </ul>
          </div>

          {/* =================================================
              EXPLORE
          ================================================= */}

          <div className="customer-footer-column space-y-3">
            <h3
              className="
                text-[13px]
                font-bold
                uppercase
                tracking-[0.12em]
                text-[#94A3B8]
              "
            >
              Explore
            </h3>

            <ul className="space-y-2.5">
              {destinations?.map((place) => (
                <li key={place.destination}>
                  <Link
                    to={`/hotels?destination=${encodeURIComponent(place.destination)}`}
                    className={linkClass}
                  >
                    {place.label}
                  </Link>
                </li>
              ))}

              <li>
                <Link
                  to="/destinations"
                  className="
                    inline-flex
                    items-center
                    gap-1
                    text-[13px]
                    font-bold
                    text-[#F2C66D]
                    transition-colors
                    duration-150
                    hover:text-white
                    hover:underline
                  "
                >
                  View All
                  <ChevronRight size={14} />
                </Link>
              </li>
            </ul>
          </div>

          {/* =================================================
              OTHER LINKS
          ================================================= */}

          <div className="customer-footer-column space-y-3">
            <h3
              className="
                text-[13px]
                font-bold
                uppercase
                tracking-[0.12em]
                text-[#94A3B8]
              "
            >
              Other Links
            </h3>

            <ul className="space-y-2.5">
              <li>
                <Link
                  to="/offers"
                  className={linkClass}
                >
                  Offers
                </Link>
              </li>

              <li>
                <Link
                  to="/contact"
                  className={linkClass}
                >
                  Contact Us
                </Link>
              </li>

              <li>
                <Link
                  to="/contact#faqs"
                  className={linkClass}
                >
                  FAQs
                </Link>
              </li>

              <li>
                <Link
                  to="/contact#terms"
                  className={linkClass}
                >
                  Terms &amp; Conditions
                </Link>
              </li>

              <li>
                <Link
                  to="/contact#privacy"
                  className={linkClass}
                >
                  Privacy Policy
                </Link>
              </li>

              <li>
                <Link
                  to="/contact#refunds"
                  className={linkClass}
                >
                  Refund Policy
                </Link>
              </li>
            </ul>
          </div>
        </div>
      </div>

      {/* =====================================================
          COPYRIGHT
      ===================================================== */}

      <div
        className="customer-footer-bottom
          border-t
          border-white/15
          bg-[#080F1A]
        "
      >
        <div
          className="customer-footer-bottom-inner
            mx-auto
            flex
            max-w-[1340px]
            flex-col
            gap-3
            px-4
            py-5
            text-xs
            text-[#CBD5E1]
            sm:px-6
            md:flex-row
            md:items-center
            md:justify-between
          "
        >
          <p>
            Copyright © {new Date().getFullYear()} GOKAASA.
            All rights reserved.
          </p>

          <div
            className="
              flex
              items-center
              gap-2
              font-medium
              text-[#CBD5E1]
            "
          >
            <ShieldCheck
              size={14}
              className="text-[#F2C66D]"
            />

            <span>Secure hotel booking</span>
          </div>
        </div>
      </div>
    </footer>
  );
}

/* =========================================================
   CUSTOMER LAYOUT
========================================================= */

export function CustomerLayout() {
  const [drawerOpen, setDrawerOpen] = useState(false);

  const location = useLocation();

  /* Close mobile drawer after navigation */

  useEffect(() => {
    setDrawerOpen(false);
  }, [location.pathname]);

  return (
    <div
      className="
        customer-ui
        assistant-dock-shift
        flex
        min-h-screen
        flex-col
        bg-[var(--surface-page)]
      "
    >
      {/* =====================================================
          NAVBAR (single unified header, all breakpoints)
      ===================================================== */}

      <Navbar
        drawerOpen={drawerOpen}
        onToggleDrawer={() => setDrawerOpen((open) => !open)}
      />

      {/* Mobile Drawer */}

      <MobileDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
      />

      {/* Main */}

      <main
        id="main"
        className="customer-main flex-1"
      >
        <Suspense fallback={<FullPageSpinner label="Loading page" />}>
          <Outlet />
        </Suspense>
      </main>

      {/* Footer */}

      <Footer />

      {/* Floating support launcher (WhatsApp / Booking Assistant) -- customer-facing pages only */}
      <SupportLauncher />
    </div>
  );
}

