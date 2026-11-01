import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { discoveryApi } from '@/services/endpoints.js';

const HomepageBackgroundContext = createContext({
  heroSlides: [],
  heroIndex: 0,
  setHeroIndex: () => {},
  navbarHeight: 0,
  setNavbarHeight: () => {},
  heroHeight: 0,
  setHeroHeight: () => {},
  heroAreaHeight: 0,
});

/**
 * Fetches the admin-managed homepage background images (discoveryApi.homepageBackgrounds(), the same
 * API and image URLs the Admin Homepage Background Management page already uploads to) exactly ONCE, and
 * owns the active-slide index. Mounted in CustomerLayout, above both the Navbar and the routed page, so
 * the Navbar and the homepage hero always read the SAME slide list and the SAME current index -- one
 * fetch, one auto-advance timer, instead of two independently-fetched, independently-cycling carousels
 * that could drift out of sync. When the admin replaces an image, the next time this provider re-fetches
 * (e.g. a fresh page load) both consumers pick up the new URL automatically, since both read from here.
 *
 * `navbarHeight`/`heroHeight` are reported up by Navbar.jsx and HeroSection.jsx themselves (each measures
 * its own rendered height via ResizeObserver). `heroAreaHeight` is their sum -- the exact, always-current
 * pixel height of the combined Navbar+Hero region, used to size the ONE shared background image
 * (CustomerLayout's HomepageHeroBackdrop) so the full uploaded image can be shown with
 * `background-size: contain` against that specific region instead of the whole viewport, with no seam
 * between Navbar and Hero because there is only one image element spanning both.
 */
export function HomepageBackgroundProvider({ children }) {
  const [homepageBackgrounds, setHomepageBackgrounds] = useState(null);
  const [heroIndex, setHeroIndex] = useState(0);
  const [navbarHeight, setNavbarHeight] = useState(0);
  const [heroHeight, setHeroHeight] = useState(0);

  useEffect(() => {
    let cancelled = false;
    discoveryApi.homepageBackgrounds().then((images) => {
      if (!cancelled) setHomepageBackgrounds(images);
    }).catch(() => {
      if (!cancelled) setHomepageBackgrounds([]);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const heroSlides = useMemo(
    () => (homepageBackgrounds ?? []).map((image) => ({
      src: image.url,
      label: image.altText || `Homepage background ${image.slot}`,
      heroText: image.heroText,
    })),
    [homepageBackgrounds],
  );

  // Only advances automatically with more than one real uploaded image -- a single image (or none yet)
  // never cycles, per "If only one image exists, display it without carousel controls."
  useEffect(() => {
    setHeroIndex(0);
    if (heroSlides.length <= 1) return undefined;
    const interval = window.setInterval(() => {
      setHeroIndex((current) => (current + 1) % heroSlides.length);
    }, 6000);
    return () => window.clearInterval(interval);
  }, [heroSlides.length]);

  const value = useMemo(
    () => ({
      heroSlides,
      heroIndex,
      setHeroIndex,
      navbarHeight,
      setNavbarHeight,
      heroHeight,
      setHeroHeight,
      heroAreaHeight: navbarHeight + heroHeight,
    }),
    [heroSlides, heroIndex, navbarHeight, heroHeight],
  );

  return <HomepageBackgroundContext.Provider value={value}>{children}</HomepageBackgroundContext.Provider>;
}

/** Read-only consumer hook. Used by Navbar (home route only), HeroSection, and CustomerLayout's backdrop. */
export function useHomepageBackground() {
  return useContext(HomepageBackgroundContext);
}
