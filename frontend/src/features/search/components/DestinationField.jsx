import { useEffect, useId, useState } from 'react';
import { Building2, Landmark, MapPin, Search, X } from 'lucide-react';
import { discoveryApi } from '@/services/endpoints.js';
import { useDebounce } from '@/hooks/useDebounce.js';
import { cn } from '@/lib/utils.js';

const TYPE_ICON = { CITY: MapPin, AREA: Landmark, HOTEL: Building2 };
const MIN_CHARS = 2;

/**
 * Destination box. Suggestions are debounced and cancelled when superseded, so typing never sends a request per
 * keystroke. A chosen suggestion carries the destination slug (city, area or hotel) used in the URL.
 */
export function DestinationField({ value, onChange, onTextChange, disabled = false, id = 'destination', bare = false }) {
  const [text, setText] = useState(value?.label ?? '');
  const [items, setItems] = useState([]);
  const [status, setStatus] = useState('idle');
  const [active, setActive] = useState(-1);
  const [focused, setFocused] = useState(false);
  const listId = useId();
  const debounced = useDebounce(text, 250);

  useEffect(() => {
    setText(value?.label ?? '');
  }, [value?.label]);

  useEffect(() => {
    const query = debounced.trim();
    if (query.length < MIN_CHARS || (value && query === value.label)) {
      setItems([]);
      setStatus('idle');
      return undefined;
    }
    const controller = new AbortController();
    setStatus('loading');
    discoveryApi
      .suggestDestinations(query, { signal: controller.signal })
      .then((results) => {
        setItems(results);
        setStatus('ready');
        setActive(-1);
      })
      .catch((error) => {
        if (error?.name !== 'CanceledError' && error?.code !== 'ERR_CANCELED') setStatus('error');
      });
    return () => controller.abort();
    // value is intentionally excluded: the query itself drives the request.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);

  const choose = (item) => {
    const label = item.label;
    setText(label);
    setItems([]);
    onChange({
      type: item.type,
      label,
      subtitle: item.subtitle,
      destination: item.destination,
      area: item.area ?? null,
      hotelSlug: item.hotelSlug ?? null,
    });
  };

  const onKeyDown = (event) => {
    if (!items.length) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActive((a) => (a + 1) % items.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((a) => (a <= 0 ? items.length - 1 : a - 1));
    } else if (event.key === 'Enter' && active >= 0) {
      event.preventDefault();
      choose(items[active]);
    } else if (event.key === 'Escape') {
      setItems([]);
    }
  };

  const showList = focused && items.length > 0;

  return (
    <div className="relative">
      <label
        htmlFor={id}
        className={cn(
          'flex min-h-14 items-center gap-3 px-4 focus-within:ring-2 focus-within:ring-brand-500/20',
          bare ? 'focus-within:bg-[var(--surface-muted)]' : 'rounded-[var(--radius-control)] border border-[var(--border-subtle)] bg-[var(--surface-card)] focus-within:border-brand-500',
        )}
      >
        <Search className="h-4 w-4 shrink-0 text-[var(--text-muted)]" aria-hidden="true" />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">Destination</span>
          <input
            id={id}
            type="text"
            role="combobox"
            aria-expanded={showList}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
            autoComplete="off"
            disabled={disabled}
            value={text}
            placeholder="Where are you going?"
            onChange={(event) => {
              setText(event.target.value);
              onTextChange?.(event.target.value);
              if (value) onChange(null);
            }}
            onFocus={() => setFocused(true)}
            onBlur={() => setTimeout(() => setFocused(false), 120)}
            onKeyDown={onKeyDown}
            className="w-full bg-transparent py-2 text-sm font-medium text-[var(--text-strong)] placeholder:font-normal placeholder:text-[var(--text-muted)] focus:outline-none"
          />
        </span>
        {text && (
          <button type="button" aria-label="Clear destination" onClick={() => { setText(''); setItems([]); onChange(null); }} className="grid h-7 w-7 place-items-center rounded-full text-[var(--text-muted)] hover:bg-[var(--surface-muted)]">
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </label>

      {showList && (
        <ul id={listId} role="listbox" aria-label="Destination suggestions" className="absolute left-0 right-0 top-full z-40 mt-2 max-h-80 overflow-y-auto rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] py-2 shadow-lg">
          {items.map((item, index) => {
            const Icon = TYPE_ICON[item.type] ?? MapPin;
            return (
              <li
                key={`${item.type}-${item.label}-${index}`}
                id={`${listId}-${index}`}
                role="option"
                aria-selected={index === active}
                onMouseDown={(event) => {
                  event.preventDefault();
                  choose(item);
                }}
                onMouseEnter={() => setActive(index)}
                className={cn('flex cursor-pointer items-center gap-3 px-4 py-2.5', index === active && 'bg-brand-50')}
              >
                <Icon className="h-4 w-4 shrink-0 text-brand-700" aria-hidden="true" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-[var(--text-strong)]">{item.label}</span>
                  <span className="block truncate text-xs text-[var(--text-muted)]">{item.subtitle}{item.hotelCount ? ` · ${item.hotelCount} hotel${item.hotelCount === 1 ? '' : 's'}` : ''}</span>
                </span>
              </li>
            );
          })}
        </ul>
      )}
      {focused && status === 'ready' && items.length === 0 && text.trim().length >= MIN_CHARS && (
        <p className="absolute left-0 top-full z-40 mt-2 rounded-lg bg-[var(--surface-card)] px-4 py-2 text-xs text-[var(--text-muted)] shadow">
          No matching places yet. Try a city name.
        </p>
      )}
      {status === 'loading' && focused && text.trim().length >= MIN_CHARS && items.length === 0 && (
        <p className="sr-only" aria-live="polite">Searching places</p>
      )}
      {status === 'error' && <p className="mt-1 text-xs text-danger-600">Suggestions are unavailable right now. You can still type a city.</p>}
    </div>
  );
}
