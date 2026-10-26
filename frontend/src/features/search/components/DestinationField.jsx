import { useEffect, useId, useRef, useState } from 'react';
import { Building2, Landmark, MapPin, Search, X } from 'lucide-react';
import { discoveryApi } from '@/services/endpoints.js';
import { useDebounce } from '@/hooks/useDebounce.js';
import { slugifyPlace } from '@/features/search/searchParams.js';
import { cn } from '@/lib/utils.js';

const TYPE_ICON = { CITY: MapPin, AREA: Landmark, HOTEL: Building2 };
const MIN_CHARS = 2;

const citySuggestion = (place) => ({
  type: 'CITY',
  label: place.label,
  subtitle: place.country ? `${place.country} destination` : 'Popular destination',
  destination: place.destination,
  hotelCount: place.hotelCount,
});

const hotelSuggestion = (hotel) => ({
  type: 'HOTEL',
  label: hotel.name,
  subtitle: `Hotel · ${[hotel.area, hotel.city].filter(Boolean).join(', ')}`,
  destination: slugifyPlace(hotel.city),
  hotelSlug: hotel.slug,
});

/**
 * Destination and hotel picker. Focusing it immediately loads useful choices; typing two or more
 * characters switches to the server's live city, area and hotel search. The chosen result keeps the
 * same URL payload used by the existing search and hotel-detail navigation.
 */
