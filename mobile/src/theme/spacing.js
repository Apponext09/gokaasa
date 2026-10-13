/** A single spacing scale, used everywhere instead of ad-hoc numbers, so rhythm stays consistent. */
export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
};

/** Matches the website's --radius-control / --radius-card tokens. */
export const radius = {
  control: 10,
  card: 14,
  pill: 999,
};

/** Line-heights are set explicitly (not left to the platform default) so multi-line hotel names,
 * descriptions and addresses wrap with consistent, readable spacing on every screen size. */
export const typography = {
  hero: { fontSize: 30, fontWeight: '700', letterSpacing: -0.4, lineHeight: 36 },
  display: { fontSize: 26, fontWeight: '700', letterSpacing: -0.3, lineHeight: 32 },
  h1: { fontSize: 22, fontWeight: '700', letterSpacing: -0.2, lineHeight: 28 },
  h2: { fontSize: 18, fontWeight: '600', lineHeight: 24 },
  body: { fontSize: 15, fontWeight: '400', lineHeight: 21 },
  bodyStrong: { fontSize: 15, fontWeight: '600', lineHeight: 21 },
  caption: { fontSize: 13, fontWeight: '400', lineHeight: 18 },
  captionStrong: { fontSize: 13, fontWeight: '700', lineHeight: 18 },
  tiny: { fontSize: 11, fontWeight: '500', lineHeight: 15 },
};

/** Elevation scale: subtle (chips/pills that still need to lift off the page), card (the standard
 * surface every hotel/room/booking card uses), floating (search cards, sheets, anything meant to feel
 * like it's hovering above the page). */
export const shadow = {
  subtle: {
    shadowColor: '#0a1726',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  card: {
    shadowColor: '#0a1726',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 3,
  },
  floating: {
    shadowColor: '#0a1726',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.16,
    shadowRadius: 16,
    elevation: 8,
  },
};

/** The one press-feedback convention: every tappable surface dims to this opacity while held, instead
 * of each screen inventing its own feedback (or none at all). */
export const PRESSED_OPACITY = 0.85;
