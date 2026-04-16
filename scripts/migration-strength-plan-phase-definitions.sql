-- Migration: add composite phase definitions to strength plans.
-- A strength plan can work as a container that resolves child plans by start week.

BEGIN;

ALTER TABLE strength_plans
  ADD COLUMN IF NOT EXISTS phase_definitions jsonb NOT NULL DEFAULT '[]'::jsonb;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_strength_plans_phase_definitions_array'
  ) THEN
    ALTER TABLE strength_plans
      ADD CONSTRAINT chk_strength_plans_phase_definitions_array
      CHECK (jsonb_typeof(phase_definitions) = 'array');
  END IF;
END $$;

COMMENT ON COLUMN strength_plans.phase_definitions
  IS 'Optional array of {start_week, plan_id, label} entries used to resolve child strength plans by program week.';

COMMIT;