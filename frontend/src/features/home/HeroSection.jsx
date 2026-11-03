import { useEffect, useRef } from 'react';

import { SearchWidget } from '@/features/search/components/SearchWidget.jsx';
import { useHomepageBackground } from '@/features/home/HomepageBackgroundContext.jsx';

export function HeroSection({ onSearch }) {
  const {
    heroSlides,
    heroIndex,
    setHeroIndex,
    setHeroHeight,
  } = useHomepageBackground();

  const useSharedBackdrop = heroSlides.length > 0;

  const heroRef = useRef(null);

  /*
   * Observe the COMPLETE hero section, including:
   * - Hero background area
   * - Hero heading
   * - Search widget
   *
   * This allows the shared Navbar + Hero background
   * to extend below the SearchWidget.
   */
  useEffect(() => {
    const el = heroRef.current;

    if (!el || typeof ResizeObserver === 'undefined') {
      return undefined;
    }

    const observer = new ResizeObserver(([entry]) => {
      const height =
        entry.borderBoxSize?.[0]?.blockSize ??
        entry.contentRect.height;

      setHeroHeight(height);
    });

    observer.observe(el, { box: 'border-box' });

    return () => {
      observer.disconnect();
      setHeroHeight(0);
    };
  }, [setHeroHeight]);

  return (
    <section
      ref={heroRef}
      className="customer-booking-hero"
    >
      <div
        className="customer-hero-arch"
        style={
          useSharedBackdrop
            ? { background: 'transparent' }
            : undefined
        }
      >
        {!useSharedBackdrop && (
          <>
            <div
              className="customer-hero-slides"
              aria-hidden="true"
            />

            <div
              className="customer-hero-overlay"
              aria-hidden="true"
            />
          </>
        )}

        <div className="customer-hero-split">
          <div className="customer-hero-content">
            {heroSlides[heroIndex]?.heroText && (
              <h1 key={heroSlides[heroIndex].src}>
                {heroSlides[heroIndex].heroText}
              </h1>
            )}
          </div>
        </div>

        {heroSlides.length > 1 && (
          <div
            className="customer-hero-dots"
            role="group"
            aria-label="Choose hero image"
          >
            {heroSlides.map((slide, index) => (
              <button
                key={slide.src}
                type="button"
                aria-label={`Show ${slide.label}`}
                aria-current={
                  index === heroIndex ? 'true' : undefined
                }
                onClick={() => setHeroIndex(index)}
                className={
                  index === heroIndex ? 'is-active' : ''
                }
              />
            ))}
          </div>
        )}
      </div>

      {/* SEARCH WIDGET */}

      <div className="customer-search-shell animate-[heroSearch_900ms_cubic-bezier(0.22,1,0.36,1)_both]">
        <SearchWidget
          variant="hero"
          onSearch={onSearch}
        />
      </div>
    </section>
  );
}
