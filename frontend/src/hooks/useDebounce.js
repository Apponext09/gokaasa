import { useEffect, useState } from 'react';

/** Returns `value` only after it has stopped changing for `delay` ms. Used so typing never floods the API. */
export function useDebounce(value, delay = 250) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}
