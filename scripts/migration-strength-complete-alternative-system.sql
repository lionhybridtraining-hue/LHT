-- Migration: complete strength exercise alternative system
-- Adds lateral alternatives on plan slots and an athlete movement variant profile.

BEGIN;

ALTER TABLE strength_plan_exercises
  ADD COLUMN IF NOT EXISTS alt_lateral_exercise_id uuid REFERENCES exercises(id) ON DELETE SET NULL;

ALTER TABLE athletes
  ADD COLUMN IF NOT EXISTS strength_movement_variant text NOT NULL DEFAULT 'standard';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'athletes_strength_movement_variant_check'
  ) THEN
    ALTER TABLE athletes
      ADD CONSTRAINT athletes_strength_movement_variant_check
      CHECK (strength_movement_variant IN ('standard', 'lateralized'));
  END IF;
END $$;

COMMENT ON COLUMN strength_plan_exercises.alt_lateral_exercise_id
  IS 'Optional lateralized alternative for this plan slot.';

COMMENT ON COLUMN athletes.strength_movement_variant
  IS 'Preferred movement variant for strength plan resolution: standard or lateralized.';

COMMIT;