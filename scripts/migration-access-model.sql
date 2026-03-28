-- ============================================================
-- Migration: Access Model — Business Scenario Differentiation
--
-- Three access scenarios for training programs:
--   'self_serve'        — Athlete buys and manages their own instance.
--                         Can pause/resume/cancel/restart at will.
--   'coached_one_time'  — Coach-managed during the assignment period.
--                         After computed_end_date, converts to self-serve:
--                         athlete keeps the plan, coach association ends.
--   'coached_recurring' — Active only while recurring subscription is paid.
--                         Instance auto-paused on cancellation;
--                         auto-resumed on payment renewal (with grace period).
--
-- Schema changes:
--   1. training_programs.access_model       — declares the program's scenario
--   2. strength_plan_instances columns      — links to assignment, lock date, access snapshot
--   3. stripe_purchases.grace_period_ends_at — grace window for failed recurring payments
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. training_programs — add access_model
-- ────────────────────────────────────────────────────────────
ALTER TABLE training_programs
  ADD COLUMN IF NOT EXISTS access_model text NOT NULL DEFAULT 'coached_one_time'
  CHECK (access_model IN ('self_serve', 'coached_one_time', 'coached_recurring'));

-- Backfill: recurring billing type → coached_recurring
UPDATE training_programs
  SET access_model = 'coached_recurring'
  WHERE billing_type = 'recurring'
    AND access_model = 'coached_one_time';

-- ────────────────────────────────────────────────────────────
-- 2. strength_plan_instances — add tracking columns
-- ────────────────────────────────────────────────────────────

-- Link to the commercial assignment that originated this instance (NULL = ad-hoc by coach or self-serve)
ALTER TABLE strength_plan_instances
  ADD COLUMN IF NOT EXISTS program_assignment_id uuid
    REFERENCES program_assignments(id) ON DELETE SET NULL;

-- Athlete cannot change instance status before this date (set to computed_end_date of the assignment)
ALTER TABLE strength_plan_instances
  ADD COLUMN IF NOT EXISTS coach_locked_until date;

-- Snapshot of access_model at the time of instance creation
ALTER TABLE strength_plan_instances
  ADD COLUMN IF NOT EXISTS access_model text
    CHECK (access_model IS NULL OR access_model IN ('self_serve', 'coached_one_time', 'coached_recurring'));

-- Link to the Stripe purchase that funds this instance (used by webhook for recurring sync)
ALTER TABLE strength_plan_instances
  ADD COLUMN IF NOT EXISTS stripe_purchase_id uuid
    REFERENCES stripe_purchases(id) ON DELETE SET NULL;

-- Indexes for FK lookups
CREATE INDEX IF NOT EXISTS strength_plan_instances_assignment_idx
  ON strength_plan_instances (program_assignment_id)
  WHERE program_assignment_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS strength_plan_instances_stripe_purchase_idx
  ON strength_plan_instances (stripe_purchase_id)
  WHERE stripe_purchase_id IS NOT NULL;

-- Backfill: link existing instances to program_assignments where resolvable
-- (matches via strength_plans.training_program_id → program_assignments by athlete + program)
UPDATE strength_plan_instances spi
SET
  program_assignment_id = pa.id,
  coach_locked_until    = pa.computed_end_date,
  access_model          = tp.access_model
FROM strength_plans sp
JOIN program_assignments pa
  ON pa.training_program_id = sp.training_program_id
  AND pa.athlete_id = spi.athlete_id
  AND pa.deleted_at IS NULL
  AND pa.status NOT IN ('cancelled')
JOIN training_programs tp
  ON tp.id = sp.training_program_id
WHERE
  spi.plan_id = sp.id
  AND spi.program_assignment_id IS NULL;

-- ────────────────────────────────────────────────────────────
-- 3. stripe_purchases — grace period for failed recurring payments
-- ────────────────────────────────────────────────────────────
-- Set to now() + 7 days when invoice.payment_failed fires.
-- Cleared when invoice.paid fires.
-- Access check grants access if status='payment_failed' AND grace_period_ends_at > now().
ALTER TABLE stripe_purchases
  ADD COLUMN IF NOT EXISTS grace_period_ends_at timestamptz;

CREATE INDEX IF NOT EXISTS stripe_purchases_grace_idx
  ON stripe_purchases (grace_period_ends_at)
  WHERE grace_period_ends_at IS NOT NULL;
