import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Expand, Images, X } from 'lucide-react';
import { SafeImage } from '@/components/shared/SafeImage.jsx';
import { Button } from '@/components/ui/button.jsx';
import { cn } from '@/lib/utils.js';
import { isIllustrativeImage } from '@/features/hotels/imageDisclaimer.js';

function ImageCategoryTag({ image }) {
  const label = image?.categoryName || (image?.category ? image.category.charAt(0).toUpperCase() + image.category.slice(1).toLowerCase().replaceAll('_', ' ') : null);
  if (!label && !isIllustrativeImage(image)) return null;
  return (
    <span className="pointer-events-none absolute bottom-1.5 left-1.5 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white/90">
      {label || 'Illustrative image'}
    </span>
  );
}

/**
 * Guest-facing photo gallery. Desktop: a large hero with a grid behind it. Mobile: a swipeable strip.
 * The lightbox supports keyboard arrows and Escape, and a fullscreen toggle where the browser allows it.
 * This reads photos only; the admin ImageGallery is the editing tool and is not reused here.
 */
export function PublicGallery({ images, name, compact = false }) {
  const [index, setIndex] = useState(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [strip, setStrip] = useState(0);
  const [desktopStart, setDesktopStart] = useState(0);
  const stripRef = useRef(null);
  const lightboxRef = useRef(null);
  const count = images.length;

  useEffect(() => {
    if (index == null) return undefined;
    const onKey = (event) => {
      if (event.key === 'Escape') close();
      if (event.key === 'ArrowRight') setIndex((i) => (i + 1) % count);
      if (event.key === 'ArrowLeft') setIndex((i) => (i - 1 + count) % count);
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [index, count]);

  useEffect(() => {
    const onChange = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  const close = () => {
    if (document.fullscreenElement) document.exitFullscreen?.();
    setIndex(null);
  };

  const toggleFullscreen = () => {
    if (document.fullscreenElement) {
      document.exitFullscreen?.();
    } else {
      lightboxRef.current?.requestFullscreen?.().catch(() => {});
    }
  };

  if (count === 0) {
    return <SafeImage className="aspect-[16/9] w-full rounded-xl md:aspect-[3/1]" fallbackLabel={`${name}: photos coming soon`} eager />;
  }

  const desktopImages = Array.from(
    { length: Math.min(count, 5) },
    (_, offset) => {
      const imageIndex = (desktopStart + offset) % count;
      return { image: images[imageIndex], imageIndex };
    },
  );
  const hero = desktopImages[0];
  const gridImages = desktopImages.slice(1);
  const remaining = count - 5;

  return (
    <div className={cn('public-gallery relative', compact ? 'space-y-0' : 'space-y-2 sm:space-y-3')}>
      {/* Mobile: swipeable strip with a counter */}
      <div className="relative md:hidden">
        <div
          ref={stripRef}
          className="public-gallery-mobile-strip flex snap-x snap-mandatory overflow-x-auto scroll-smooth rounded-2xl [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          onScroll={(event) => {
            const { scrollLeft, clientWidth } = event.currentTarget;
            setStrip(clientWidth ? Math.round(scrollLeft / clientWidth) : 0);
          }}
        >
          {images.map((image, i) => (
            <button key={image.url + i} type="button" onClick={() => setIndex(i)} className="relative aspect-[16/10] w-full shrink-0 snap-center sm:aspect-[4/3]" aria-label={`Open photo ${i + 1} of ${count}`}>
              <SafeImage src={image.url} alt={image.altText ?? name} eager={i === 0} className="h-full w-full" sizes="100vw" fallbackLabel={`${name}: photo ${i + 1}`} />
              <ImageCategoryTag image={image} />
            </button>
          ))}
        </div>
        <span className="pointer-events-none absolute bottom-3 right-3 rounded-full bg-black/60 px-2.5 py-1 text-xs font-medium text-white">
          {strip + 1} / {count}
        </span>
      </div>

      {/* Desktop: hero plus grid */}
      <div className={cn('public-gallery-grid hidden grid-cols-4 grid-rows-2 gap-1.5 overflow-hidden rounded-xl md:grid', compact ? 'h-[9.5rem]' : 'h-[21rem]')}>
        <button
          type="button"
          onClick={() => setIndex(hero.imageIndex)}
          className={cn(
            'relative row-span-2 focus-visible:outline-2 focus-visible:outline-brand-500',
            count === 1 ? 'col-span-4' : 'col-span-2',
          )}
          aria-label={`Open photo ${hero.imageIndex + 1} of ${count}`}
        >
          <SafeImage src={hero.image.url} alt={hero.image.altText ?? name} eager className="h-full w-full" sizes="50vw" fallbackLabel={`${name}: main photo`} />
          <ImageCategoryTag image={hero.image} />
        </button>
        {gridImages.map(({ image, imageIndex }, i) => {
          const isLast = i === gridImages.length - 1 && remaining > 0;
          return (
            <button
              key={image.url + imageIndex}
              type="button"
              onClick={() => setIndex(imageIndex)}
              className={cn(
                'relative focus-visible:outline-2 focus-visible:outline-brand-500',
                count === 2 && 'col-span-2 row-span-2',
                count === 3 && 'row-span-2',
                count === 4 && i === 0 && 'row-span-2',
              )}
              aria-label={`Open photo ${imageIndex + 1} of ${count}`}
            >
              <SafeImage src={image.url} alt={image.altText ?? name} className="h-full w-full" sizes="25vw" fallbackLabel={`${name}: photo ${i + 2}`} />
              {!isLast && <ImageCategoryTag image={image} />}
              {isLast && (
                <span className="absolute inset-0 grid place-items-center bg-black/45 text-sm font-semibold text-white">+{remaining} more</span>
              )}
            </button>
          );
        })}
      </div>

      <div className={cn('public-gallery-toolbar flex items-center justify-between', compact && 'md:absolute md:inset-x-2.5 md:bottom-2.5 md:z-10 md:pointer-events-none')}>
        <p className={cn('inline-flex items-center gap-1.5 text-sm text-[var(--text-muted)]', compact && 'md:rounded-full md:bg-black/65 md:px-2.5 md:py-1.5 md:text-xs md:text-white')}>
          <Images className="h-4 w-4" aria-hidden="true" /> {count} photo{count === 1 ? '' : 's'}
        </p>
        <div className={cn('flex items-center gap-2', compact && 'md:pointer-events-auto')}>
          {count > 1 && (
            <div className="hidden items-center gap-2 md:flex" aria-label="Gallery controls">
              <Button
                type="button"
                variant="secondary"
                size="icon"
                className={cn('rounded-full bg-white shadow-sm', compact && 'h-8 w-8 min-h-8')}
                onClick={() => setDesktopStart((current) => (current - 1 + count) % count)}
                aria-label="Previous gallery image"
              >
                <ChevronLeft className="h-4 w-4" aria-hidden="true" />
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="icon"
                className={cn('rounded-full bg-white shadow-sm', compact && 'h-8 w-8 min-h-8')}
                onClick={() => setDesktopStart((current) => (current + 1) % count)}
                aria-label="Next gallery image"
              >
                <ChevronRight className="h-4 w-4" aria-hidden="true" />
              </Button>
            </div>
          )}
          <button type="button" onClick={() => setIndex(0)} className={cn('inline-flex items-center gap-1.5 text-sm font-medium text-brand-700 hover:underline', compact && 'md:rounded-full md:bg-white md:px-3 md:py-1.5 md:text-xs md:shadow-sm')}>
            <Expand className="h-4 w-4" aria-hidden="true" /> View all photos
          </button>
        </div>
      </div>

      {index !== null && (
        <div ref={lightboxRef} role="dialog" aria-modal="true" aria-label={`${name} photos`} className={cn('fixed inset-0 z-[60] flex flex-col bg-black/95 text-white', fullscreen && 'bg-black')}>
          <div className="flex items-center justify-between gap-3 px-4 py-3">
            <p className="text-sm">{index + 1} / {count}</p>
            <div className="flex items-center gap-1">
              <button type="button" onClick={toggleFullscreen} className="grid h-9 w-9 place-items-center rounded-full hover:bg-white/10" aria-label={fullscreen ? 'Exit fullscreen' : 'Fullscreen'}>
                <Expand className="h-4 w-4" />
              </button>
              <button type="button" onClick={close} className="grid h-9 w-9 place-items-center rounded-full hover:bg-white/10" aria-label="Close gallery">
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>
          <div className="relative flex min-h-0 flex-1 items-center justify-center px-12 sm:px-16">
            <button type="button" onClick={() => setIndex((index - 1 + count) % count)} className="absolute left-2 grid h-10 w-10 place-items-center rounded-full bg-white/10 hover:bg-white/20" aria-label="Previous photo">
              <ChevronLeft className="h-5 w-5" />
            </button>
            <div className="relative max-h-full max-w-full">
              <img
                src={images[index].url}
                alt={images[index].altText ?? name}
                className="max-h-full max-w-full object-contain"
                decoding="async"
              />
              {(() => {
                const img = images[index];
                const label = img?.categoryName || (img?.category ? img.category.charAt(0).toUpperCase() + img.category.slice(1).toLowerCase().replaceAll('_', ' ') : null);
                if (label) {
                  return (
                    <span className="absolute bottom-2 left-2 rounded bg-black/60 px-2.5 py-1 text-xs font-medium text-white/90">
                      {label}
                    </span>
                  );
                }
                if (isIllustrativeImage(img)) {
                  return (
                    <span className="absolute bottom-2 left-2 rounded bg-black/60 px-2 py-1 text-xs font-medium text-white/90">
                      Illustrative -- not an actual photo of this property
                    </span>
                  );
                }
                return null;
              })()}
            </div>
            <button type="button" onClick={() => setIndex((index + 1) % count)} className="absolute right-2 grid h-10 w-10 place-items-center rounded-full bg-white/10 hover:bg-white/20" aria-label="Next photo">
              <ChevronRight className="h-5 w-5" />
            </button>
          </div>
          <div className="flex justify-center gap-1.5 overflow-x-auto px-4 py-3">
            {images.map((image, i) => (
              <button key={image.url + i} type="button" onClick={() => setIndex(i)} aria-label={`Photo ${i + 1}`} aria-current={i === index} className={cn('h-12 w-16 shrink-0 overflow-hidden rounded-md border-2', i === index ? 'border-white' : 'border-transparent opacity-60')}>
                <img src={image.url} alt="" loading="lazy" className="h-full w-full object-cover" />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
