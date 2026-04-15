-- ============================================================
-- Migration: Multi-Variant Training Program Architecture (v1)
-- Date: 2026-04-14
-- ============================================================
--
-- What changes:
--   1. Create program_variants table — maps variant metadata
--      (duration, experience_level, weekly_frequency) to
--      (strength_plan_id, running_plan_template_id, running_config_preset)
--   2. Add selected_variant_id to program_assignments
--   3. Add default_variant_id to training_programs
--   4. Create variant lookup indexes for fast filtering
--   5. Add helper functions for variant CRUD + discovery
--
-- What stays:
--   - program_schedule_presets table (deprecated but not removed; used for backward compat)
--   - All athlete_weekly_plan rows (reference logic adapts to variants)
--
-- Why:
--   At 10-20 variants per program, preset system doesn't scale. Variants should be
--   first-class: explicit metadata + systematic generation.
--
-- ============================================================

BEGIN;

-- ────────────────────────────────────────────────────────────
-- STEP 1: Create program_variants table
-- ────────────────────────────────────────────────────────────
-- Each row = one variant of a training program.
-- Variants are distinguished by: duration, experience_level, weekly_frequency.
-- Each variant references exactly one strength_plan + running_plan_template (+ optional config).

CREATE TABLE IF NOT EXISTS program_variants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Reference to the parent program
  training_program_id uuid NOT NULL REFERENCES training_programs(id) ON DELETE CASCADE,
  
  -- Variant metadata: what makes this variant unique
  duration_weeks integer NOT NULL CHECK (duration_weeks > 0),
  experience_level text NOT NULL CHECK (experience_level IN ('beginner', 'intermediate', 'advanced')),
  weekly_frequency integer NOT NULL CHECK (weekly_frequency >= 3 AND weekly_frequency <= 6),
  
  -- Variant binding: which plans to use
  strength_plan_id uuid NOT NULL REFERENCES strength_plans(id) ON DELETE RESTRICT,
  running_plan_template_id uuid NOT NULL REFERENCES running_plan_templates(id) ON DELETE RESTRICT,
  
  -- Running config specific to this variant (scales parametric template)
  -- Example: {initial_weekly_volume_km: 30, weekly_progression_pct: 4, periodization_type: 'linear'}
  running_config_preset jsonb DEFAULT '{}'::jsonb,
  
  -- Administrative metadata
  created_by uuid REFERENCES coaches(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  
  -- Ensure no duplicate variants per program (cartesian product prevents duplicates)
  UNIQUE (training_program_id, duration_weeks, experience_level, weekly_frequency)
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_program_variants_program
  ON program_variants (training_program_id)
  WHERE training_program_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_program_variants_strength_plan
  ON program_variants (strength_plan_id)
  WHERE strength_plan_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_program_variants_running_template
  ON program_variants (running_plan_template_id)
  WHERE running_plan_template_id IS NOT NULL;

-- Composite index for filtering variants by metadata
CREATE INDEX IF NOT EXISTS idx_program_variants_metadata
  ON program_variants (training_program_id, experience_level, weekly_frequency, duration_weeks)
  WHERE training_program_id IS NOT NULL;

-- Audit trigger
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
-- STEP 2: Add selected_variant_id to program_assignments
-- ────────────────────────────────────────────────────────────
-- Athlete's choice of which variant (duration, level, frequency) to use.
-- NULL = not yet selected (needs variant picker UI) or coach auto-selected.

ALTER TABLE program_assignments
  ADD COLUMN IF NOT EXISTS selected_variant_id uuid
    REFERENCES program_variants(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_program_assignments_selected_variant
  ON program_assignments (selected_variant_id)
  WHERE selected_variant_id IS NOT NULL;

-- ────────────────────────────────────────────────────────────
-- STEP 3: Add default_variant_id to training_programs
-- ────────────────────────────────────────────────────────────
-- Coach can optionally set a recommended variant (new assignments may default to this).

ALTER TABLE training_programs
  ADD COLUMN IF NOT EXISTS default_variant_id uuid
    REFERENCES program_variants(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_training_programs_default_variant
  ON training_programs (default_variant_id)
  WHERE default_variant_id IS NOT NULL;

-- ────────────────────────────────────────────────────────────
-- STEP 4: Update athlete_weekly_plan for variant tracking
-- ────────────────────────────────────────────────────────────
-- Replace or augment generated_from_preset_id with generated_from_variant_id.
-- Keep both during transition period for backward compat.

ALTER TABLE athlete_weekly_plan
  ADD COLUMN IF NOT EXISTS generated_from_variant_id uuid
    REFERENCES program_variants(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_athlete_weekly_plan_variant
  ON athlete_weekly_plan (generated_from_variant_id)
  WHERE generated_from_variant_id IS NOT NULL;

-- ────────────────────────────────────────────────────────────
-- STEP 5: Helper function: get_variants_for_program(program_id)
-- ────────────────────────────────────────────────────────────
-- Returns all variants for a program, useful for athlete variant picker.

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

-- ────────────────────────────────────────────────────────────
-- STEP 6: Helper function: filter_variants(program_id, experience_level, weekly_frequency)
-- ────────────────────────────────────────────────────────────
-- Athlete variant picker calls this to narrow down options.

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
-- STEP 7: Grant permissions
-- ────────────────────────────────────────────────────────────

GRANT SELECT ON program_variants TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON program_variants TO authenticated;
GRANT EXECUTE ON FUNCTION get_variants_for_program TO anon, authenticated;
GRANT EXECUTE ON FUNCTION filter_variants TO anon, authenticated;

-- ────────────────────────────────────────────────────────────
-- STEP 8: Documentation comment
-- ────────────────────────────────────────────────────────────
COMMENT ON TABLE program_variants IS
'Multi-variant training program architecture. Each variant combines:
- Metadata: duration_weeks, experience_level, weekly_frequency
- Binding: strength_plan_id (explicit), running_plan_template_id + running_config_preset (parametric)
Coach generates variants via template (e.g., "3 durations × 3 levels × 2 frequencies" = 18 rows).
Athlete picks variant during onboarding; system generates calendar from variant metadata.
Replaces preset-driven calendar for scale (10-20 variants/program).';

COMMENT ON COLUMN program_variants.running_config_preset IS
'JSONB config applied to running_plan_template during instance creation.
Example: {initial_weekly_volume_km: 30, weekly_progression_pct: 4, periodization_type: "linear"}
Allows parametric scaling of base template per variant (4W vs 6W vs 8W may have different volumes).';

COMMIT;