export function DestinationField({ value, onChange, onTextChange, disabled = false, id = 'destination', bare = false }) {
  const [text, setText] = useState(value?.label ?? '');
  const [items, setItems] = useState([]);
  const [status, setStatus] = useState('idle');
  const [active, setActive] = useState(-1);
  const [focused, setFocused] = useState(false);
  const [tab, setTab] = useState('ALL');
  const inputRef = useRef(null);
  const listId = useId();
  const debounced = useDebounce(text, 250);

  useEffect(() => {
    setText(value?.label ?? '');
  }, [value?.label]);

  useEffect(() => {
    if (!focused) return undefined;

    const query = debounced.trim();
    const controller = new AbortController();
    let cancelled = false;
    setStatus('loading');

    const isSelectedValue = value && query === value.label;
    const request = query.length >= MIN_CHARS && !isSelectedValue
      ? discoveryApi.suggestDestinations(query, { signal: controller.signal })
      : Promise.all([
          discoveryApi.popularDestinations({ limit: 8 }),
          discoveryApi.featuredHotels(),
        ]).then(([destinations, hotels]) => [
          ...destinations.map(citySuggestion),
          ...hotels.slice(0, 8).map(hotelSuggestion),
        ]);

    request
      .then((results) => {
        if (!cancelled) {
          setItems(results);
          setStatus('ready');
          setActive(-1);
        }
      })
      .catch((error) => {
        if (!cancelled && error?.name !== 'CanceledError' && error?.code !== 'ERR_CANCELED') {
          setStatus('error');
        }
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [debounced, focused, value]);

  const selectedText = Boolean(value && text.trim() === value.label);
  const locallyFilteredItems = text.trim().length > 0 && text.trim().length < MIN_CHARS && !selectedText
    ? items.filter((item) => `${item.label} ${item.subtitle}`.toLowerCase().includes(text.trim().toLowerCase()))
    : items;
  const visibleItems = locallyFilteredItems.filter((item) => {
    if (tab === 'HOTEL') return item.type === 'HOTEL';
    if (tab === 'CITY') return item.type !== 'HOTEL';
    return true;
  });
  const cityCount = locallyFilteredItems.filter((item) => item.type !== 'HOTEL').length;
  const hotelCount = locallyFilteredItems.filter((item) => item.type === 'HOTEL').length;
  const firstHotelIndex = visibleItems.findIndex((item) => item.type === 'HOTEL');
  const showList = focused;

  const choose = (item) => {
    setText(item.label);
    setItems([]);
    setFocused(false);
    inputRef.current?.blur();
    onChange({
      type: item.type,
      label: item.label,
      subtitle: item.subtitle,
      destination: item.destination,
      area: item.area ?? null,
      hotelSlug: item.hotelSlug ?? null,
    });
  };

  const onKeyDown = (event) => {
    if (!visibleItems.length) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActive((current) => (current + 1) % visibleItems.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((current) => (current <= 0 ? visibleItems.length - 1 : current - 1));
    } else if (event.key === 'Enter' && active >= 0) {
      event.preventDefault();
      choose(visibleItems[active]);
    } else if (event.key === 'Escape') {
      setFocused(false);
      inputRef.current?.blur();
    }
  };

  return (
    <div className={cn('relative', bare && 'customer-destination-field')}>
      <label
        htmlFor={id}
        className={cn(
          'flex min-h-14 items-center gap-3 px-4 focus-within:ring-2 focus-within:ring-brand-500/20',
          bare && 'customer-destination-control',
          bare ? 'focus-within:bg-[var(--surface-muted)]' : 'rounded-[var(--radius-control)] border border-[var(--border-subtle)] bg-[var(--surface-card)] focus-within:border-brand-500',
        )}
      >
        {!bare && <Search className="h-4 w-4 shrink-0 text-[var(--text-muted)]" aria-hidden="true" />}
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="text-[11px] font-semibold tracking-wide text-[var(--text-muted)]">{bare ? 'Where to' : 'Destination or hotel'}</span>
          <input
            ref={inputRef}
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
            placeholder={bare ? 'Area or hotel' : 'Search city, locality or hotel name'}
            onChange={(event) => {
              setText(event.target.value);
              setTab('ALL');
              onTextChange?.(event.target.value);
              if (value) onChange(null);
            }}
            onFocus={() => {
              setFocused(true);
              setTab('ALL');
            }}
            onBlur={() => setTimeout(() => setFocused(false), 120)}
            onKeyDown={onKeyDown}
            className="w-full bg-transparent py-2 text-sm font-medium text-[var(--text-strong)] placeholder:font-normal placeholder:text-[var(--text-muted)] focus:outline-none"
          />
        </span>
        {text && (
          <button
            type="button"
            aria-label="Clear destination"
            onClick={() => {
              setText('');
              setItems([]);
              setTab('ALL');
              onChange(null);
              inputRef.current?.focus();
            }}
            className="grid h-7 w-7 place-items-center rounded-full text-[var(--text-muted)] hover:bg-[var(--surface-muted)]"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </label>

      {showList && (
        <>
        <button
          type="button"
          aria-label="Close destination suggestions"
          className="customer-mobile-sheet-backdrop customer-destination-backdrop fixed inset-0 z-[60] bg-slate-950/35 sm:hidden"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => {
            setFocused(false);
            inputRef.current?.blur();
          }}
        />
        <div className="customer-destination-menu absolute left-0 top-full z-40 mt-2 w-full overflow-hidden rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] shadow-lg">
          <div className="flex gap-2 overflow-x-auto border-b border-[var(--border-subtle)] bg-slate-50 px-3 py-2.5" role="tablist" aria-label="Suggestion types">
            {[
              ['ALL', `All results (${locallyFilteredItems.length})`],
              ['CITY', `Cities (${cityCount})`],
              ['HOTEL', `Hotels (${hotelCount})`],
            ].map(([key, label]) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={tab === key}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  setTab(key);
                  setActive(-1);
                }}
                className={cn(
                  'shrink-0 rounded-full border px-3 py-1 text-xs font-semibold transition-colors',
                  tab === key
                    ? 'border-brand-600 bg-brand-600 text-white'
                    : 'border-[var(--border-subtle)] bg-white text-[var(--text-body)] hover:border-brand-300',
                )}
              >
                {label}
              </button>
            ))}
          </div>

          <ul id={listId} role="listbox" aria-label="Destination suggestions" className="max-h-80 overflow-y-auto py-2">
            {status === 'loading' && visibleItems.length === 0 && (
              <li className="px-4 py-5 text-sm text-[var(--text-muted)]" role="status">Loading destinations and hotels…</li>
            )}
            {status === 'ready' && visibleItems.length === 0 && (
              <li className="px-4 py-5 text-sm text-[var(--text-muted)]">No matching cities or hotels found.</li>
            )}
            {visibleItems.map((item, index) => {
              const Icon = TYPE_ICON[item.type] ?? MapPin;
              const showHeading = index === 0 || (tab === 'ALL' && index === firstHotelIndex);
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
                  className={cn('cursor-pointer', index === active && 'bg-brand-50')}
                >
                  {showHeading && (
                    <p className="px-4 pb-1 pt-2 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">
                      {item.type === 'HOTEL' ? 'Hotels' : 'Popular destinations'}
                    </p>
                  )}
                  <div className="flex items-center gap-3 px-4 py-3">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-700">
                      <Icon className="h-4 w-4" aria-hidden="true" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-[var(--text-strong)]">{item.label}</span>
                      <span className="block truncate text-xs text-[var(--text-muted)]">
                        {item.subtitle}{item.hotelCount ? ` · ${item.hotelCount} hotel${item.hotelCount === 1 ? '' : 's'}` : ''}
                      </span>
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
        </>
      )}

      {status === 'error' && (
        <p className="mt-1 text-xs text-danger-600">Suggestions are unavailable right now. You can still type a city.</p>
      )}
    </div>
  );
}
