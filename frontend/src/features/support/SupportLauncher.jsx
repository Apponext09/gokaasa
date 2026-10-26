import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Headset, MessageCircle, Sparkles, X } from 'lucide-react';
import { Button } from '@/components/ui/button.jsx';
import { buildWhatsAppUrl } from '@/config/support.js';
import { BookingAssistant } from '@/features/support/BookingAssistant.jsx';
import { cn } from '@/lib/utils.js';

const LAUNCHER_LABEL = 'Plan your stay';
const DOCK_QUERY = '(min-width: 768px)';

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
 * Floating support launcher at the bottom-right.
 * Opens WhatsApp support or Gokaasa Concierge. When opened, the concierge
 * chatbot stays small, compact, and unobtrusive at the bottom-right.
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

  // Close on route change
  useEffect(() => {
    setPanel(null);
  }, [location.pathname]);

  // Close on Escape key
  useEffect(() => {
    if (!panel) return undefined;
    const onKey = (event) => {
      if (event.key === 'Escape') setPanel(null);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [panel]);

  // Close menu or chat on click outside
  useEffect(() => {
    if (!panel) return undefined;
    const onDown = (event) => {
      const isInsideLauncher = containerRef.current && containerRef.current.contains(event.target);
      const isInsideChat = chatPanelRef.current && chatPanelRef.current.contains(event.target);
      if (!isInsideLauncher && !isInsideChat) {
        setPanel(null);
      }
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [panel]);

  // Focus management
  useEffect(() => {
    if (panel === 'chat') {
      wasOpenRef.current = true;
      chatPanelRef.current?.focus();
    } else if (wasOpenRef.current) {
      wasOpenRef.current = false;
      launcherButtonRef.current?.focus();
    }
  }, [panel]);

  const openWhatsApp = () => {
    window.open(buildWhatsAppUrl(), '_blank', 'noopener,noreferrer');
    setPanel(null);
  };

  return (
    <>
      {/* Compact, small concierge card at bottom-right */}
      <div
        className={cn(
          'assistant-panel-shell fixed z-50 overflow-hidden transition-all duration-200 ease-out motion-reduce:transition-none',
          'bottom-3 right-3 w-[min(290px,calc(100vw-1.5rem))] h-[min(385px,calc(100dvh-5rem))] rounded-2xl shadow-2xl sm:bottom-5 sm:right-5 sm:w-[325px] sm:h-[min(460px,calc(100dvh-5rem))] sm:rounded-2xl',
          chatOpen
            ? 'translate-y-0 opacity-100 pointer-events-auto scale-100'
            : 'translate-y-3 opacity-0 pointer-events-none scale-95',
        )}
        role="dialog"
        aria-modal={wide ? undefined : 'true'}
        aria-label="Gokaasa Booking Assistant"
        inert={!chatOpen ? '' : undefined}
      >
        <div
          ref={chatPanelRef}
          tabIndex={-1}
          className="assistant-panel flex h-full w-full flex-col overflow-hidden bg-[var(--surface-card)] shadow-2xl outline-none rounded-2xl border border-[var(--border-subtle)] md:border-white/70"
        >
          <BookingAssistant onClose={() => setPanel(null)} open={chatOpen} />
        </div>
      </div>

      {/* Floating launcher button and options menu at original bottom-right position */}
      <div ref={containerRef} className="support-launcher fixed bottom-20 right-3 z-40 sm:bottom-6 sm:right-6">
        {/* Menu: WhatsApp vs. Chat */}
        <div
          className={cn(
            'support-menu absolute bottom-16 right-0 w-[min(19rem,calc(100vw-1.5rem))] origin-bottom-right overflow-hidden rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-card)] p-2.5 shadow-2xl transition-all duration-200 motion-reduce:transition-none',
            panel === 'menu' ? 'scale-100 opacity-100' : 'pointer-events-none scale-95 opacity-0',
          )}
          role="dialog"
          aria-label="Support options"
          aria-hidden={panel !== 'menu'}
        >
          <div className="support-menu-heading mb-2 rounded-xl px-3 py-3 text-white">
            <p className="text-sm font-bold">How can we help?</p>
            <p className="mt-0.5 text-xs text-white/70">Choose the quickest way to reach us.</p>
          </div>
          <button
            type="button"
            onClick={openWhatsApp}
            className="support-menu-option flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-[var(--text-body)] transition-colors hover:bg-[var(--surface-muted)] focus-visible:outline-2 focus-visible:outline-brand-500"
          >
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-success-50 text-success-600">
              <MessageCircle className="h-4.5 w-4.5" aria-hidden="true" />
            </span>
            <span><span className="block">WhatsApp support</span><span className="block text-[11px] font-normal text-[var(--text-muted)]">Chat with our support team</span></span>
          </button>
          <button
            type="button"
            onClick={() => setPanel('chat')}
            className="support-menu-option flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-[var(--text-body)] transition-colors hover:bg-[var(--surface-muted)] focus-visible:outline-2 focus-visible:outline-brand-500"
          >
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand-700/10 text-brand-700">
              <Sparkles className="h-4.5 w-4.5" aria-hidden="true" />
            </span>
            <span><span className="block">Gokaasa concierge</span><span className="block text-[11px] font-normal text-[var(--text-muted)]">Plan and book your perfect stay</span></span>
          </button>
        </div>

        {/* Launcher button, with tooltip reveal on hover/focus */}
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
            className={cn('support-launcher-button relative h-13 w-13 overflow-visible rounded-2xl p-0 shadow-xl transition-transform duration-200 hover:-translate-y-0.5 motion-reduce:transition-none motion-safe:[animation:launcherPop_0.4s_ease-out_1]', chatOpen && 'hidden')}
          >
            {panel ? <X className="h-5 w-5" aria-hidden="true" /> : <Headset className="h-5 w-5" aria-hidden="true" />}
          </Button>
        </div>
      </div>
    </>
  );
}
