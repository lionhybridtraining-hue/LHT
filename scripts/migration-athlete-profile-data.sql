-- ============================================================
-- Migration: Athlete Profile Data Completion
--
-- Adds personal profile fields required for athlete onboarding
-- completion in the athlete app.
-- ============================================================

ALTER TABLE athletes
  ADD COLUMN IF NOT EXISTS date_of_birth date,
  ADD COLUMN IF NOT EXISTS height_cm integer,
  ADD COLUMN IF NOT EXISTS weight_kg numeric(5,2),
  ADD COLUMN IF NOT EXISTS sex text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'athletes_sex_check'
      AND conrelid = 'athletes'::regclass
  ) THEN
    ALTER TABLE athletes
      ADD CONSTRAINT athletes_sex_check
      CHECK (sex IS NULL OR sex IN ('male', 'female', 'other'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS athletes_profile_completion_idx
ON athletes (identity_id)
WHERE date_of_birth IS NOT NULL
  AND height_cm IS NOT NULL
  AND weight_kg IS NOT NULL
  AND sex IS NOT NULL;
