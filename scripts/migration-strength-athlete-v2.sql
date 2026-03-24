-- Migration: Athlete Strength View v2
-- Adds: rep ranges, session tracking, exercise alternatives, quick mode, strength level

-- ═══════════════════════════════════════════════════════
-- 1. Rep Ranges in Prescriptions
-- ═══════════════════════════════════════════════════════
ALTER TABLE strength_prescriptions
  ADD COLUMN IF NOT EXISTS reps_min integer,
  ADD COLUMN IF NOT EXISTS reps_max integer;

-- ═══════════════════════════════════════════════════════
-- 2. Session Tracking
-- ═══════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS strength_log_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_id uuid NOT NULL REFERENCES athletes(id) ON DELETE CASCADE,
  instance_id uuid REFERENCES strength_plan_instances(id) ON DELETE SET NULL,
  plan_id uuid NOT NULL REFERENCES strength_plans(id) ON DELETE CASCADE,
  week_number integer NOT NULL,
  day_number integer NOT NULL,
  session_date date NOT NULL DEFAULT current_date,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  cancelled_at timestamptz,
  status text NOT NULL DEFAULT 'in_progress'
    CHECK (status IN ('in_progress', 'completed', 'cancelled')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_strength_log_sessions_athlete
  ON strength_log_sessions(athlete_id, status);

-- Link log sets to sessions
ALTER TABLE strength_log_sets
  ADD COLUMN IF NOT EXISTS session_id uuid REFERENCES strength_log_sessions(id) ON DELETE SET NULL;

-- ═══════════════════════════════════════════════════════
-- 3. Exercise Alternatives (catalog-level defaults)
-- ═══════════════════════════════════════════════════════
ALTER TABLE exercises
  ADD COLUMN IF NOT EXISTS progression_of uuid REFERENCES exercises(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS regression_of uuid REFERENCES exercises(id) ON DELETE SET NULL;

-- ═══════════════════════════════════════════════════════
-- 4. Exercise Alternatives (plan-level overrides)
-- ═══════════════════════════════════════════════════════
ALTER TABLE strength_plan_exercises
  ADD COLUMN IF NOT EXISTS alt_progression_exercise_id uuid REFERENCES exercises(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS alt_regression_exercise_id uuid REFERENCES exercises(id) ON DELETE SET NULL;

-- ═══════════════════════════════════════════════════════
-- 5. Quick Mode on Training Programs
-- ═══════════════════════════════════════════════════════
ALTER TABLE training_programs
  ADD COLUMN IF NOT EXISTS quick_mode boolean NOT NULL DEFAULT false;

-- ═══════════════════════════════════════════════════════
-- 6. Athlete Strength Level + Quick log detail
-- ═══════════════════════════════════════════════════════
ALTER TABLE athletes
  ADD COLUMN IF NOT EXISTS strength_level text
    CHECK (strength_level IN ('beginner', 'intermediate', 'advanced') OR strength_level IS NULL);

-- Extend strength_log_detail to include 'quick'
ALTER TABLE athletes
  DROP CONSTRAINT IF EXISTS athletes_strength_log_detail_check;
ALTER TABLE athletes
  ADD CONSTRAINT athletes_strength_log_detail_check
    CHECK (strength_log_detail IN ('exercise', 'set', 'quick'));

-- ═══════════════════════════════════════════════════════
-- 7. RLS Policies for strength_log_sessions
-- ═══════════════════════════════════════════════════════
ALTER TABLE strength_log_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "Service role full access on strength_log_sessions"
  ON strength_log_sessions FOR ALL
  USING (true) WITH CHECK (true);
