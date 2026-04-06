-- Migration: Phased Payments
-- Adds payment_model to training_programs and creates the phased payment
-- ledger (payment_plans + payment_charges) managed by the internal DB.
-- Stripe is used only as a charge processor per line; the DB owns the schedule.

-- 1. Add payment_model to training_programs
ALTER TABLE training_programs
  ADD COLUMN IF NOT EXISTS payment_model TEXT
    CHECK (payment_model IN ('single', 'recurring', 'phased'))
    DEFAULT 'single';

-- Backfill: recurring billing_type programs get 'recurring' payment_model
UPDATE training_programs
  SET payment_model = 'recurring'
  WHERE billing_type = 'recurring' AND (payment_model IS NULL OR payment_model = 'single');

-- 2. Payment Plans — represents the full financial commitment for one purchase
CREATE TABLE IF NOT EXISTS payment_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Links (at least one must be set)
  identity_id TEXT NOT NULL,
  program_id UUID NOT NULL REFERENCES training_programs(id) ON DELETE RESTRICT,
  program_assignment_id UUID REFERENCES program_assignments(id) ON DELETE SET NULL,
  stripe_purchase_id UUID REFERENCES stripe_purchases(id) ON DELETE SET NULL,

  -- Financial commitment
  total_amount_cents INTEGER NOT NULL CHECK (total_amount_cents > 0),
  currency TEXT NOT NULL DEFAULT 'EUR',
  total_installments INTEGER NOT NULL CHECK (total_installments >= 2),

  -- Schedule
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  frequency TEXT NOT NULL CHECK (frequency IN ('weekly', 'biweekly', 'monthly')),

  -- Policy
  grace_period_days INTEGER NOT NULL DEFAULT 7,
  max_retry_attempts INTEGER NOT NULL DEFAULT 3,

  -- State
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'paused', 'completed', 'cancelled')),

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payment_plans_identity ON payment_plans(identity_id);
CREATE INDEX IF NOT EXISTS idx_payment_plans_program ON payment_plans(program_id);
CREATE INDEX IF NOT EXISTS idx_payment_plans_status ON payment_plans(status);

-- 3. Payment Charges — individual charge lines within a plan
CREATE TABLE IF NOT EXISTS payment_charges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  payment_plan_id UUID NOT NULL REFERENCES payment_plans(id) ON DELETE CASCADE,

  -- Line details
  charge_number INTEGER NOT NULL CHECK (charge_number >= 1),
  charge_label TEXT,
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  currency TEXT NOT NULL DEFAULT 'EUR',

  -- Schedule
  due_date DATE NOT NULL,

  -- Execution
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'paid', 'failed', 'overdue', 'cancelled', 'skipped')),
  stripe_payment_intent_id TEXT,
  stripe_charge_id TEXT,

  -- Results
  paid_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  failure_reason TEXT,

  -- Retry
  retry_count INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TIMESTAMPTZ,
  grace_period_ends_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (payment_plan_id, charge_number)
);

-- Scheduler index: find charges due for processing
CREATE INDEX IF NOT EXISTS idx_payment_charges_due
  ON payment_charges (due_date, status)
  WHERE status IN ('pending', 'failed', 'overdue');

-- Admin filter index: status + due_date range
CREATE INDEX IF NOT EXISTS idx_payment_charges_status_due
  ON payment_charges (status, due_date DESC);

-- Reconciliation index: find by stripe payment intent
CREATE INDEX IF NOT EXISTS idx_payment_charges_stripe_pi
  ON payment_charges (stripe_payment_intent_id)
  WHERE stripe_payment_intent_id IS NOT NULL;

-- Link stripe_purchases to payment_plans (optional)
ALTER TABLE stripe_purchases
  ADD COLUMN IF NOT EXISTS payment_plan_id UUID REFERENCES payment_plans(id) ON DELETE SET NULL;
