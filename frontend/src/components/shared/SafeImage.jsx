import { useEffect, useState } from 'react';
import { ImageOff } from 'lucide-react';
import { cn } from '@/lib/utils.js';

/**
 * Image with a placeholder while loading and a fallback if the file is missing or blocked. Lazy by default,
 * so images below the fold cost nothing until the user scrolls to them.
 */
export function SafeImage({
  src,
  alt = '',
  className,
  eager = false,
  sizes,
  fallbackLabel = 'Photo coming soon',
  showFallbackContent = true,
}) {
  const [state, setState] = useState(src ? 'loading' : 'missing');

  useEffect(() => {
    setState(src ? 'loading' : 'missing');
  }, [src]);

  if (state === 'missing' || state === 'error') {
    return (
      <div role="img" aria-label={fallbackLabel} className={cn('grid place-items-center bg-[var(--surface-muted)] text-[var(--text-muted)]', className)}>
        {showFallbackContent && (
          <div className="flex min-w-0 max-w-full flex-col items-center gap-1 px-3 text-center text-xs">
            <ImageOff className="h-5 w-5 shrink-0" aria-hidden="true" />
            <span className="max-w-full break-words">{fallbackLabel}</span>
          </div>
        )}
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
