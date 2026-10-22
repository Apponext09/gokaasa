import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Headset, MessageCircle, Sparkles, X } from 'lucide-react';
import { Button } from '@/components/ui/button.jsx';
import { buildWhatsAppUrl } from '@/config/support.js';
import { BookingAssistant } from '@/features/support/BookingAssistant.jsx';
import { cn } from '@/lib/utils.js';

const LAUNCHER_LABEL = 'Plan your stay';
// Tailwind's `xl` breakpoint. At or above it the chat docks as a side panel and the page makes room for it;
// below it the chat is a full-screen overlay (a floating panel there would always cover hotel content).
const DOCK_QUERY = '(min-width: 1280px)';

function useDockedLayout() {
  const [wide, setWide] = useState(() => (typeof window !== 'undefined' ? window.matchMedia(DOCK_QUERY).matches : false));
  useEffect(() => {
    const mq = window.matchMedia(DOCK_QUERY);
    const onChange = (event) => setWide(event.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return wide;
}

/**
 * Floating "Need help?" launcher for customer-facing pages only (mounted once, inside CustomerLayout --
 * never inside AdminLayout, so it never appears for admin/hotel-manager screens). Opens a small menu with
 * two options: hand off to WhatsApp, or open the real-data booking assistant in a panel.
 */
export function SupportLauncher() {
  const [panel, setPanel] = useState(null); // null | 'menu' | 'chat'
  const location = useLocation();
  const containerRef = useRef(null);
  const launcherButtonRef = useRef(null);
  const chatPanelRef = useRef(null);
  const wasOpenRef = useRef(false);
  const wide = useDockedLayout();
  const chatOpen = panel === 'chat';

  // Closing on route change covers both "the user picked a stay and navigated to it" (the chat hands off
  // via a normal Link/navigate) and simple page-to-page browsing -- a stale open panel should never linger
  // over a different page.
  useEffect(() => {
    setPanel(null);
  }, [location.pathname]);

  useEffect(() => {
    if (!panel) return undefined;
    const onKey = (event) => {
      if (event.key === 'Escape') setPanel(null);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [panel]);

  // Only the menu closes on an outside click -- the chat panel stays open on outside clicks (it is a real
  // multi-step form; an accidental click shouldn't discard progress), matching how the chat's own mobile
  // backdrop button is the sole intentional way to dismiss it.
  useEffect(() => {
    if (panel !== 'menu') return undefined;
    const onDown = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) setPanel(null);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [panel]);

  // Focus moves into the dialog when the chat opens, and returns to the launcher button when it closes --
  // a sighted keyboard user and a screen-reader user both need this, not just a visual affordance.
  useEffect(() => {
    if (panel === 'chat') {
      wasOpenRef.current = true;
      chatPanelRef.current?.focus();
    } else if (wasOpenRef.current) {
      wasOpenRef.current = false;
      launcherButtonRef.current?.focus();
    }
  }, [panel]);

  // Docked (wide screens): the page content shifts left by the panel width (see .assistant-dock-shift in
  // index.css) so nothing is covered. Overlay (narrower screens): the page behind is locked from scrolling and
  // restored on close -- nothing navigates, so the page's scroll position and state are untouched.
  useEffect(() => {
    if (!chatOpen) return undefined;
    const root = document.documentElement;
    if (wide) {
      root.setAttribute('data-assistant-docked', '');
      return () => root.removeAttribute('data-assistant-docked');
    }
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [chatOpen, wide]);

  const openWhatsApp = () => {
    // rel="noopener noreferrer" prevents the new tab from getting a `window.opener` reference back to
    // this page (the "safe window-opening options" the feature explicitly calls for).
    window.open(buildWhatsAppUrl(), '_blank', 'noopener,noreferrer');
    setPanel(null);
  };

  return (
    // Raised well above the booking flow's own fixed bottom bars (SelectionBar, the hotel-details mobile
    // CTA), which are full-width and would otherwise sit directly under a bottom-right launcher at any
    // breakpoint -- exactly the "don't cover booking controls" case this feature explicitly calls out.
    <div ref={containerRef} className="fixed bottom-24 right-4 z-40 sm:right-6">
      {/* Menu: WhatsApp vs. Chat */}
      <div
        className={cn(
          'absolute bottom-16 right-0 w-72 origin-bottom-right rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-card)] p-3 shadow-2xl transition-all duration-200 motion-reduce:transition-none',
          panel === 'menu' ? 'scale-100 opacity-100' : 'pointer-events-none scale-95 opacity-0',
        )}
        role="dialog"
        aria-label="Support options"
        aria-hidden={panel !== 'menu'}
      >
        <p className="px-1 pb-2 text-sm font-semibold text-[var(--text-strong)]">How can we help you?</p>
        <button
          type="button"
          onClick={openWhatsApp}
          className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-[var(--text-body)] transition-colors hover:bg-[var(--surface-muted)] focus-visible:outline-2 focus-visible:outline-brand-500"
        >
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-success-50 text-success-600">
            <MessageCircle className="h-4.5 w-4.5" aria-hidden="true" />
          </span>
          WhatsApp Support
        </button>
        <button
          type="button"
          onClick={() => setPanel('chat')}
          className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-[var(--text-body)] transition-colors hover:bg-[var(--surface-muted)] focus-visible:outline-2 focus-visible:outline-brand-500"
        >
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand-700/10 text-brand-700">
            <Sparkles className="h-4.5 w-4.5" aria-hidden="true" />
          </span>
          Chat with Gokaasa Booking Assistant
        </button>
      </div>

      {/* Chat panel: a full-screen takeover below the xl breakpoint (phones and tablets), a full-height side
          panel docked to the right edge on wide screens (the page shifts to make room instead of being covered). Always mounted (like the menu above), visibility driven purely by
          class toggles, so both opening and closing transition smoothly with plain CSS -- no extra
          "closing" state machinery needed. */}
      <div
        className={cn(
          'fixed inset-0 z-40 h-[100dvh] overflow-hidden transition-opacity duration-200 motion-reduce:transition-none xl:inset-y-0 xl:left-auto xl:right-0 xl:h-auto xl:w-[var(--assistant-dock-width)]',
          panel === 'chat' ? 'opacity-100' : 'pointer-events-none opacity-0',
        )}
        role="dialog"
        aria-modal={wide ? undefined : 'true'}
        aria-label="Gokaasa Booking Assistant"
        aria-hidden={panel !== 'chat'}
      >
        <div
          ref={chatPanelRef}
          tabIndex={-1}
          className={cn(
            'absolute inset-0 overflow-hidden bg-[var(--surface-card)] shadow-2xl outline-none transition-transform duration-200 motion-reduce:transition-none xl:border-l xl:border-[var(--border-subtle)]',
            panel === 'chat' ? 'translate-y-0 xl:translate-x-0' : 'translate-y-full xl:translate-y-0 xl:translate-x-full',
          )}
        >
          <BookingAssistant onClose={() => setPanel(null)} open={panel === 'chat'} />
        </div>
      </div>

      {/* Launcher button, with a one-time "Plan your stay" label reveal (and on hover/focus afterwards). */}
      <div className="group relative flex items-center">
        <span
          className={cn(
            'pointer-events-none absolute right-16 whitespace-nowrap rounded-full bg-[var(--text-strong)] px-3 py-1.5 text-xs font-medium text-white opacity-0 shadow-lg transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100 motion-safe:[animation:launcherLabelIntro_5s_ease-in-out_1]',
            panel && 'hidden',
          )}
        >
          {LAUNCHER_LABEL}
        </span>
        <Button
          ref={launcherButtonRef}
          type="button"
          onClick={() => setPanel((p) => (p ? null : 'menu'))}
          aria-expanded={panel === 'menu'}
          aria-haspopup="true"
          aria-label={panel ? 'Close support menu' : 'Need help? Open support options'}
          className={cn('h-14 w-14 rounded-full p-0 shadow-xl transition-transform duration-200 hover:-translate-y-0.5 motion-reduce:transition-none motion-safe:[animation:launcherPop_0.4s_ease-out_1]', chatOpen && 'xl:hidden')}
        >
          {panel ? <X className="h-5 w-5" aria-hidden="true" /> : <Headset className="h-5 w-5" aria-hidden="true" />}
        </Button>
      </div>
    </div>
  );
}
