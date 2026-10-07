/*
 * The room the guest chose, stored as a snapshot of the backend quote. This is the hand-off point for the
 * booking phase: guest details and the inventory hold will read this and re-quote on the server before
 * anything is reserved or charged. Nothing here is authoritative.
 */

const KEY = 'gokaasa.stay-selection';

export function saveSelection(selection) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ ...selection, savedAt: new Date().toISOString() }));
  } catch {
    // Private browsing or disabled storage: the selection simply does not persist.
  }
}

export function readSelection() {
  try {
    const raw = sessionStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function clearSelection() {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // Nothing to clear.
  }
}
