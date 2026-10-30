-- Simplify internal hotel review to one shared queue and one consolidated decision comment.
-- `hotel_reviews` stores the current submission/decision; `hotel_review_events` stores its history.

DROP TABLE IF EXISTS hotel_review_issues;

DROP INDEX IF EXISTS hotel_reviews_queue_idx;
ALTER TABLE hotel_reviews DROP COLUMN IF EXISTS assigned_reviewer_id;
CREATE INDEX hotel_reviews_queue_idx ON hotel_reviews (status, submitted_at DESC);

DELETE FROM hotel_review_events
 WHERE event_type IN ('ASSIGNED', 'ISSUE_ADDED', 'ISSUE_FIXED', 'ISSUE_VERIFIED', 'ISSUE_REOPENED');

ALTER TABLE hotel_review_events DROP CONSTRAINT IF EXISTS hotel_review_events_event_type_check;
ALTER TABLE hotel_review_events ADD CONSTRAINT hotel_review_events_event_type_check CHECK (event_type IN (
  'SUBMITTED', 'RESUBMITTED', 'CHANGES_REQUESTED', 'APPROVED', 'PUBLISHED'
));

ALTER TABLE hotel_reviews ADD CONSTRAINT hotel_reviews_decision_summary_length
  CHECK (decision_summary IS NULL OR char_length(decision_summary) <= 2000);
