import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from './button.jsx';
import { cn } from '@/lib/utils.js';

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/**
 * A horizontal rail with Previous/Next buttons. Touch/trackpad swipe comes free from native scroll-snap;
 * the buttons are real, keyboard-reachable `<button>`s, and disable themselves at each end.
 */
export function Carousel({ children, className, 'aria-label': ariaLabel }) {
  const trackRef = useRef(null);
  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(false);

  useEffect(() => {
    const el = trackRef.current;
    if (!el) return undefined;
    const update = () => {
      setCanPrev(el.scrollLeft > 4);
      setCanNext(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
    };
    update();
    el.addEventListener('scroll', update, { passive: true });
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => {
      el.removeEventListener('scroll', update);
      observer.disconnect();
    };
  }, [children]);

  const scrollByPage = (direction) => {
    const el = trackRef.current;
    if (!el) return;
    el.scrollBy({ left: direction * el.clientWidth * 0.9, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
  };

  return (
    <div className={cn('relative', className)}>
      <div
        ref={trackRef}
        role="group"
        aria-label={ariaLabel}
        tabIndex={0}
        onKeyDown={(event) => {
          if (event.key === 'ArrowRight') scrollByPage(1);
          if (event.key === 'ArrowLeft') scrollByPage(-1);
        }}
        className="flex gap-4 overflow-x-auto scroll-smooth snap-x snap-mandatory pb-1 [scrollbar-width:none] focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 rounded-[var(--radius-card)] [&::-webkit-scrollbar]:hidden"
      >
        {children}
      </div>
      <div className="mt-3 flex items-center justify-end gap-2">
        <Button type="button" variant="secondary" size="icon" aria-label="Previous" disabled={!canPrev} onClick={() => scrollByPage(-1)}>
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        </Button>
        <Button type="button" variant="secondary" size="icon" aria-label="Next" disabled={!canNext} onClick={() => scrollByPage(1)}>
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </Button>
      </div>
    </div>
  );
}

export function CarouselItem({ children, className }) {
  return <div className={cn('shrink-0 snap-start', className)}>{children}</div>;
}
