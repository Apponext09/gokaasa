import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { wishlistApi } from '../api/wishlistApi.js';
import { useAuth } from './AuthContext.js';

const WishlistContext = createContext(null);

/** Wishlist is always the backend's own data (GET/POST/DELETE /api/wishlist) -- this context only caches
 * the current user's wishlisted hotel ids in memory for instant heart-icon state, never invents data. */
export function WishlistProvider({ children }) {
  const { isAuthenticated } = useAuth();
  const [ids, setIds] = useState(new Set());
  const [items, setItems] = useState([]);
  const [status, setStatus] = useState('idle'); // 'idle' | 'loading' | 'ready' | 'error'

  const refresh = useCallback(async () => {
    if (!isAuthenticated) {
      setIds(new Set());
      setItems([]);
      setStatus('idle');
      return;
    }
    setStatus('loading');
    try {
      const list = await wishlistApi.list();
      setItems(list);
      setIds(new Set(list.map((h) => h.id)));
      setStatus('ready');
    } catch {
      setStatus('error');
    }
  }, [isAuthenticated]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const isWishlisted = useCallback((hotelId) => ids.has(hotelId), [ids]);

  const toggle = useCallback(
    async (hotelId) => {
      const was = ids.has(hotelId);
      // Optimistic, but reconciled with a real refresh right after -- the heart icon never lies for long.
      setIds((prev) => {
        const next = new Set(prev);
        if (was) next.delete(hotelId);
        else next.add(hotelId);
        return next;
      });
      try {
        if (was) await wishlistApi.remove(hotelId);
        else await wishlistApi.add(hotelId);
        await refresh();
        return { ok: true };
      } catch (err) {
        setIds((prev) => {
          const next = new Set(prev);
          if (was) next.add(hotelId);
          else next.delete(hotelId);
          return next;
        });
        return { ok: false, error: err };
      }
    },
    [ids, refresh],
  );

  const value = useMemo(() => ({ items, status, isWishlisted, toggle, refresh }), [items, status, isWishlisted, toggle, refresh]);

  return <WishlistContext.Provider value={value}>{children}</WishlistContext.Provider>;
}

export function useWishlist() {
  const ctx = useContext(WishlistContext);
  if (!ctx) throw new Error('useWishlist must be used within a WishlistProvider');
  return ctx;
}
