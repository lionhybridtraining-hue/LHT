-- ============================================================
-- Migration: Preset-Driven Calendar (v2)
-- Date: 2026-04-02
-- ============================================================
--
-- What changes:
--   1. Remove plan_data, plan_params, plan_generated_at, access_end_date
--      from program_assignments (running plan data moves to onboarding flow)
--   2. Add selected_preset_id to program_assignments
--   3. Add preset_selection to training_programs
--   4. Add strength_plan_id to program_weekly_sessions
--   5. Clean stale data (old weekly plans, old assignments)
--
-- What stays:
--   - strength_plan_instances table (instances are now created at preset
--     selection time instead of assignment time, but still needed)
--   - athlete_weekly_plan.strength_instance_id column (links calendar
--     rows to instances)
--
-- ============================================================

BEGIN;

-- ────────────────────────────────────────────────────────────
-- STEP 1: Remove legacy columns from program_assignments
-- ────────────────────────────────────────────────────────────

ALTER TABLE program_assignments
  DROP COLUMN IF EXISTS plan_data,
  DROP COLUMN IF EXISTS plan_params,
  DROP COLUMN IF EXISTS plan_generated_at,
  DROP COLUMN IF EXISTS access_end_date;

-- ────────────────────────────────────────────────────────────
-- STEP 2: Add selected_preset_id to program_assignments
-- ────────────────────────────────────────────────────────────

ALTER TABLE program_assignments
  ADD COLUMN IF NOT EXISTS selected_preset_id uuid
    REFERENCES program_schedule_presets(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_pa_selected_preset
  ON program_assignments (selected_preset_id)
  WHERE selected_preset_id IS NOT NULL;

-- ────────────────────────────────────────────────────────────
-- STEP 3: Add preset_selection to training_programs
-- ────────────────────────────────────────────────────────────
-- 'coach'   = coach picks preset during assignment
-- 'athlete' = athlete picks preset after assignment

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'training_programs' AND column_name = 'preset_selection'
  ) THEN
    ALTER TABLE training_programs
      ADD COLUMN preset_selection text NOT NULL DEFAULT 'coach';
    ALTER TABLE training_programs
      ADD CONSTRAINT chk_tp_preset_selection
      CHECK (preset_selection IN ('coach', 'athlete'));
  END IF;
END $$;

-- ────────────────────────────────────────────────────────────
-- STEP 4: Add strength_plan_id and strength_week_number to program_weekly_sessions
-- ────────────────────────────────────────────────────────────
-- Links a strength session directly to its template plan.

ALTER TABLE program_weekly_sessions
  ADD COLUMN IF NOT EXISTS strength_plan_id uuid
    REFERENCES strength_plans(id) ON DELETE SET NULL;

ALTER TABLE program_weekly_sessions
  ADD COLUMN IF NOT EXISTS strength_week_number integer;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_pws_strength_week_number'
  ) THEN
    ALTER TABLE program_weekly_sessions
      ADD CONSTRAINT chk_pws_strength_week_number
      CHECK (strength_week_number IS NULL OR strength_week_number >= 1);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_pws_strength_plan
  ON program_weekly_sessions (strength_plan_id)
  WHERE strength_plan_id IS NOT NULL;

-- ────────────────────────────────────────────────────────────
-- STEP 5: Clean stale data
-- ────────────────────────────────────────────────────────────
-- Wipe old weekly plans (they referenced plan_data which no longer exists).
-- Wipe old instances that were created pre-migration.
-- Wipe old assignments (fresh start).

DO $$
BEGIN
  IF to_regclass('public.athlete_weekly_plan') IS NOT NULL THEN
    EXECUTE 'TRUNCATE TABLE public.athlete_weekly_plan';
  END IF;

  IF to_regclass('public.strength_plan_instances') IS NOT NULL THEN
    EXECUTE 'TRUNCATE TABLE public.strength_plan_instances CASCADE';
  END IF;
END $$;

DELETE FROM program_assignments;

-- ────────────────────────────────────────────────────────────
-- STEP 6: Drop legacy columns from strength_plan_instances
-- ────────────────────────────────────────────────────────────
-- schedule_preset_id + preset_assigned_at were v1 linkage; now
-- the linkage goes through program_assignments.selected_preset_id.

ALTER TABLE IF EXISTS strength_plan_instances
  DROP COLUMN IF EXISTS schedule_preset_id,
  DROP COLUMN IF EXISTS preset_assigned_at;

-- ────────────────────────────────────────────────────────────
-- STEP 7: Comments
-- ────────────────────────────────────────────────────────────

COMMENT ON COLUMN training_programs.preset_selection
  IS 'Who chooses the preset: coach (at assignment) or athlete (after assignment)';
COMMENT ON COLUMN program_assignments.selected_preset_id
  IS 'The schedule preset chosen by coach or athlete. NULL until selected.';
COMMENT ON COLUMN program_weekly_sessions.strength_plan_id
  IS 'For strength sessions, direct FK to strength_plans template.';
COMMENT ON COLUMN program_weekly_sessions.strength_week_number
  IS 'Optional week selector for strength sessions within the linked strength plan.';

COMMIT;

-- ────────────────────────────────────────────────────────────
-- VERIFY (run manually after migration)
-- ────────────────────────────────────────────────────────────
-- SELECT column_name FROM information_schema.columns WHERE table_name = 'program_assignments' AND column_name = 'selected_preset_id';
-- SELECT column_name FROM information_schema.columns WHERE table_name = 'training_programs' AND column_name = 'preset_selection';
-- SELECT column_name FROM information_schema.columns WHERE table_name = 'program_weekly_sessions' AND column_name = 'strength_plan_id';
-- SELECT count(*) FROM strength_plan_instances;  -- should be 0
-- SELECT count(*) FROM athlete_weekly_plan;       -- should be 0
