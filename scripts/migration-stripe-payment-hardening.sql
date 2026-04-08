-- Migration: Stripe payment hardening
-- Adds: unique constraint on stripe_payment_intent_id, amount_refunded_cents column,
--        RLS policies on stripe_purchases, and grace period enforcement helper.

-- 1. Unique constraint on stripe_payment_intent_id for atomic upserts
CREATE UNIQUE INDEX IF NOT EXISTS stripe_purchases_payment_intent_unique_idx
ON stripe_purchases (stripe_payment_intent_id)
WHERE stripe_payment_intent_id IS NOT NULL;

-- 2. Track partial refund amounts
ALTER TABLE stripe_purchases
  ADD COLUMN IF NOT EXISTS amount_refunded_cents INTEGER NOT NULL DEFAULT 0;

-- 3. Enable RLS on stripe_purchases
ALTER TABLE stripe_purchases ENABLE ROW LEVEL SECURITY;

-- Athletes can read their own purchases
CREATE POLICY stripe_purchases_athlete_select ON stripe_purchases
  FOR SELECT
  USING (identity_id = auth.uid()::text);

-- Service role has full access (for serverless functions)
CREATE POLICY stripe_purchases_service_all ON stripe_purchases
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- 4. Index for grace_period_ends_at enforcement queries
CREATE INDEX IF NOT EXISTS stripe_purchases_grace_expired_idx
ON stripe_purchases (status, grace_period_ends_at)
WHERE status = 'payment_failed' AND grace_period_ends_at IS NOT NULL;

-- 5. Normalize optional recurring prices in catalog data
-- Quarterly/annual recurring prices are optional; legacy 0 values should be stored as NULL.
UPDATE training_programs
SET
  recurring_price_quarterly_cents = NULLIF(recurring_price_quarterly_cents, 0),
  recurring_price_annual_cents = NULLIF(recurring_price_annual_cents, 0)
WHERE recurring_price_quarterly_cents = 0
   OR recurring_price_annual_cents = 0;
