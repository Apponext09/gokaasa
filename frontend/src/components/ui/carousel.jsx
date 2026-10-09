import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from './button.jsx';
import { cn } from '@/lib/utils.js';

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

const AUTO_SCROLL_INTERVAL_MS = 5000;

/**
 * A horizontal rail with Previous/Next buttons. Touch/trackpad swipe comes free from native scroll-snap;
 * the buttons are real, keyboard-reachable `<button>`s, and disable themselves at each end.
 *
 * `autoScroll` is opt-in and off by default, so every existing caller (Travel Inspiration, Testimonials,
 * etc.) keeps its current behaviour untouched. When on, it advances by one card every ~5s, pauses on
 * hover/focus/touch and while a manual scroll is in flight, resumes after, wraps back to the start at the
 * end, and never runs at all under prefers-reduced-motion.
 */
export function Carousel({ children, className, 'aria-label': ariaLabel, autoScroll = false }) {
  const trackRef = useRef(null);
  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(false);
  const pausedRef = useRef(false);

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

  /** One card's width plus the track's own gap, so auto-advance moves a single card, not a whole page. */
  const scrollByOneCard = () => {
    const el = trackRef.current;
    if (!el || !el.firstElementChild) return;
    const cardWidth = el.firstElementChild.getBoundingClientRect().width;
    const gap = Number.parseFloat(getComputedStyle(el).columnGap || '16');
    const atEnd = el.scrollLeft + el.clientWidth >= el.scrollWidth - 4;
    if (atEnd) {
      el.scrollTo({ left: 0, behavior: 'smooth' });
    } else {
      el.scrollBy({ left: cardWidth + gap, behavior: 'smooth' });
    }
  };

  useEffect(() => {
    if (!autoScroll || prefersReducedMotion()) return undefined;
    const interval = setInterval(() => {
      if (!pausedRef.current) scrollByOneCard();
    }, AUTO_SCROLL_INTERVAL_MS);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoScroll, children]);

  const pause = () => { pausedRef.current = true; };
  // A brief delay before resuming, so the guest has a moment after letting go before it moves again.
  const resume = () => { setTimeout(() => { pausedRef.current = false; }, 1500); };

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
        onPointerEnter={autoScroll ? pause : undefined}
        onPointerLeave={autoScroll ? resume : undefined}
        onFocus={autoScroll ? pause : undefined}
        onBlur={autoScroll ? resume : undefined}
        onTouchStart={autoScroll ? pause : undefined}
        onTouchEnd={autoScroll ? resume : undefined}
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
