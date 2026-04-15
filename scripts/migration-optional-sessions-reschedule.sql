-- ============================================================
-- Migration: Optional Sessions + Athlete Reschedule Support
-- Date: 2026-04-15
-- ============================================================
--
-- Adds:
-- 1) athlete_weekly_plan.is_optional (materialized from program_weekly_sessions)
-- 2) source check values expanded with 'variant' and 'athlete_move'
--
-- Safe to re-run.

BEGIN;

ALTER TABLE athlete_weekly_plan
  ADD COLUMN IF NOT EXISTS is_optional boolean NOT NULL DEFAULT false;

-- Replace source check constraint with expanded allowed values.
ALTER TABLE athlete_weekly_plan
  DROP CONSTRAINT IF EXISTS athlete_weekly_plan_source_check;

ALTER TABLE athlete_weekly_plan
  ADD CONSTRAINT athlete_weekly_plan_source_check
  CHECK (source IN ('preset', 'coach_override', 'athlete_setup', 'variant', 'athlete_move'));

COMMIT;
