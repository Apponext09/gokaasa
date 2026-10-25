import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Wraps the browser Geolocation API. Consumers may explicitly call `request()` or opt into one automatic
 * request; the browser still controls the permission prompt. `status` is one of:
 * idle | requesting | granted | denied | unavailable | timeout.
 */
export function useGeolocation({ autoRequest = false } = {}) {
  const [status, setStatus] = useState('idle');
  const [coords, setCoords] = useState(null);
  const autoRequested = useRef(false);

  const request = useCallback(() => {
    if (!('geolocation' in navigator)) {
      setStatus('unavailable');
      return;
    }
    setStatus('requesting');
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setCoords({ lat: position.coords.latitude, lng: position.coords.longitude });
        setStatus('granted');
      },
      (error) => {
        if (error.code === error.PERMISSION_DENIED) setStatus('denied');
        else if (error.code === error.TIMEOUT) setStatus('timeout');
        else setStatus('unavailable');
      },
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 5 * 60 * 1000 },
    );
  }, []);

  useEffect(() => {
    if (!autoRequest || autoRequested.current) return;
    autoRequested.current = true;
    request();
  }, [autoRequest, request]);

  return { status, coords, request };
}
