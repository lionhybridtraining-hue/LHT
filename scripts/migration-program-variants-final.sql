-- ============================================================
-- Migration: Multi-Variant Training Program Architecture
-- FINAL CONSOLIDATED — replaces migration-program-variants-table.sql
-- Date: 2026-04-15
-- ============================================================
--
-- EXECUTE THIS in Supabase Studio SQL Editor (single transaction).
-- Safe to re-run: uses IF NOT EXISTS / IF EXISTS everywhere.
--
-- Changes:
--   1. Creates program_variants table (variant metadata + plan bindings)
--   2. Adds selected_variant_id to program_assignments
--   3. Adds default_variant_id to training_programs
--   4. Adds generated_from_variant_id to athlete_weekly_plan
--   5. Indexes for all new FK columns
--   6. RLS policies for program_variants
--   7. Helper functions for variant discovery
--   8. Audit trigger (updated_at)
--
-- Dependencies (must already exist):
--   - training_programs(id uuid PK)
--   - strength_plans(id uuid PK)
--   - running_plan_templates(id uuid PK)
--   - coaches(id uuid PK)
--   - program_assignments(id uuid PK, selected_preset_id uuid)
--   - athlete_weekly_plan(id uuid PK, generated_from_preset_id uuid)
--   - set_updated_at() trigger function
--
-- ============================================================

BEGIN;

-- ────────────────────────────────────────────────────────────
-- STEP 1: Create program_variants table
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS program_variants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Parent program
  training_program_id uuid NOT NULL
    REFERENCES training_programs(id) ON DELETE CASCADE,

  -- Variant metadata (cartesian axes)
  duration_weeks integer NOT NULL CHECK (duration_weeks > 0),
  experience_level text NOT NULL
    CHECK (experience_level IN ('beginner', 'intermediate', 'advanced')),
  weekly_frequency integer NOT NULL
    CHECK (weekly_frequency >= 1 AND weekly_frequency <= 7),

  -- Plan bindings (NULLABLE — program may be strength-only or running-only)
  strength_plan_id uuid
    REFERENCES strength_plans(id) ON DELETE RESTRICT,
  running_plan_template_id uuid
    REFERENCES running_plan_templates(id) ON DELETE RESTRICT,

  -- Running config per variant (scales parametric template)
  -- Example: {"initial_weekly_volume_km":30,"weekly_progression_pct":4,"periodization_type":"linear"}
  running_config_preset jsonb DEFAULT '{}'::jsonb,

  -- At least one plan binding must exist
  CONSTRAINT program_variants_has_plan
    CHECK (strength_plan_id IS NOT NULL OR running_plan_template_id IS NOT NULL),

  -- Admin metadata
  created_by uuid REFERENCES coaches(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  -- Prevent duplicate variants per program
  UNIQUE (training_program_id, duration_weeks, experience_level, weekly_frequency)
);

COMMENT ON TABLE program_variants IS
'Multi-variant training program architecture. Each variant = one (duration × level × frequency) combination
with explicit plan bindings. Coach generates variants via template; athlete picks during onboarding.';

COMMENT ON COLUMN program_variants.running_config_preset IS
'JSONB config applied to running_plan_template during instance creation.
Keys: initial_weekly_volume_km, weekly_progression_pct, periodization_type.
Allows parametric scaling per variant (e.g. 4W variant lower volume than 8W).';

-- ────────────────────────────────────────────────────────────
-- STEP 2: Indexes on program_variants
-- ────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_program_variants_program
  ON program_variants (training_program_id);

CREATE INDEX IF NOT EXISTS idx_program_variants_strength_plan
  ON program_variants (strength_plan_id)
  WHERE strength_plan_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_program_variants_running_template
  ON program_variants (running_plan_template_id)
  WHERE running_plan_template_id IS NOT NULL;

-- Composite index for variant discovery (athlete picker filters)
CREATE INDEX IF NOT EXISTS idx_program_variants_metadata
  ON program_variants (training_program_id, experience_level, weekly_frequency, duration_weeks);

-- ────────────────────────────────────────────────────────────
-- STEP 3: Audit trigger (updated_at)
-- ────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'set_program_variants_updated_at'
  ) THEN
    CREATE TRIGGER set_program_variants_updated_at
    BEFORE UPDATE ON program_variants
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();
  END IF;
END $$;

-- ────────────────────────────────────────────────────────────
-- STEP 4: Add selected_variant_id to program_assignments
-- ────────────────────────────────────────────────────────────

