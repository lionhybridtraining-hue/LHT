-- Migration: athlete gym access preference for strength exercise personalization.

BEGIN;

ALTER TABLE athletes
  ADD COLUMN IF NOT EXISTS gym_access text NOT NULL DEFAULT 'full_gym';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'athletes_gym_access_check'
  ) THEN
    ALTER TABLE athletes
      ADD CONSTRAINT athletes_gym_access_check
      CHECK (gym_access IN ('full_gym', 'limited_equipment', 'no_gym'));
  END IF;
END $$;

COMMENT ON COLUMN athletes.gym_access
  IS 'Athlete equipment access preference used to personalize strength exercise selection.';

COMMIT;