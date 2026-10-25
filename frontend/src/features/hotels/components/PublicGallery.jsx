import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Expand, Images, X } from 'lucide-react';
import { SafeImage } from '@/components/shared/SafeImage.jsx';
import { cn } from '@/lib/utils.js';
import { isIllustrativeImage } from '@/features/hotels/imageDisclaimer.js';

function IllustrativeTag() {
  return (
    <span className="pointer-events-none absolute bottom-1.5 left-1.5 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white/90">
      Illustrative image
    </span>
  );
}

/**
 * Guest-facing photo gallery. Desktop: a large hero with a grid behind it. Mobile: a swipeable strip.
 * The lightbox supports keyboard arrows and Escape, and a fullscreen toggle where the browser allows it.
 * This reads photos only; the admin ImageGallery is the editing tool and is not reused here.
 */
export function PublicGallery({ images, name }) {
  const [index, setIndex] = useState(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [strip, setStrip] = useState(0);
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
    return <SafeImage className="aspect-[16/9] w-full rounded-2xl md:aspect-[21/9]" fallbackLabel={`${name}: photos coming soon`} eager />;
  }

  const hero = images[0];
  const gridImages = images.slice(1, 5);
  const remaining = count - 5;

  return (
    <div className="space-y-3">
      {/* Mobile: swipeable strip with a counter */}
      <div className="relative md:hidden">
        <div
          ref={stripRef}
          className="flex snap-x snap-mandatory overflow-x-auto scroll-smooth rounded-2xl [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          onScroll={(event) => {
            const { scrollLeft, clientWidth } = event.currentTarget;
            setStrip(clientWidth ? Math.round(scrollLeft / clientWidth) : 0);
          }}
        >
          {images.map((image, i) => (
            <button key={image.url + i} type="button" onClick={() => setIndex(i)} className="relative aspect-[4/3] w-full shrink-0 snap-center" aria-label={`Open photo ${i + 1} of ${count}`}>
              <SafeImage src={image.url} alt={image.altText ?? name} eager={i === 0} className="h-full w-full" sizes="100vw" fallbackLabel={`${name}: photo ${i + 1}`} />
              {isIllustrativeImage(image) && <IllustrativeTag />}
            </button>
          ))}
        </div>
        <span className="pointer-events-none absolute bottom-3 right-3 rounded-full bg-black/60 px-2.5 py-1 text-xs font-medium text-white">
          {strip + 1} / {count}
        </span>
      </div>

      {/* Desktop: hero plus grid */}
      <div className="hidden h-[26rem] grid-cols-4 grid-rows-2 gap-2 overflow-hidden rounded-2xl md:grid">
        <button type="button" onClick={() => setIndex(0)} className="relative col-span-2 row-span-2 focus-visible:outline-2 focus-visible:outline-brand-500" aria-label={`Open photo 1 of ${count}`}>
          <SafeImage src={hero.url} alt={hero.altText ?? name} eager className="h-full w-full" sizes="50vw" fallbackLabel={`${name}: main photo`} />
          {isIllustrativeImage(hero) && <IllustrativeTag />}
        </button>
        {gridImages.map((image, i) => {
          const isLast = i === gridImages.length - 1 && remaining > 0;
          return (
            <button key={image.url + i} type="button" onClick={() => setIndex(i + 1)} className="relative focus-visible:outline-2 focus-visible:outline-brand-500" aria-label={`Open photo ${i + 2} of ${count}`}>
              <SafeImage src={image.url} alt={image.altText ?? name} className="h-full w-full" sizes="25vw" fallbackLabel={`${name}: photo ${i + 2}`} />
              {isIllustrativeImage(image) && !isLast && <IllustrativeTag />}
              {isLast && (
                <span className="absolute inset-0 grid place-items-center bg-black/45 text-sm font-semibold text-white">+{remaining} more</span>
              )}
            </button>
          );
        })}
      </div>

      <div className="flex items-center justify-between">
        <p className="inline-flex items-center gap-1.5 text-sm text-[var(--text-muted)]">
          <Images className="h-4 w-4" aria-hidden="true" /> {count} photo{count === 1 ? '' : 's'}
        </p>
        <button type="button" onClick={() => setIndex(0)} className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-700 hover:underline">
          <Expand className="h-4 w-4" aria-hidden="true" /> View all photos
        </button>
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
              {isIllustrativeImage(images[index]) && (
                <span className="absolute bottom-2 left-2 rounded bg-black/60 px-2 py-1 text-xs font-medium text-white/90">
                  Illustrative -- not an actual photo of this property
                </span>
              )}
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