ALTER TABLE program_assignments
  ADD COLUMN IF NOT EXISTS selected_variant_id uuid
    REFERENCES program_variants(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_program_assignments_selected_variant
  ON program_assignments (selected_variant_id)
  WHERE selected_variant_id IS NOT NULL;

-- ────────────────────────────────────────────────────────────
-- STEP 5: Add default_variant_id to training_programs
-- ────────────────────────────────────────────────────────────

ALTER TABLE training_programs
  ADD COLUMN IF NOT EXISTS default_variant_id uuid
    REFERENCES program_variants(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_training_programs_default_variant
  ON training_programs (default_variant_id)
  WHERE default_variant_id IS NOT NULL;

-- ────────────────────────────────────────────────────────────
-- STEP 6: Add generated_from_variant_id to athlete_weekly_plan
-- ────────────────────────────────────────────────────────────

ALTER TABLE athlete_weekly_plan
  ADD COLUMN IF NOT EXISTS generated_from_variant_id uuid
    REFERENCES program_variants(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_athlete_weekly_plan_variant
  ON athlete_weekly_plan (generated_from_variant_id)
  WHERE generated_from_variant_id IS NOT NULL;

-- ────────────────────────────────────────────────────────────
-- STEP 7: Row Level Security
-- ────────────────────────────────────────────────────────────

ALTER TABLE program_variants ENABLE ROW LEVEL SECURITY;

-- Service role bypasses RLS (Netlify functions use service role key)
-- No explicit policy needed — service_role has full access by default.

-- Authenticated users can READ any variant (needed for athlete variant picker)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'program_variants' AND policyname = 'program_variants_select_authenticated'
  ) THEN
    CREATE POLICY program_variants_select_authenticated
      ON program_variants
      FOR SELECT
      TO authenticated
      USING (true);
  END IF;
END $$;

-- Only coaches/admins can INSERT/UPDATE/DELETE
-- (enforced at application layer via requireRole("admin") on POST/PATCH/DELETE)
-- Supabase service_role key used by Netlify functions bypasses RLS entirely,
-- so these policies only matter for direct Supabase client access.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'program_variants' AND policyname = 'program_variants_insert_service'
  ) THEN
    CREATE POLICY program_variants_insert_service
      ON program_variants
      FOR INSERT
      TO authenticated
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM coaches c WHERE c.id = auth.uid()
        )
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'program_variants' AND policyname = 'program_variants_update_service'
  ) THEN
    CREATE POLICY program_variants_update_service
      ON program_variants
      FOR UPDATE
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM coaches c WHERE c.id = auth.uid()
        )
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'program_variants' AND policyname = 'program_variants_delete_service'
  ) THEN
    CREATE POLICY program_variants_delete_service
      ON program_variants
      FOR DELETE
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM coaches c WHERE c.id = auth.uid()
        )
      );
  END IF;
END $$;

-- ────────────────────────────────────────────────────────────
-- STEP 8: Helper functions for variant discovery
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION get_variants_for_program(p_program_id uuid)
RETURNS TABLE (
  id uuid,
  duration_weeks integer,
  experience_level text,
  weekly_frequency integer,
  strength_plan_id uuid,
  running_plan_template_id uuid,
  running_config_preset jsonb
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    pv.id,
    pv.duration_weeks,
    pv.experience_level,
    pv.weekly_frequency,
    pv.strength_plan_id,
    pv.running_plan_template_id,
    pv.running_config_preset
  FROM program_variants pv
  WHERE pv.training_program_id = p_program_id
  ORDER BY pv.duration_weeks ASC, pv.experience_level ASC, pv.weekly_frequency ASC;
END;
$$ LANGUAGE plpgsql STABLE;

CREATE OR REPLACE FUNCTION filter_variants(
  p_program_id uuid,
  p_experience_level text DEFAULT NULL,
  p_weekly_frequency integer DEFAULT NULL,
  p_duration_weeks integer DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  duration_weeks integer,
  experience_level text,
  weekly_frequency integer,
  strength_plan_id uuid,
  running_plan_template_id uuid
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    pv.id,
    pv.duration_weeks,
    pv.experience_level,
    pv.weekly_frequency,
    pv.strength_plan_id,
    pv.running_plan_template_id
  FROM program_variants pv
  WHERE pv.training_program_id = p_program_id
    AND (p_experience_level IS NULL OR pv.experience_level = p_experience_level)
    AND (p_weekly_frequency IS NULL OR pv.weekly_frequency = p_weekly_frequency)
    AND (p_duration_weeks IS NULL OR pv.duration_weeks = p_duration_weeks)
  ORDER BY pv.duration_weeks ASC, pv.experience_level ASC, pv.weekly_frequency ASC;
END;
$$ LANGUAGE plpgsql STABLE;

-- ────────────────────────────────────────────────────────────
-- STEP 9: Grants
-- ────────────────────────────────────────────────────────────

GRANT SELECT ON program_variants TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON program_variants TO authenticated;
GRANT EXECUTE ON FUNCTION get_variants_for_program TO anon, authenticated;
GRANT EXECUTE ON FUNCTION filter_variants TO anon, authenticated;

COMMIT;

-- ============================================================
-- VERIFICATION QUERIES (run after migration)
-- ============================================================
-- 
-- 1. Confirm table exists:
--    SELECT count(*) FROM information_schema.tables WHERE table_name = 'program_variants';
--    → Should return 1
--
-- 2. Confirm columns on program_assignments:
--    SELECT column_name, data_type FROM information_schema.columns
--    WHERE table_name = 'program_assignments' AND column_name = 'selected_variant_id';
--    → Should return 1 row (uuid)
--
-- 3. Confirm columns on training_programs:
--    SELECT column_name, data_type FROM information_schema.columns
--    WHERE table_name = 'training_programs' AND column_name = 'default_variant_id';
--    → Should return 1 row (uuid)
--
-- 4. Confirm columns on athlete_weekly_plan:
--    SELECT column_name, data_type FROM information_schema.columns
--    WHERE table_name = 'athlete_weekly_plan' AND column_name = 'generated_from_variant_id';
--    → Should return 1 row (uuid)
--
-- 5. Confirm RLS is enabled:
--    SELECT relname, relrowsecurity FROM pg_class WHERE relname = 'program_variants';
--    → relrowsecurity should be true
--
-- 6. Confirm policies:
--    SELECT policyname FROM pg_policies WHERE tablename = 'program_variants';
--    → Should list 4 policies
--
-- 7. Test empty variant list:
--    SELECT * FROM program_variants;
--    → Should return 0 rows (empty table, ready for data)
--
-- ============================================================
