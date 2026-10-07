import { tokenize } from './primitives.js';

/**
 * Scores how well a provider result matches what the admin typed. Returns 0-100.
 * Token overlap drives the score; a matching city adds confidence so "Taj Lands End, Mumbai"
 * ranks the Mumbai property above a same-named hotel elsewhere.
 */
export function matchConfidence({ query, name, city, state }) {
  const queryTokens = tokenize(query);
  const nameTokens = tokenize(name);
  if (queryTokens.size === 0 || nameTokens.size === 0) return 0;

  const overlap = [...queryTokens].filter((token) => nameTokens.has(token)).length;
  const nameCoverage = overlap / queryTokens.size;
  const precision = overlap / nameTokens.size;
  let score = (nameCoverage * 0.7 + precision * 0.3) * 100;

  const locationTokens = tokenize(`${city ?? ''} ${state ?? ''}`);
  const queryMentionsLocation = [...locationTokens].some((token) => queryTokens.has(token));
  if (queryMentionsLocation) score += 10;

  return Math.max(0, Math.min(100, Math.round(score)));
}
