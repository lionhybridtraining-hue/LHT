-- Migration: RLS hardening for sensitive tables
-- Defense in depth for direct Supabase access with anon/authenticated roles.

-- 1) athletes
ALTER TABLE athletes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access on athletes"
	ON athletes;
CREATE POLICY "Service role full access on athletes"
	ON athletes FOR ALL
	TO service_role
	USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Athletes read own athlete profile"
	ON athletes;
CREATE POLICY "Athletes read own athlete profile"
	ON athletes FOR SELECT
	TO authenticated
	USING (identity_id = auth.uid()::text);

-- 2) weekly_checkins
ALTER TABLE weekly_checkins ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access on weekly_checkins"
	ON weekly_checkins;
CREATE POLICY "Service role full access on weekly_checkins"
	ON weekly_checkins FOR ALL
	TO service_role
	USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Athletes read own weekly checkins"
	ON weekly_checkins;
CREATE POLICY "Athletes read own weekly checkins"
	ON weekly_checkins FOR SELECT
	TO authenticated
	USING (
		athlete_id = (
			SELECT id
			FROM athletes
			WHERE identity_id = auth.uid()::text
			LIMIT 1
		)
	);

-- 3) onboarding_form_responses
ALTER TABLE onboarding_form_responses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access on onboarding_form_responses"
	ON onboarding_form_responses;
CREATE POLICY "Service role full access on onboarding_form_responses"
	ON onboarding_form_responses FOR ALL
	TO service_role
	USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Athletes read own onboarding form responses"
	ON onboarding_form_responses;
CREATE POLICY "Athletes read own onboarding form responses"
	ON onboarding_form_responses FOR SELECT
	TO authenticated
	USING (identity_id = auth.uid()::text);

DROP POLICY IF EXISTS "Athletes update own onboarding form responses"
	ON onboarding_form_responses;
CREATE POLICY "Athletes update own onboarding form responses"
	ON onboarding_form_responses FOR UPDATE
	TO authenticated
	USING (identity_id = auth.uid()::text)
	WITH CHECK (identity_id = auth.uid()::text);

-- 4) athlete_strava_connections
DO $$
BEGIN
	IF to_regclass('public.athlete_strava_connections') IS NOT NULL THEN
		ALTER TABLE athlete_strava_connections ENABLE ROW LEVEL SECURITY;

		DROP POLICY IF EXISTS "Service role full access on athlete_strava_connections"
			ON athlete_strava_connections;
		CREATE POLICY "Service role full access on athlete_strava_connections"
			ON athlete_strava_connections FOR ALL
			TO service_role
			USING (true) WITH CHECK (true);

		DROP POLICY IF EXISTS "Athletes read own strava connection"
			ON athlete_strava_connections;
		CREATE POLICY "Athletes read own strava connection"
			ON athlete_strava_connections FOR SELECT
			TO authenticated
			USING (
				athlete_id = (
					SELECT id
					FROM athletes
					WHERE identity_id = auth.uid()::text
					LIMIT 1
				)
			);

		DROP POLICY IF EXISTS "Athletes update own strava connection"
			ON athlete_strava_connections;
		CREATE POLICY "Athletes update own strava connection"
			ON athlete_strava_connections FOR UPDATE
			TO authenticated
			USING (
				athlete_id = (
					SELECT id
					FROM athletes
					WHERE identity_id = auth.uid()::text
					LIMIT 1
				)
			)
			WITH CHECK (
				athlete_id = (
					SELECT id
					FROM athletes
					WHERE identity_id = auth.uid()::text
					LIMIT 1
				)
			);
	ELSE
		RAISE NOTICE 'Skipping RLS for athlete_strava_connections: table does not exist';
	END IF;
END
$$;

-- 6) stripe_purchases
ALTER TABLE stripe_purchases ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access on stripe_purchases"
	ON stripe_purchases;
CREATE POLICY "Service role full access on stripe_purchases"
	ON stripe_purchases FOR ALL
	TO service_role
	USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Athletes read own stripe purchases"
	ON stripe_purchases;
CREATE POLICY "Athletes read own stripe purchases"
	ON stripe_purchases FOR SELECT
	TO authenticated
	USING (identity_id = auth.uid()::text);

-- 7) leads_central
ALTER TABLE leads_central ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access on leads_central"
	ON leads_central;
CREATE POLICY "Service role full access on leads_central"
	ON leads_central FOR ALL
	TO service_role
	USING (true) WITH CHECK (true);

-- No authenticated policy: lead data is backoffice-only.

-- 8) training_sessions
ALTER TABLE training_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access on training_sessions"
	ON training_sessions;
CREATE POLICY "Service role full access on training_sessions"
	ON training_sessions FOR ALL
	TO service_role
	USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Athletes read own training sessions"
	ON training_sessions;
CREATE POLICY "Athletes read own training sessions"
	ON training_sessions FOR SELECT
	TO authenticated
	USING (
		athlete_id = (
			SELECT id
			FROM athletes
			WHERE identity_id = auth.uid()::text
			LIMIT 1
		)
	);

-- 9) training_load_daily
ALTER TABLE training_load_daily ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access on training_load_daily"
	ON training_load_daily;
CREATE POLICY "Service role full access on training_load_daily"
	ON training_load_daily FOR ALL
	TO service_role
	USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Athletes read own training load daily"
	ON training_load_daily;
CREATE POLICY "Athletes read own training load daily"
	ON training_load_daily FOR SELECT
	TO authenticated
	USING (
		athlete_id = (
			SELECT id
			FROM athletes
			WHERE identity_id = auth.uid()::text
			LIMIT 1
		)
	);

-- 10) training_load_metrics
ALTER TABLE training_load_metrics ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access on training_load_metrics"
	ON training_load_metrics;
CREATE POLICY "Service role full access on training_load_metrics"
	ON training_load_metrics FOR ALL
	TO service_role
	USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Athletes read own training load metrics"
	ON training_load_metrics;
CREATE POLICY "Athletes read own training load metrics"
	ON training_load_metrics FOR SELECT
	TO authenticated
	USING (
		athlete_id = (
			SELECT id
			FROM athletes
			WHERE identity_id = auth.uid()::text
			LIMIT 1
		)
	);
