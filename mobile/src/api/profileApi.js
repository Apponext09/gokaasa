import { api } from './client.js';

/**
 * There is no dedicated "update profile" endpoint on the backend today (checked: backend/src/routes has
 * no /profile or /users route beyond /auth/me, which is read-only). Rather than inventing one, this
 * module only wraps what actually exists. ProfileScreen/EditProfileScreen are written to display this
 * real data and to clearly tell the user when an edit isn't wired to anything yet, rather than silently
 * doing nothing or faking success.
 */
export const profileApi = {
  me: () => api.get('/auth/me').then((r) => r.data.user),
};
