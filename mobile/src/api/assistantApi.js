import { api } from './client.js';

/**
 * Mirrors the website's services/endpoints.js#assistantApi exactly -- GET /assistant/status tells the
 * caller whether a real AI provider is configured on the backend (it is NOT, by default, in this
 * environment); POST /assistant/extract is the optional AI-powered alternative to the local, zero-network
 * bilingualParser.js. Both are public (no auth) and rate-limited server-side, same as the website.
 */
export const assistantApi = {
  status: () => api.get('/assistant/status').then((r) => r.data),
  extract: (message) => api.post('/assistant/extract', { message }).then((r) => r.data),
};
