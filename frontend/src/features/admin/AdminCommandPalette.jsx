import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Building2, CalendarCheck, Loader2, Search, User } from 'lucide-react';
import { adminApi } from '@/services/endpoints.js';
import { useAuth } from '@/features/auth/AuthContext.jsx';
import { cn } from '@/lib/utils.js';

const TYPE_ICON = { hotel: Building2, booking: CalendarCheck, customer: User };
const TYPE_LABEL = { page: 'Page', hotel: 'Hotel', booking: 'Booking', customer: 'Customer' };

/**
 * Ctrl+K / Cmd+K anywhere in the admin panel. Sidebar pages are matched locally while one debounced
 * request finds hotel, booking and customer records using the same staff scoping as their list pages.
 */
export function AdminCommandPalette({ navigation = [] }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [items, setItems] = useState(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef(null);
  const rootRef = useRef(null);
  const navigate = useNavigate();
  const { isAdmin } = useAuth();

  const navigationItems = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (term.length < 2) return [];
    return navigation.flatMap((group) => group.items
      .filter((item) => (!item.adminOnly || isAdmin) && `${item.label} ${group.section ?? ''}`.toLowerCase().includes(term))
      .map((item) => ({
        type: 'page',
        id: item.to,
        title: item.label,
        subtitle: group.section ? `${group.section} page` : 'Admin page',
        href: item.to,
        icon: item.icon,
      })));
  }, [isAdmin, navigation, query]);

  const results = useMemo(() => [...navigationItems, ...(items ?? [])], [items, navigationItems]);

  useEffect(() => {
    const onKeyDown = (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setOpen(true);
        requestAnimationFrame(() => inputRef.current?.focus());
      } else if (event.key === 'Escape') {
        setOpen(false);
        inputRef.current?.blur();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    const closeOnOutsideClick = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener('mousedown', closeOnOutsideClick);
    return () => document.removeEventListener('mousedown', closeOnOutsideClick);
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
    setQuery('');
    navigate(item.href);
  };

  const onKeyDownInList = (event) => {
    if (!results.length) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, results.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (event.key === 'Enter' && results[activeIndex]) {
      event.preventDefault();
      go(results[activeIndex]);
    }
  };

  return (
    <div ref={rootRef} className="relative w-full max-w-md">
      <div className={cn(
        'admin-search flex h-10 w-full items-center gap-2 rounded-xl border bg-slate-50 px-3.5 text-sm transition',
        open ? 'border-brand-400 bg-white ring-2 ring-brand-100' : 'border-slate-200 text-slate-500 hover:border-slate-300 hover:bg-white',
      )}>
          <Search className="h-4 w-4 shrink-0 text-[var(--text-muted)]" aria-hidden="true" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActiveIndex(0);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={onKeyDownInList}
            placeholder="Search pages, hotels, bookings, customers..."
            aria-label="Search Gokaasa"
            className="w-full bg-transparent text-sm text-[var(--text-strong)] placeholder:text-[var(--text-muted)] focus:outline-none"
          />
          <kbd className="hidden shrink-0 rounded border border-[var(--border-subtle)] bg-white px-1.5 py-0.5 text-[10px] font-medium text-[var(--text-muted)] sm:inline">{open ? 'Esc' : 'Ctrl K'}</kbd>
      </div>

      {open && (
        <div className="absolute left-0 top-[calc(100%+0.5rem)] z-[100] max-h-[min(28rem,calc(100vh-6rem))] w-full overflow-y-auto rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] shadow-2xl shadow-slate-950/15" role="listbox">
          {query.trim().length === 0 && (
            <p className="px-4 py-6 text-center text-sm text-[var(--text-muted)]">Search any sidebar page, hotel, booking or customer.</p>
          )}
          {query.trim().length > 0 && query.trim().length < 2 && (
            <p className="px-4 py-6 text-center text-sm text-[var(--text-muted)]">Type at least 2 characters.</p>
          )}
          {query.trim().length >= 2 && items === null && results.length === 0 && (
            <p className="flex items-center justify-center gap-2 px-4 py-6 text-sm text-[var(--text-muted)]">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Searching…
            </p>
          )}
          {items?.length === 0 && results.length === 0 && <p className="px-4 py-6 text-center text-sm text-[var(--text-muted)]">No matches.</p>}
          {results.map((item, index) => {
            const Icon = item.icon ?? TYPE_ICON[item.type] ?? Search;
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
      )}
    </div>
  );
}
