-- Migration: Link strength instances to schedule presets
-- Date: 2026-04-01
--
-- 1. Add schedule_preset_id + preset_assigned_at to strength_plan_instances
-- 2. Add generated_from_preset_id to athlete_weekly_plan
-- 3. Indexes for both

-- ── 1. strength_plan_instances: preset linkage columns ───────────────────────
ALTER TABLE strength_plan_instances
  ADD COLUMN IF NOT EXISTS schedule_preset_id uuid REFERENCES program_schedule_presets(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS preset_assigned_at  timestamptz;

CREATE INDEX IF NOT EXISTS idx_spi_schedule_preset
  ON strength_plan_instances (schedule_preset_id)
  WHERE schedule_preset_id IS NOT NULL;

-- ── 2. athlete_weekly_plan: audit which preset generated each row ────────────
ALTER TABLE athlete_weekly_plan
  ADD COLUMN IF NOT EXISTS generated_from_preset_id uuid REFERENCES program_schedule_presets(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_awp_generated_preset
  ON athlete_weekly_plan (generated_from_preset_id)
  WHERE generated_from_preset_id IS NOT NULL;
