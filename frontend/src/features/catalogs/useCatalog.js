import { useCallback, useEffect, useState } from 'react';
import { catalogApi } from '@/services/endpoints.js';

const catalogCache = new Map();
const catalogRequests = new Map();

const cacheKey = (kind, admin) => `${admin ? 'admin' : 'public'}:${kind}`;

function requestCatalog(kind, admin, { force = false } = {}) {
  const key = cacheKey(kind, admin);
  if (!force && catalogCache.has(key)) return Promise.resolve(catalogCache.get(key));
  if (catalogRequests.has(key)) return catalogRequests.get(key);

  const request = (admin ? catalogApi.adminList(kind) : catalogApi.list(kind))
    .then((items) => {
      catalogCache.set(key, items);
      return items;
    })
    .finally(() => {
      if (catalogRequests.get(key) === request) catalogRequests.delete(key);
    });

  catalogRequests.set(key, request);
  return request;
}

export function preloadCatalog(kind, { admin = false } = {}) {
  return requestCatalog(kind, admin).catch(() => undefined);
}

export function invalidateCatalog(kind) {
  catalogCache.delete(cacheKey(kind, false));
  catalogCache.delete(cacheKey(kind, true));
}

export function useCatalog(kind, { admin = false } = {}) {
  const key = cacheKey(kind, admin);
  const [items, setItems] = useState(() => catalogCache.get(key) ?? []);
  const [loading, setLoading] = useState(() => !catalogCache.has(key));
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const nextItems = await requestCatalog(kind, admin, { force: true });
      setItems(nextItems);
      return nextItems;
    } catch (nextError) {
      setError(nextError);
      return undefined;
    }
  }, [admin, kind]);

  useEffect(() => {
    let active = true;
    const cachedItems = catalogCache.get(key);

    if (cachedItems) {
      setItems(cachedItems);
      setLoading(false);
    } else {
      setLoading(true);
    }
    setError(null);

    requestCatalog(kind, admin)
      .then((nextItems) => {
        if (active) setItems(nextItems);
      })
      .catch((nextError) => {
        if (active) setError(nextError);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => { active = false; };
  }, [admin, key, kind]);

  return { items, loading, error, refresh };
}

