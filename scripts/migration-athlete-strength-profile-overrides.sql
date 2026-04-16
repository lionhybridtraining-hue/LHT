-- Migration: coach overrides for athlete strength personalization.

BEGIN;

ALTER TABLE athletes
  ADD COLUMN IF NOT EXISTS coach_strength_level_override text;

ALTER TABLE athletes
  ADD COLUMN IF NOT EXISTS coach_gym_access_override text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'athletes_coach_strength_level_override_check'
  ) THEN
    ALTER TABLE athletes
      ADD CONSTRAINT athletes_coach_strength_level_override_check
      CHECK (
        coach_strength_level_override IN ('beginner', 'intermediate', 'advanced')
        OR coach_strength_level_override IS NULL
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'athletes_coach_gym_access_override_check'
  ) THEN
    ALTER TABLE athletes
      ADD CONSTRAINT athletes_coach_gym_access_override_check
      CHECK (
        coach_gym_access_override IN ('full_gym', 'limited_equipment', 'no_gym')
        OR coach_gym_access_override IS NULL
      );
  END IF;
END $$;

COMMENT ON COLUMN athletes.coach_strength_level_override
  IS 'Optional coach override for athlete strength_level used in strength exercise personalization.';

COMMENT ON COLUMN athletes.coach_gym_access_override
  IS 'Optional coach override for athlete gym_access used in strength exercise personalization.';

COMMIT;