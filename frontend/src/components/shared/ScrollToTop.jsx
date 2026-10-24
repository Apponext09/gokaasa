import { useEffect } from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';

/**
 * Browser pushState/replaceState navigation (what every <Link> and navigate() call does) never resets
 * scroll position on its own -- only a full page load does that natively. Mounted once, inside the
 * router, this restores the "new page starts at the top" behavior users expect from normal links.
 *
 * - Skipped on back/forward (POP): the browser's own scroll restoration (history.scrollRestoration,
 *   left at its default "auto") already returns the user to where they were, and resetting here would
 *   destroy that for every Back button press across the app.
 * - Skipped when only the query string changes (pathname and hash unchanged): hotel search/filter/sort/
 *   page updates live entirely in the query string, and should never yank the page back to the top.
 * - A URL hash scrolls that element into view instead of the very top, so the footer's #blog/#careers/
 *   #faqs-style anchor links keep working. An unmatched hash still falls back to the top.
 */
export function ScrollToTop() {
  const { pathname, hash } = useLocation();
  const navigationType = useNavigationType();

  useEffect(() => {
    if (navigationType === 'POP') return;

    if (hash) {
      const target = document.getElementById(hash.slice(1));
      if (target) {
        target.scrollIntoView();
        return;
      }
    }

    window.scrollTo(0, 0);
  }, [pathname, hash, navigationType]);

  return null;
}
