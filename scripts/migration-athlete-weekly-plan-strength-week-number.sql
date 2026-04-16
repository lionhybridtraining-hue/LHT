-- Migration: materialize strength week number in athlete_weekly_plan
-- Supports multi-phase strength programs where each phase starts at week 1
-- inside its own strength plan instance.

BEGIN;

ALTER TABLE athlete_weekly_plan
  ADD COLUMN IF NOT EXISTS strength_week_number integer;

UPDATE athlete_weekly_plan
SET strength_week_number = week_number
WHERE strength_instance_id IS NOT NULL
  AND strength_day_number IS NOT NULL
  AND strength_week_number IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_awp_strength_week_number'
  ) THEN
    ALTER TABLE athlete_weekly_plan
      ADD CONSTRAINT chk_awp_strength_week_number
      CHECK (strength_week_number IS NULL OR strength_week_number >= 1);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_athlete_weekly_plan_strength_slot
  ON athlete_weekly_plan(athlete_id, strength_instance_id, strength_week_number, strength_day_number)
  WHERE strength_instance_id IS NOT NULL AND strength_week_number IS NOT NULL AND strength_day_number IS NOT NULL;

COMMENT ON COLUMN athlete_weekly_plan.strength_week_number
  IS 'Week inside the linked strength plan instance. Distinct from program week_number for phased programs.';

COMMIT;