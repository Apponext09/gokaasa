/**
 * Hotel lifecycle. The only way to change status is through a transition
 * listed here, so invalid jumps (e.g. DRAFT -> PUBLISHED) are impossible.
 */
export const HOTEL_STATUS = Object.freeze({
  DRAFT: 'DRAFT',
  PENDING_REVIEW: 'PENDING_REVIEW',
  CHANGES_REQUESTED: 'CHANGES_REQUESTED',
  READY_TO_PUBLISH: 'READY_TO_PUBLISH',
  PUBLISHED: 'PUBLISHED',
  UNPUBLISHED: 'UNPUBLISHED',
  ARCHIVED: 'ARCHIVED',
});

export const HOTEL_ACTION = Object.freeze({
  SAVE_DRAFT: 'SAVE_DRAFT',
  SUBMIT_FOR_REVIEW: 'SUBMIT_FOR_REVIEW',
  MARK_READY: 'MARK_READY',
  PUBLISH: 'PUBLISH',
  UNPUBLISH: 'UNPUBLISH',
  ARCHIVE: 'ARCHIVE',
});

const S = HOTEL_STATUS;

const TRANSITIONS = {
  [HOTEL_ACTION.SAVE_DRAFT]: { from: [S.DRAFT, S.PENDING_REVIEW, S.READY_TO_PUBLISH, S.UNPUBLISHED], to: S.DRAFT },
  [HOTEL_ACTION.SUBMIT_FOR_REVIEW]: { from: [S.DRAFT, S.CHANGES_REQUESTED], to: S.PENDING_REVIEW },
  [HOTEL_ACTION.MARK_READY]: { from: [S.PENDING_REVIEW], to: S.READY_TO_PUBLISH },
  [HOTEL_ACTION.PUBLISH]: { from: [S.READY_TO_PUBLISH, S.UNPUBLISHED], to: S.PUBLISHED },
  [HOTEL_ACTION.UNPUBLISH]: { from: [S.PUBLISHED], to: S.UNPUBLISHED },
  [HOTEL_ACTION.ARCHIVE]: { from: [S.DRAFT, S.PENDING_REVIEW, S.CHANGES_REQUESTED, S.READY_TO_PUBLISH, S.UNPUBLISHED, S.PUBLISHED], to: S.ARCHIVED },
};

export function resolveTransition(currentStatus, action) {
  const transition = TRANSITIONS[action];
  if (!transition) return null;
  if (!transition.from.includes(currentStatus)) return null;
  return transition.to;
}

export const EDITABLE_STATUSES = Object.freeze([S.DRAFT, S.PENDING_REVIEW, S.CHANGES_REQUESTED, S.READY_TO_PUBLISH, S.UNPUBLISHED, S.PUBLISHED]);
