-- Migration: RLS Policies for Strength Training Tables
-- Phase 1.1 — Isolate athlete data at the database level
--
-- NOTE: Backend uses service_role key, so these policies primarily protect
-- against direct Supabase client access (anon/authenticated roles).
-- service_role bypasses RLS by default.

-- ═══════════════════════════════════════════════════════
-- 1. strength_log_sets — Athletes can only see/write their own logs
-- ═══════════════════════════════════════════════════════
ALTER TABLE strength_log_sets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access on strength_log_sets"
  ON strength_log_sets;
CREATE POLICY "Service role full access on strength_log_sets"
  ON strength_log_sets FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Athletes read own log sets"
  ON strength_log_sets;
CREATE POLICY "Athletes read own log sets"
  ON strength_log_sets FOR SELECT
  TO authenticated
  USING (athlete_id = (SELECT id FROM athletes WHERE identity_id = auth.uid()::text LIMIT 1));

DROP POLICY IF EXISTS "Athletes insert own log sets"
  ON strength_log_sets;
CREATE POLICY "Athletes insert own log sets"
  ON strength_log_sets FOR INSERT
  TO authenticated
  WITH CHECK (athlete_id = (SELECT id FROM athletes WHERE identity_id = auth.uid()::text LIMIT 1));

-- ═══════════════════════════════════════════════════════
-- 2. strength_log_sessions — Athletes can only see/write their own sessions
-- ═══════════════════════════════════════════════════════
-- RLS already enabled by migration-strength-athlete-v2.sql
-- Service role policy already exists, add athlete policies

DROP POLICY IF EXISTS "Athletes read own sessions"
  ON strength_log_sessions;
CREATE POLICY "Athletes read own sessions"
  ON strength_log_sessions FOR SELECT
  TO authenticated
  USING (athlete_id = (SELECT id FROM athletes WHERE identity_id = auth.uid()::text LIMIT 1));

DROP POLICY IF EXISTS "Athletes insert own sessions"
  ON strength_log_sessions;
CREATE POLICY "Athletes insert own sessions"
  ON strength_log_sessions FOR INSERT
  TO authenticated
  WITH CHECK (athlete_id = (SELECT id FROM athletes WHERE identity_id = auth.uid()::text LIMIT 1));

DROP POLICY IF EXISTS "Athletes update own sessions"
  ON strength_log_sessions;
CREATE POLICY "Athletes update own sessions"
  ON strength_log_sessions FOR UPDATE
  TO authenticated
  USING (athlete_id = (SELECT id FROM athletes WHERE identity_id = auth.uid()::text LIMIT 1));

-- ═══════════════════════════════════════════════════════
-- 3. athlete_exercise_1rm — Athletes can only see/write their own 1RM data
-- ═══════════════════════════════════════════════════════
ALTER TABLE athlete_exercise_1rm ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access on athlete_exercise_1rm"
  ON athlete_exercise_1rm;
CREATE POLICY "Service role full access on athlete_exercise_1rm"
  ON athlete_exercise_1rm FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Athletes read own 1rm"
  ON athlete_exercise_1rm;
CREATE POLICY "Athletes read own 1rm"
  ON athlete_exercise_1rm FOR SELECT
  TO authenticated
  USING (athlete_id = (SELECT id FROM athletes WHERE identity_id = auth.uid()::text LIMIT 1));

DROP POLICY IF EXISTS "Athletes insert own 1rm"
  ON athlete_exercise_1rm;
CREATE POLICY "Athletes insert own 1rm"
  ON athlete_exercise_1rm FOR INSERT
  TO authenticated
  WITH CHECK (athlete_id = (SELECT id FROM athletes WHERE identity_id = auth.uid()::text LIMIT 1));

-- ═══════════════════════════════════════════════════════
-- 4. strength_plan_instances — Athletes see only their own assignments
-- ═══════════════════════════════════════════════════════
ALTER TABLE strength_plan_instances ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access on strength_plan_instances"
  ON strength_plan_instances;
