-- Migration: RLS hardening for tables missing row-level security
-- Completes coverage gap identified in April 2026 security audit.
-- All tables follow the pattern: service_role full access, authenticated
-- users can only read their own data (via identity_id or athlete_id FK).

-- ═══════════════════════════════════════════════════════
-- 1. login_events — athletes can read only their own login history
-- ═══════════════════════════════════════════════════════
ALTER TABLE login_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access on login_events" ON login_events;
CREATE POLICY "Service role full access on login_events"
  ON login_events FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Athletes read own login events" ON login_events;
CREATE POLICY "Athletes read own login events"
  ON login_events FOR SELECT
  TO authenticated
  USING (identity_id = auth.uid()::text);

-- ═══════════════════════════════════════════════════════
-- 2. payment_plans — athletes can read only their own payment plans
-- ═══════════════════════════════════════════════════════
DO $$
BEGIN
  IF to_regclass('public.payment_plans') IS NOT NULL THEN
    ALTER TABLE payment_plans ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS "Service role full access on payment_plans" ON payment_plans;
    EXECUTE $pol$
      CREATE POLICY "Service role full access on payment_plans"
        ON payment_plans FOR ALL
        TO service_role
        USING (true) WITH CHECK (true)
    $pol$;

    DROP POLICY IF EXISTS "Athletes read own payment plans" ON payment_plans;
    EXECUTE $pol$
      CREATE POLICY "Athletes read own payment plans"
        ON payment_plans FOR SELECT
        TO authenticated
        USING (identity_id = auth.uid()::text)
    $pol$;
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════
-- 3. payment_charges — athletes can read charges linked to their plans
-- ═══════════════════════════════════════════════════════
DO $$
BEGIN
  IF to_regclass('public.payment_charges') IS NOT NULL THEN
    ALTER TABLE payment_charges ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS "Service role full access on payment_charges" ON payment_charges;
    EXECUTE $pol$
      CREATE POLICY "Service role full access on payment_charges"
        ON payment_charges FOR ALL
        TO service_role
        USING (true) WITH CHECK (true)
    $pol$;

    DROP POLICY IF EXISTS "Athletes read own payment charges" ON payment_charges;
    EXECUTE $pol$
      CREATE POLICY "Athletes read own payment charges"
        ON payment_charges FOR SELECT
        TO authenticated
        USING (
          payment_plan_id IN (
            SELECT id FROM payment_plans WHERE identity_id = auth.uid()::text
          )
        )
    $pol$;
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════
-- 4. athlete_training_zone_profiles — athletes read own profiles
-- ═══════════════════════════════════════════════════════
DO $$
BEGIN
  IF to_regclass('public.athlete_training_zone_profiles') IS NOT NULL THEN
    ALTER TABLE athlete_training_zone_profiles ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS "Service role full access on athlete_training_zone_profiles"
      ON athlete_training_zone_profiles;
    EXECUTE $pol$
      CREATE POLICY "Service role full access on athlete_training_zone_profiles"
        ON athlete_training_zone_profiles FOR ALL
        TO service_role
        USING (true) WITH CHECK (true)
    $pol$;

    DROP POLICY IF EXISTS "Athletes read own zone profiles" ON athlete_training_zone_profiles;
    EXECUTE $pol$
      CREATE POLICY "Athletes read own zone profiles"
        ON athlete_training_zone_profiles FOR SELECT
        TO authenticated
        USING (
          athlete_id = (SELECT id FROM athletes WHERE identity_id = auth.uid()::text LIMIT 1)
        )
    $pol$;
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════
-- 5. athlete_training_zones — athletes read own zones (via profile FK)
-- ═══════════════════════════════════════════════════════
DO $$
BEGIN
  IF to_regclass('public.athlete_training_zones') IS NOT NULL THEN
    ALTER TABLE athlete_training_zones ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS "Service role full access on athlete_training_zones"
      ON athlete_training_zones;
    EXECUTE $pol$
      CREATE POLICY "Service role full access on athlete_training_zones"
        ON athlete_training_zones FOR ALL
        TO service_role
        USING (true) WITH CHECK (true)
    $pol$;

    DROP POLICY IF EXISTS "Athletes read own zones" ON athlete_training_zones;
    EXECUTE $pol$
      CREATE POLICY "Athletes read own zones"
        ON athlete_training_zones FOR SELECT
        TO authenticated
        USING (
          profile_id IN (
            SELECT p.id FROM athlete_training_zone_profiles p
            WHERE p.athlete_id = (
              SELECT id FROM athletes WHERE identity_id = auth.uid()::text LIMIT 1
            )
          )
        )
    $pol$;
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════
-- 6. onboarding_intake — athletes read/update only their own intake
-- ═══════════════════════════════════════════════════════
DO $$
BEGIN
  IF to_regclass('public.onboarding_intake') IS NOT NULL THEN
    ALTER TABLE onboarding_intake ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS "Service role full access on onboarding_intake" ON onboarding_intake;
    EXECUTE $pol$
      CREATE POLICY "Service role full access on onboarding_intake"
        ON onboarding_intake FOR ALL
        TO service_role
        USING (true) WITH CHECK (true)
    $pol$;

    DROP POLICY IF EXISTS "Athletes read own intake" ON onboarding_intake;
    EXECUTE $pol$
      CREATE POLICY "Athletes read own intake"
        ON onboarding_intake FOR SELECT
        TO authenticated
        USING (identity_id = auth.uid()::text)
    $pol$;

    DROP POLICY IF EXISTS "Athletes update own intake" ON onboarding_intake;
    EXECUTE $pol$
      CREATE POLICY "Athletes update own intake"
        ON onboarding_intake FOR UPDATE
        TO authenticated
        USING (identity_id = auth.uid()::text)
        WITH CHECK (identity_id = auth.uid()::text)
    $pol$;
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════
-- 7. strava_sync_events — athletes read only their own sync events
-- ═══════════════════════════════════════════════════════
DO $$
BEGIN
  IF to_regclass('public.strava_sync_events') IS NOT NULL THEN
    ALTER TABLE strava_sync_events ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS "Service role full access on strava_sync_events"
      ON strava_sync_events;
    EXECUTE $pol$
      CREATE POLICY "Service role full access on strava_sync_events"
        ON strava_sync_events FOR ALL
        TO service_role
        USING (true) WITH CHECK (true)
    $pol$;

    DROP POLICY IF EXISTS "Athletes read own sync events" ON strava_sync_events;
    EXECUTE $pol$
      CREATE POLICY "Athletes read own sync events"
        ON strava_sync_events FOR SELECT
        TO authenticated
        USING (
          athlete_id = (SELECT id FROM athletes WHERE identity_id = auth.uid()::text LIMIT 1)
        )
    $pol$;
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════
-- 8. leads_central_events — service_role only (no athlete access)
-- ═══════════════════════════════════════════════════════
DO $$
BEGIN
  IF to_regclass('public.leads_central_events') IS NOT NULL THEN
    ALTER TABLE leads_central_events ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS "Service role full access on leads_central_events"
      ON leads_central_events;
    EXECUTE $pol$
      CREATE POLICY "Service role full access on leads_central_events"
        ON leads_central_events FOR ALL
        TO service_role
        USING (true) WITH CHECK (true)
    $pol$;
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════
-- 9. strength_plan_day_labels — read-only for authenticated (plan metadata)
-- ═══════════════════════════════════════════════════════
DO $$
BEGIN
  IF to_regclass('public.strength_plan_day_labels') IS NOT NULL THEN
    ALTER TABLE strength_plan_day_labels ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS "Service role full access on strength_plan_day_labels"
      ON strength_plan_day_labels;
    EXECUTE $pol$
      CREATE POLICY "Service role full access on strength_plan_day_labels"
        ON strength_plan_day_labels FOR ALL
        TO service_role
        USING (true) WITH CHECK (true)
    $pol$;

    DROP POLICY IF EXISTS "Authenticated read plan day labels" ON strength_plan_day_labels;
    EXECUTE $pol$
      CREATE POLICY "Authenticated read plan day labels"
        ON strength_plan_day_labels FOR SELECT
        TO authenticated
        USING (true)
    $pol$;
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════
-- 10. strength_warmup_presets — read-only for authenticated (coach content)
-- ═══════════════════════════════════════════════════════
DO $$
BEGIN
  IF to_regclass('public.strength_warmup_presets') IS NOT NULL THEN
    ALTER TABLE strength_warmup_presets ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS "Service role full access on strength_warmup_presets"
      ON strength_warmup_presets;
    EXECUTE $pol$
      CREATE POLICY "Service role full access on strength_warmup_presets"
        ON strength_warmup_presets FOR ALL
        TO service_role
        USING (true) WITH CHECK (true)
    $pol$;

    DROP POLICY IF EXISTS "Authenticated read warmup presets" ON strength_warmup_presets;
    EXECUTE $pol$
      CREATE POLICY "Authenticated read warmup presets"
        ON strength_warmup_presets FOR SELECT
        TO authenticated
        USING (true)
    $pol$;
  END IF;
END $$;
