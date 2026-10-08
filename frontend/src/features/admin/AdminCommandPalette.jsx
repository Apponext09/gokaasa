import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { Building2, CalendarCheck, Loader2, Search, User } from 'lucide-react';
import { adminApi } from '@/services/endpoints.js';
import { cn } from '@/lib/utils.js';

const TYPE_ICON = { hotel: Building2, booking: CalendarCheck, customer: User };
const TYPE_LABEL = { hotel: 'Hotel', booking: 'Booking', customer: 'Customer' };

/**
 * Ctrl+K / Cmd+K anywhere in the admin panel. One debounced call to the shared search endpoint, which
 * itself just fans out to the hotel/booking/customer list queries those pages already use (same
 * hotel-manager scoping) -- this never queries an arbitrary field, only what those pages already expose.
 */
export function AdminCommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [items, setItems] = useState(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    const onKeyDown = (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setOpen((o) => !o);
      } else if (event.key === 'Escape') {
        setOpen(false);
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    if (open) {
      setQuery('');
      setItems(null);
      setActiveIndex(0);
      // Let the modal mount before focusing.
      requestAnimationFrame(() => inputRef.current?.focus());
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = '';
      };
    }
    return undefined;
  }, [open]);

  useEffect(() => {
    if (!open || query.trim().length < 2) {
      setItems(null);
      return undefined;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => {
      adminApi
        .search(query.trim(), { signal: controller.signal })
        .then((result) => {
          setItems(result);
          setActiveIndex(0);
        })
        .catch(() => !controller.signal.aborted && setItems([]));
    }, 300);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, open]);

  const go = (item) => {
    setOpen(false);
    navigate(item.href);
  };

  const onKeyDownInList = (event) => {
    if (!items?.length) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, items.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (event.key === 'Enter' && items[activeIndex]) {
      event.preventDefault();
      go(items[activeIndex]);
    }
  };

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[100] grid place-items-start justify-center pt-24">
      <button aria-label="Close search" className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} tabIndex={-1} />
      <div role="dialog" aria-modal="true" aria-label="Search Gokaasa" className="relative w-full max-w-lg overflow-hidden rounded-[var(--radius-card)] bg-[var(--surface-card)] shadow-2xl shadow-black/20">
        <div className="flex items-center gap-2 border-b border-[var(--border-subtle)] px-4 py-3">
          <Search className="h-4 w-4 shrink-0 text-[var(--text-muted)]" aria-hidden="true" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDownInList}
            placeholder="Search hotels, bookings, customers…"
            aria-label="Search Gokaasa"
            className="w-full bg-transparent text-sm text-[var(--text-strong)] placeholder:text-[var(--text-muted)] focus:outline-none"
          />
          <kbd className="hidden shrink-0 rounded border border-[var(--border-subtle)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--text-muted)] sm:inline">Esc</kbd>
        </div>

        <div className="max-h-96 overflow-y-auto" role="listbox">
          {query.trim().length > 0 && query.trim().length < 2 && (
            <p className="px-4 py-6 text-center text-sm text-[var(--text-muted)]">Type at least 2 characters.</p>
          )}
          {query.trim().length >= 2 && items === null && (
            <p className="flex items-center justify-center gap-2 px-4 py-6 text-sm text-[var(--text-muted)]">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Searching…
            </p>
          )}
          {items?.length === 0 && <p className="px-4 py-6 text-center text-sm text-[var(--text-muted)]">No matches.</p>}
          {items?.map((item, index) => {
            const Icon = TYPE_ICON[item.type] ?? Search;
            return (
              <button
                key={`${item.type}-${item.id}`}
                type="button"
                role="option"
                aria-selected={index === activeIndex}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => go(item)}
                className={cn(
                  'flex w-full items-center gap-3 px-4 py-2.5 text-left',
                  index === activeIndex ? 'bg-brand-50' : 'hover:bg-[var(--surface-muted)]',
                )}
              >
                <Icon className="h-4 w-4 shrink-0 text-brand-700" aria-hidden="true" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-[var(--text-strong)]">{item.title}</span>
                  <span className="block truncate text-xs text-[var(--text-muted)]">{item.subtitle}</span>
                </span>
                <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">{TYPE_LABEL[item.type]}</span>
                {item.status && <span className="shrink-0 rounded-full bg-[var(--surface-muted)] px-2 py-0.5 text-[10px] font-medium text-[var(--text-body)]">{item.status}</span>}
              </button>
            );
          })}
        </div>
      </div>
    </div>,
    document.body,
  );
}
