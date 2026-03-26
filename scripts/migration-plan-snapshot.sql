-- Phase 5.1 — Plan Versioning: snapshot at assignment
-- Adds a JSONB column to store plan exercises, prescriptions, and phase notes
-- at the moment the plan is assigned to an athlete.
-- When this column is populated, athlete-strength-plan.js will use the snapshot
-- instead of the live template data.

ALTER TABLE strength_plan_instances
  ADD COLUMN IF NOT EXISTS plan_snapshot jsonb DEFAULT NULL;

COMMENT ON COLUMN strength_plan_instances.plan_snapshot IS
  'Frozen copy of {exercises, prescriptions, phaseNotes} at assignment time. NULL = read live from template.';
