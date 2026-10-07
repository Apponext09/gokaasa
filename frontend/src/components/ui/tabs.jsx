import { useRef } from 'react';
import { cn } from '@/lib/utils.js';

/** Accessible tab list. Arrow keys move focus between tabs, Home and End jump to the ends. */
export function Tabs({ value, onChange, items, label, className }) {
  const refs = useRef({});

  const focusTo = (index) => {
    const next = items[(index + items.length) % items.length];
    refs.current[next.value]?.focus();
    onChange(next.value);
  };

  const onKeyDown = (event, index) => {
    if (event.key === 'ArrowRight') focusTo(index + 1);
    else if (event.key === 'ArrowLeft') focusTo(index - 1);
    else if (event.key === 'Home') focusTo(0);
    else if (event.key === 'End') focusTo(items.length - 1);
  };

  return (
    <div role="tablist" aria-label={label} className={cn('flex gap-1 overflow-x-auto border-b border-[var(--border-subtle)]', className)}>
      {items.map((item, index) => {
        const selected = item.value === value;
        return (
          <button
            key={item.value}
            ref={(node) => {
              refs.current[item.value] = node;
            }}
            role="tab"
            id={`tab-${item.value}`}
            aria-selected={selected}
            aria-controls={`panel-${item.value}`}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(item.value)}
            onKeyDown={(event) => onKeyDown(event, index)}
            className={cn(
              'relative -mb-px flex shrink-0 items-center gap-2 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-brand-500',
              selected ? 'border-brand-600 text-brand-700' : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-strong)]',
            )}
          >
            {item.label}
            {item.badge != null && (
              <span className="rounded-full bg-[var(--surface-muted)] px-1.5 text-xs text-[var(--text-body)]">{item.badge}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export function TabPanel({ value, current, children, className }) {
  if (value !== current) return null;
  return (
    <div role="tabpanel" id={`panel-${value}`} aria-labelledby={`tab-${value}`} className={cn('space-y-6', className)}>
      {children}
    </div>
  );
}
