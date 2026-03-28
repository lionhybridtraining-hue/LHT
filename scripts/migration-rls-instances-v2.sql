-- ============================================================
-- Migration: RLS v2 for strength_plan_instances
--
-- Adds athlete UPDATE policy with coach-lock enforcement.
-- Athletes can update status on their own instances only when:
--   coach_locked_until IS NULL  (ad-hoc / self-serve instance)
--   OR coach_locked_until < CURRENT_DATE  (coaching period has ended)
--
-- DELETE is implicitly denied for authenticated users (no permissive
-- DELETE policy for the authenticated role). service_role retains full
-- access via the existing "Service role full access" policy.
-- ============================================================

-- Drop old policy if it exists from a previous attempt
DROP POLICY IF EXISTS "Athletes update own unlocked plan instances"
  ON strength_plan_instances;

-- Athletes can update only their own instances that are not coach-locked
CREATE POLICY "Athletes update own unlocked plan instances"
  ON strength_plan_instances FOR UPDATE
  TO authenticated
  USING (
    athlete_id = (SELECT id FROM athletes WHERE identity_id = auth.uid()::text LIMIT 1)
    AND (coach_locked_until IS NULL OR coach_locked_until < CURRENT_DATE)
  )
  WITH CHECK (
    athlete_id = (SELECT id FROM athletes WHERE identity_id = auth.uid()::text LIMIT 1)
    AND (coach_locked_until IS NULL OR coach_locked_until < CURRENT_DATE)
  );

-- Confirm: no DELETE policy for authenticated role = implicit deny by RLS.
-- service_role bypass handles all legitimate backend deletes.
