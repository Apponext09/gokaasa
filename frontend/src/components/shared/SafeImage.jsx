import { useState } from 'react';
import { ImageOff } from 'lucide-react';
import { cn } from '@/lib/utils.js';

/**
 * Image with a placeholder while loading and a fallback if the file is missing or blocked. Lazy by default,
 * so images below the fold cost nothing until the user scrolls to them.
 */
export function SafeImage({ src, alt = '', className, eager = false, sizes, fallbackLabel = 'Photo coming soon' }) {
  const [state, setState] = useState(src ? 'loading' : 'missing');
  if (state === 'missing' || state === 'error') {
    return (
      <div role="img" aria-label={fallbackLabel} className={cn('grid place-items-center bg-[var(--surface-muted)] text-[var(--text-muted)]', className)}>
        <div className="flex flex-col items-center gap-1 text-xs">
          <ImageOff className="h-5 w-5" aria-hidden="true" />
          <span>{fallbackLabel}</span>
        </div>
      </div>
    );
  }
  return (
    <div className={cn('relative overflow-hidden bg-[var(--surface-muted)]', className)}>
      {state === 'loading' && <div aria-hidden="true" className="absolute inset-0 animate-pulse bg-[var(--surface-muted)]" />}
      <img
        src={src}
        alt={alt}
        loading={eager ? 'eager' : 'lazy'}
        decoding="async"
        sizes={sizes}
        onLoad={() => setState('ready')}
        onError={() => setState('error')}
        className={cn('h-full w-full object-cover transition-opacity duration-300', state === 'ready' ? 'opacity-100' : 'opacity-0')}
      />
    </div>
  );
}
