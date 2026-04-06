-- Cleanup script for test athlete account: rodrigolibanio1999@gmail.com
-- Supabase SQL Editor compatible (no psql metacommands).

BEGIN;

DO $$
DECLARE
  target_email text := 'rodrigolibanio1999@gmail.com';
  deleted_count bigint := 0;
BEGIN
  RAISE INFO 'Starting cleanup for email: %', target_email;

  -- 1) leads_central (by athlete_id or identity_id)
  DELETE FROM leads_central
  WHERE athlete_id IN (
    SELECT id FROM athletes WHERE email = target_email
  )
  OR identity_id IN (
    SELECT DISTINCT identity_id
    FROM athletes
    WHERE email = target_email AND identity_id IS NOT NULL
  );
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RAISE INFO 'Deleted % rows from leads_central', deleted_count;

  -- 2) ai_logs
  DELETE FROM ai_logs
  WHERE athlete_id IN (
    SELECT id FROM athletes WHERE email = target_email
  );
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RAISE INFO 'Deleted % rows from ai_logs', deleted_count;

  -- 3) strength_log_sets
  DELETE FROM strength_log_sets
  WHERE athlete_id IN (
    SELECT id FROM athletes WHERE email = target_email
  );
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RAISE INFO 'Deleted % rows from strength_log_sets', deleted_count;

  -- 4) athlete_weekly_plan
  DELETE FROM athlete_weekly_plan
  WHERE athlete_id IN (
    SELECT id FROM athletes WHERE email = target_email
  );
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RAISE INFO 'Deleted % rows from athlete_weekly_plan', deleted_count;

  -- 5) strength_plan_instances
  DELETE FROM strength_plan_instances
  WHERE athlete_id IN (
    SELECT id FROM athletes WHERE email = target_email
  );
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RAISE INFO 'Deleted % rows from strength_plan_instances', deleted_count;

  -- 6) program_assignments
  DELETE FROM program_assignments
  WHERE athlete_id IN (
    SELECT id FROM athletes WHERE email = target_email
  );
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RAISE INFO 'Deleted % rows from program_assignments', deleted_count;

  -- 7) stripe_purchases
  -- stripe_purchases has identity_id/email (no athlete_id in this schema)
  DELETE FROM stripe_purchases
  WHERE identity_id IN (
    SELECT DISTINCT identity_id
    FROM athletes
    WHERE email = target_email AND identity_id IS NOT NULL
  )
  OR lower(coalesce(email, '')) = lower(target_email);
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RAISE INFO 'Deleted % rows from stripe_purchases', deleted_count;

  -- 8) weekly_checkins
  DELETE FROM weekly_checkins
  WHERE athlete_id IN (
    SELECT id FROM athletes WHERE email = target_email
  );
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RAISE INFO 'Deleted % rows from weekly_checkins', deleted_count;

  -- 9) training_sessions
  DELETE FROM training_sessions
  WHERE athlete_id IN (
    SELECT id FROM athletes WHERE email = target_email
  );
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RAISE INFO 'Deleted % rows from training_sessions', deleted_count;

  -- 10) athlete_training_zones
  DELETE FROM athlete_training_zones
  WHERE profile_id IN (
    SELECT id
    FROM athlete_training_zone_profiles
    WHERE athlete_id IN (
      SELECT id FROM athletes WHERE email = target_email
    )
  );
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RAISE INFO 'Deleted % rows from athlete_training_zones', deleted_count;

  -- 11) athlete_training_zone_profiles
  DELETE FROM athlete_training_zone_profiles
  WHERE athlete_id IN (
    SELECT id FROM athletes WHERE email = target_email
  );
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RAISE INFO 'Deleted % rows from athlete_training_zone_profiles', deleted_count;

  -- 12) athlete_strava_connections (legacy fallback: strava_connections)
  IF to_regclass('public.athlete_strava_connections') IS NOT NULL THEN
    DELETE FROM athlete_strava_connections
    WHERE athlete_id IN (
      SELECT id FROM athletes WHERE email = target_email
    );
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RAISE INFO 'Deleted % rows from athlete_strava_connections', deleted_count;
  ELSIF to_regclass('public.strava_connections') IS NOT NULL THEN
    DELETE FROM strava_connections
    WHERE athlete_id IN (
      SELECT id FROM athletes WHERE email = target_email
    );
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RAISE INFO 'Deleted % rows from legacy strava_connections', deleted_count;
  ELSE
    RAISE INFO 'Skipped strava connection cleanup (no known table found)';
  END IF;

  -- 13) onboarding_intake (only if table exists)
  IF to_regclass('public.onboarding_intake') IS NOT NULL THEN
    DELETE FROM onboarding_intake
    WHERE athlete_id IN (
      SELECT id FROM athletes WHERE email = target_email
    );
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RAISE INFO 'Deleted % rows from onboarding_intake', deleted_count;
  ELSE
    RAISE INFO 'Skipped onboarding_intake (table does not exist)';
  END IF;

  -- 14) athlete row
  DELETE FROM athletes
  WHERE email = target_email;
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RAISE INFO 'Deleted % rows from athletes', deleted_count;

  RAISE INFO 'Cleanup completed successfully for %', target_email;
END $$;

WITH counts AS (
  SELECT
    (SELECT COUNT(*) FROM athletes WHERE email = 'rodrigolibanio1999@gmail.com') AS remaining_athletes,
    (SELECT COUNT(*) FROM leads_central WHERE email = 'rodrigolibanio1999@gmail.com') AS remaining_leads,
    CASE
      WHEN to_regclass('public.onboarding_intake') IS NULL THEN NULL::bigint
      ELSE (SELECT COUNT(*) FROM onboarding_intake WHERE email = 'rodrigolibanio1999@gmail.com')
    END AS remaining_onboarding
)
SELECT
  'CLEANUP_COMPLETE' AS phase,
  remaining_athletes,
  remaining_leads,
  remaining_onboarding
FROM counts;

COMMIT;
