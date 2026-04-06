-- ============================================================
-- Migration: unify onboarding storage into athletes
--
-- Goal:
-- - stop using onboarding_intake table
-- - persist onboarding answers + structured fields on athletes
-- ============================================================

ALTER TABLE athletes
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS goal_distance numeric(6,2),
  ADD COLUMN IF NOT EXISTS weekly_frequency integer,
  ADD COLUMN IF NOT EXISTS experience_level text,
  ADD COLUMN IF NOT EXISTS consistency_level text,
  ADD COLUMN IF NOT EXISTS funnel_stage text,
  ADD COLUMN IF NOT EXISTS plan_generated_at timestamptz,
  ADD COLUMN IF NOT EXISTS plan_storage text,
  ADD COLUMN IF NOT EXISTS onboarding_answers jsonb,
  ADD COLUMN IF NOT EXISTS onboarding_submitted_at timestamptz,
  ADD COLUMN IF NOT EXISTS onboarding_updated_at timestamptz;

UPDATE athletes
SET
  onboarding_answers = coalesce(onboarding_answers, '{}'::jsonb)
WHERE onboarding_answers IS NULL;

ALTER TABLE athletes
  ALTER COLUMN onboarding_answers SET DEFAULT '{}'::jsonb;

UPDATE athletes
SET
  funnel_stage = coalesce(funnel_stage, 'landing')
WHERE funnel_stage IS NULL;

ALTER TABLE athletes
  ALTER COLUMN funnel_stage SET DEFAULT 'landing';

DO $$
BEGIN
  IF to_regclass('public.onboarding_intake') IS NOT NULL THEN
    WITH latest_intake AS (
      SELECT *
      FROM (
        SELECT
          oi.*,
          row_number() OVER (
            PARTITION BY oi.identity_id
            ORDER BY oi.updated_at DESC NULLS LAST, oi.submitted_at DESC NULLS LAST
          ) AS rn
        FROM onboarding_intake oi
        WHERE oi.identity_id IS NOT NULL
      ) ranked
      WHERE ranked.rn = 1
    )
    UPDATE athletes a
    SET
      name = coalesce(a.name, li.full_name),
      phone = coalesce(a.phone, li.phone),
      goal_distance = coalesce(a.goal_distance, li.goal_distance),
      weekly_frequency = coalesce(a.weekly_frequency, li.weekly_frequency),
      experience_level = coalesce(a.experience_level, li.experience_level),
      consistency_level = coalesce(a.consistency_level, li.consistency_level),
      funnel_stage = coalesce(a.funnel_stage, li.funnel_stage, 'landing'),
      plan_generated_at = coalesce(a.plan_generated_at, li.plan_generated_at),
      plan_storage = coalesce(a.plan_storage, li.plan_storage),
      onboarding_answers = coalesce(a.onboarding_answers, '{}'::jsonb) || coalesce(li.answers, '{}'::jsonb),
      onboarding_submitted_at = coalesce(a.onboarding_submitted_at, li.submitted_at),
      onboarding_updated_at = coalesce(a.onboarding_updated_at, li.updated_at)
    FROM latest_intake li
    WHERE a.identity_id = li.identity_id;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS athletes_onboarding_updated_idx
ON athletes (onboarding_updated_at DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS athletes_funnel_stage_idx
ON athletes (funnel_stage, onboarding_updated_at DESC NULLS LAST);

DROP TABLE IF EXISTS onboarding_intake CASCADE;
