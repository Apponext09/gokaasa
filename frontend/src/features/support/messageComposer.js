/**
 * Pure logic for the message composer's submit guard, kept dependency-free (no JSX, no React) so it is
 * directly testable with plain node:test, matching the convention assistantState.js/bilingualParser.js
 * already use. MessageComposer.jsx is the only consumer.
 */

/**
 * Whether the composer may submit right now -- the single source of truth for both the Send button's
 * `disabled` state and the Enter-key handler, so the two can never drift apart. A request already in
 * flight, or an empty/whitespace-only message, must never submit a second time.
 */
export function canSubmitMessage({ submitting, value }) {
  return !submitting && Boolean(value?.trim());
}