CREATE POLICY "Service role full access on strength_plan_instances"
  ON strength_plan_instances FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Athletes read own plan instances"
  ON strength_plan_instances;
CREATE POLICY "Athletes read own plan instances"
  ON strength_plan_instances FOR SELECT
  TO authenticated
  USING (athlete_id = (SELECT id FROM athletes WHERE identity_id = auth.uid()::text LIMIT 1));

-- ═══════════════════════════════════════════════════════
-- 5. strength_plans — Read-only for authenticated users (templates are shared)
-- ═══════════════════════════════════════════════════════
ALTER TABLE strength_plans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access on strength_plans"
  ON strength_plans;
CREATE POLICY "Service role full access on strength_plans"
  ON strength_plans FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated read plans via active instance"
  ON strength_plans;
CREATE POLICY "Authenticated read plans via active instance"
  ON strength_plans FOR SELECT
  TO authenticated
  USING (
    id IN (
      SELECT plan_id FROM strength_plan_instances
      WHERE athlete_id = (SELECT id FROM athletes WHERE identity_id = auth.uid()::text LIMIT 1)
    )
  );

-- ═══════════════════════════════════════════════════════
-- 6. strength_plan_exercises — Read via authorized plan
-- ═══════════════════════════════════════════════════════
ALTER TABLE strength_plan_exercises ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access on strength_plan_exercises"
  ON strength_plan_exercises;
CREATE POLICY "Service role full access on strength_plan_exercises"
  ON strength_plan_exercises FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated read exercises via plan instance"
  ON strength_plan_exercises;
CREATE POLICY "Authenticated read exercises via plan instance"
  ON strength_plan_exercises FOR SELECT
  TO authenticated
  USING (
    plan_id IN (
      SELECT plan_id FROM strength_plan_instances
      WHERE athlete_id = (SELECT id FROM athletes WHERE identity_id = auth.uid()::text LIMIT 1)
    )
  );

-- ═══════════════════════════════════════════════════════
-- 7. strength_prescriptions — Read via authorized plan exercise
-- ═══════════════════════════════════════════════════════
ALTER TABLE strength_prescriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access on strength_prescriptions"
  ON strength_prescriptions;
CREATE POLICY "Service role full access on strength_prescriptions"
  ON strength_prescriptions FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated read prescriptions via plan instance"
  ON strength_prescriptions;
CREATE POLICY "Authenticated read prescriptions via plan instance"
  ON strength_prescriptions FOR SELECT
  TO authenticated
  USING (
    plan_exercise_id IN (
      SELECT spe.id FROM strength_plan_exercises spe
      JOIN strength_plan_instances spi ON spi.plan_id = spe.plan_id
      WHERE spi.athlete_id = (SELECT id FROM athletes WHERE identity_id = auth.uid()::text LIMIT 1)
    )
  );

-- ═══════════════════════════════════════════════════════
-- 8. strength_plan_phase_notes — Read via authorized plan
-- ═══════════════════════════════════════════════════════
ALTER TABLE strength_plan_phase_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access on strength_plan_phase_notes"
  ON strength_plan_phase_notes;
CREATE POLICY "Service role full access on strength_plan_phase_notes"
  ON strength_plan_phase_notes FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated read phase notes via plan instance"
  ON strength_plan_phase_notes;
CREATE POLICY "Authenticated read phase notes via plan instance"
  ON strength_plan_phase_notes FOR SELECT
  TO authenticated
  USING (
    plan_id IN (
      SELECT plan_id FROM strength_plan_instances
      WHERE athlete_id = (SELECT id FROM athletes WHERE identity_id = auth.uid()::text LIMIT 1)
    )
  );

-- ═══════════════════════════════════════════════════════
-- 9. exercises — Global catalog, read-only for all authenticated users
-- ═══════════════════════════════════════════════════════
ALTER TABLE exercises ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access on exercises"
  ON exercises;
CREATE POLICY "Service role full access on exercises"
  ON exercises FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated read exercises catalog"
  ON exercises;
CREATE POLICY "Authenticated read exercises catalog"
  ON exercises FOR SELECT
  TO authenticated
  USING (true);
