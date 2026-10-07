import { useCallback, useState } from 'react';

/**
 * Wraps the browser Geolocation API as an explicit, user-triggered action (`request()`), never fired on
 * mount. `status` is one of: idle | requesting | granted | denied | unavailable | timeout.
 */
export function useGeolocation() {
  const [status, setStatus] = useState('idle');
  const [coords, setCoords] = useState(null);

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

  return { status, coords, request };
}
