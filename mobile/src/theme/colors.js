/**
 * Mirrors the website's own design tokens 1:1 (frontend/src/index.css) so the mobile app and the
 * website read as the same brand, not two different products. Never invent a new palette here --
 * add to this file only by copying a value that already exists in index.css.
 */
export const colors = {
  brand50: '#eef2f8',
  brand100: '#dce4f0',
  brand200: '#b6c6e0',
  brand300: '#8da7cd',
  brand400: '#5c7fb0',
  brand500: '#35588c',
  brand600: '#1e3a5f',
  brand700: '#152c49',
  brand800: '#0f2138',
  brand900: '#0a1726',

  accent50: '#fdf6e9',
  accent100: '#faeac6',
  accent200: '#f2d690',
  accent300: '#e9bf64',
  accent400: '#e2a53f',
  accent500: '#cc8a2a',
  accent600: '#a66e1d',
  accent700: '#7f5316',

  success50: '#ecf8f0',
  success600: '#17803d',
  warning50: '#fdf5e6',
  warning600: '#a86a0d',
  danger50: '#fdeeee',
  danger600: '#c2372f',
  danger700: '#a02a23',

  surfacePage: '#faf8f4',
  surfaceCard: '#ffffff',
  surfaceMuted: '#f1ede5',
  borderSubtle: '#e8e2d6',
  textStrong: '#121a28',
  textBody: '#3b4452',
  textMuted: '#6f6a62',
  white: '#ffffff',

  // A dark, semi-transparent scrim for text legibility over hotel photography (image galleries, card
  // image footers) -- derived from brand900, never a plain black, so the warmth of the brand still
  // shows through.
  scrim: 'rgba(10, 23, 38, 0.45)',
  scrimLight: 'rgba(10, 23, 38, 0.22)',
};
