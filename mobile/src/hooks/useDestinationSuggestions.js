import { useEffect, useRef, useState } from 'react';
import { hotelsApi } from '../api/hotelsApi.js';

/**
 * Debounced destination autocomplete, shared by HomeScreen's search card and SearchScreen's search
 * form so there is exactly one place that calls GET /destinations/search. A stale in-flight request is
 * aborted (not just ignored) the moment a newer one supersedes it, so a slow response can never
 * overwrite a more recent one.
 */
export function useDestinationSuggestions(text, selected) {
  const [suggestions, setSuggestions] = useState([]);
  const debounceRef = useRef(null);
  const abortRef = useRef(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (text.trim().length < 2 || (selected && text === selected.label)) {
      setSuggestions([]);
      return undefined;
    }
    debounceRef.current = setTimeout(() => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      hotelsApi
        .suggestDestinations(text.trim(), { signal: controller.signal })
        .then(setSuggestions)
        .catch((err) => {
          if (err?.code !== 'CANCELED') setSuggestions([]);
        });
    }, 250);
    return () => clearTimeout(debounceRef.current);
  }, [text, selected]);

  useEffect(() => () => abortRef.current?.abort(), []);

  return { suggestions, clearSuggestions: () => setSuggestions([]) };
}
