-- Simplify room pricing: one permanent nightly base price per rate plan.
-- Legacy per-date rows remain for rollback/audit, but customer search and quotes use this column.
ALTER TABLE rate_plans
  ADD COLUMN base_price_minor BIGINT CHECK (base_price_minor >= 0),
  ADD COLUMN pricing_review_required BOOLEAN NOT NULL DEFAULT FALSE;

WITH price_summary AS (
  SELECT rp.id,
         COUNT(DISTINCT prices.base_price_minor) > 1 AS needs_review,
         (ARRAY_AGG(prices.base_price_minor ORDER BY
             CASE WHEN prices.stay_date >= CURRENT_DATE THEN 0 ELSE 1 END,
             CASE WHEN prices.stay_date >= CURRENT_DATE THEN prices.stay_date END ASC,
             prices.stay_date DESC
           ) FILTER (WHERE prices.base_price_minor IS NOT NULL))[1] AS selected_base_price
    FROM rate_plans rp
    LEFT JOIN rate_prices prices ON prices.rate_plan_id = rp.id
   GROUP BY rp.id
)
UPDATE rate_plans plan
   SET base_price_minor = summary.selected_base_price,
       pricing_review_required = summary.needs_review
  FROM price_summary summary
 WHERE summary.id = plan.id;

CREATE INDEX rate_plans_sellable_price_idx
  ON rate_plans (room_type_id, status, base_price_minor)
  WHERE deleted_at IS NULL;
