-- Migration: Strength plan day labels
-- Stores custom display names for each training day in a strength plan.

BEGIN;

CREATE TABLE IF NOT EXISTS strength_plan_day_labels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id uuid NOT NULL REFERENCES strength_plans(id) ON DELETE CASCADE,
  day_number integer NOT NULL CHECK (day_number >= 1 AND day_number <= 7),
  day_label text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (plan_id, day_number)
);

CREATE INDEX IF NOT EXISTS idx_strength_plan_day_labels_plan
  ON strength_plan_day_labels(plan_id, day_number);

COMMIT;
