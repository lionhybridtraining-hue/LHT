-- Cleanup script for test athlete account: rodrigolibanio1999@gmail.com
-- Removes ALL associated data to allow fresh testing of funnel flows

BEGIN;

-- Step 0: Find the athlete ID by email (read-only, for verification)
-- SELECT id, email, identity_id FROM athletes WHERE email = 'rodrigolibanio1999@gmail.com';

-- Step 1: Get athlete ID and capture it for cascading deletes
WITH target_athlete AS (
  SELECT id, email, identity_id FROM athletes 
  WHERE email = 'rodrigolibanio1999@gmail.com'
)

-- Step 2: Delete from leads_central (lead tracking)
DELETE FROM leads_central 
WHERE athlete_id IN (SELECT id FROM target_athlete)
   OR identity_id IN (SELECT identity_id FROM target_athlete WHERE identity_id IS NOT NULL);

-- Step 3: Delete from ai_logs (AI interaction logs)
DELETE FROM ai_logs
WHERE athlete_id IN (
  SELECT id FROM athletes WHERE email = 'rodrigolibanio1999@gmail.com'
);

-- Step 4: Delete from strength_log_sets (strength workout logs)
DELETE FROM strength_log_sets
WHERE athlete_id IN (
  SELECT id FROM athletes WHERE email = 'rodrigolibanio1999@gmail.com'
);

-- Step 5: Delete from athlete_weekly_plan (weekly training plans)
DELETE FROM athlete_weekly_plan
WHERE athlete_id IN (
  SELECT id FROM athletes WHERE email = 'rodrigolibanio1999@gmail.com'
);

-- Step 6: Delete from strength_plan_instances (active strength plan instances)
DELETE FROM strength_plan_instances
WHERE athlete_id IN (
  SELECT id FROM athletes WHERE email = 'rodrigolibanio1999@gmail.com'
);

-- Step 7: Delete from program_assignments (coach-assigned programs)
DELETE FROM program_assignments
WHERE athlete_id IN (
  SELECT id FROM athletes WHERE email = 'rodrigolibanio1999@gmail.com'
);

-- Step 8: Delete from stripe_purchases (Stripe transactions)
DELETE FROM stripe_purchases
WHERE identity_id IN (
  SELECT identity_id
  FROM athletes
  WHERE email = 'rodrigolibanio1999@gmail.com' AND identity_id IS NOT NULL
)
OR lower(coalesce(email, '')) = lower('rodrigolibanio1999@gmail.com');

-- Step 9: Delete from weekly_checkins (weekly feedback forms)
DELETE FROM weekly_checkins
WHERE athlete_id IN (
  SELECT id FROM athletes WHERE email = 'rodrigolibanio1999@gmail.com'
);

-- Step 10: Delete from training_sessions (uploaded workouts)
DELETE FROM training_sessions
WHERE athlete_id IN (
  SELECT id FROM athletes WHERE email = 'rodrigolibanio1999@gmail.com'
);

-- Step 11: Delete from athlete_training_zones (zone configurations)
DELETE FROM athlete_training_zones
WHERE profile_id IN (
  SELECT id FROM athlete_training_zone_profiles 
  WHERE athlete_id IN (
    SELECT id FROM athletes WHERE email = 'rodrigolibanio1999@gmail.com'
  )
);

-- Step 12: Delete from athlete_training_zone_profiles (training zone profiles)
DELETE FROM athlete_training_zone_profiles
WHERE athlete_id IN (
  SELECT id FROM athletes WHERE email = 'rodrigolibanio1999@gmail.com'
);

-- Step 13: Delete from athlete_strava_connections (Strava integration)
DELETE FROM athlete_strava_connections
WHERE athlete_id IN (
  SELECT id FROM athletes WHERE email = 'rodrigolibanio1999@gmail.com'
);

-- Step 14: Delete from athlete record (main table - this cascades via FK)
DELETE FROM athletes
WHERE email = 'rodrigolibanio1999@gmail.com';

-- Step 15: Verify cleanup
SELECT 
  'Cleanup completed for rodrigolibanio1999@gmail.com' as status,
  (SELECT COUNT(*) FROM athletes WHERE email = 'rodrigolibanio1999@gmail.com') as remaining_athletes,
  (SELECT COUNT(*) FROM training_sessions WHERE athlete_id IN (
    SELECT id FROM athletes WHERE email = 'rodrigolibanio1999@gmail.com'
  )) as remaining_sessions,
  (SELECT COUNT(*) FROM leads_central WHERE athlete_id IN (
    SELECT id FROM athletes WHERE email = 'rodrigolibanio1999@gmail.com'
  )) as remaining_leads;

COMMIT;
