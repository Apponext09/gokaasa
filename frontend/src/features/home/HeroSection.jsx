import { useEffect, useRef } from 'react';
import { SearchWidget } from '@/features/search/components/SearchWidget.jsx';
import { useHomepageBackground } from '@/features/home/HomepageBackgroundContext.jsx';

/**
 * The homepage hero: floating white search card over the shared Navbar+Hero background. heroSlides/
 * heroIndex come from HomepageBackgroundContext (shared with Navbar.jsx on the home route). The actual
 * background image is no longer rendered here (or in Navbar.jsx) -- CustomerLayout's HomepageHeroBackdrop
 * renders it ONCE, sized to the combined Navbar+Hero height (reported via this section's own ResizeObserver
 * below), so the complete uploaded image is visible with no cropping and no seam between the two. This
 * section stays transparent in that case and simply reports its height; the existing navy-gradient
 * fallback (`.customer-hero-arch`'s own CSS background, plus the `.customer-hero-slides`/
 * `.customer-hero-overlay` divs) is unchanged for the "no image uploaded yet" state. `onSearch` is passed
 * straight through to SearchWidget exactly as HomePage.jsx does inline, so the embedded results listing
 * keeps working.
 */
export function HeroSection({ onSearch }) {
  const { heroSlides, heroIndex, setHeroIndex, setHeroHeight } = useHomepageBackground();
  const useSharedBackdrop = heroSlides.length > 0;

  // Reports this section's own rendered (border-box) height to HomepageBackgroundContext -- added to
  // Navbar's own reported height there, giving the shared backdrop the exact pixel height of the combined
  // region. `.customer-hero-arch` has ~160px of its own padding (index.css), which `contentRect` would
  // exclude -- `borderBoxSize` is used instead so the real, on-screen height (including that padding) is
  // what gets reported, restoring the hero's actual previous height instead of a padding-short one.
  const archRef = useRef(null);
  useEffect(() => {
    const el = archRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(([entry]) => {
      const height = entry.borderBoxSize?.[0]?.blockSize ?? entry.contentRect.height;
      setHeroHeight(height);
    });
    observer.observe(el, { box: 'border-box' });
    return () => {
      observer.disconnect();
      setHeroHeight(0);
    };
  }, [setHeroHeight]);

  return (
    <section className="customer-booking-hero">
      <div
        ref={archRef}
        className="customer-hero-arch"
        style={useSharedBackdrop ? { background: 'transparent' } : undefined}
      >
        {!useSharedBackdrop && (
          <>
            <div className="customer-hero-slides" aria-hidden="true" />
            <div className="customer-hero-overlay" aria-hidden="true" />
          </>
        )}

        <div className="customer-hero-split">
          <div className="customer-hero-content">
            {heroSlides[heroIndex]?.heroText && (
              <h1 key={heroSlides[heroIndex].src}>{heroSlides[heroIndex].heroText}</h1>
            )}
          </div>

        </div>

        {heroSlides.length > 1 && (
          <div className="customer-hero-dots" role="group" aria-label="Choose hero image">
            {heroSlides.map((slide, index) => (
              <button
                key={slide.src}
                type="button"
                aria-label={`Show ${slide.label}`}
                aria-current={index === heroIndex ? 'true' : undefined}
                onClick={() => setHeroIndex(index)}
                className={index === heroIndex ? 'is-active' : ''}
              />
            ))}
          </div>
        )}
      </div>

      <div className="customer-search-shell animate-[heroSearch_900ms_cubic-bezier(0.22,1,0.36,1)_both]">
        <SearchWidget variant="hero" onSearch={onSearch} />
      </div>
    </section>
  );
}
