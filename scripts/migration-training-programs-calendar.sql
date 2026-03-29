-- Calendar challenge linkage fields for training programs.
-- This keeps a 1:1 relation: one challenge/event per program.

ALTER TABLE training_programs
  ADD COLUMN IF NOT EXISTS event_date date,
  ADD COLUMN IF NOT EXISTS event_name text,
  ADD COLUMN IF NOT EXISTS event_location text,
  ADD COLUMN IF NOT EXISTS calendar_visible boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS calendar_highlight_rank integer;

CREATE INDEX IF NOT EXISTS training_programs_event_date_idx
  ON training_programs (event_date)
  WHERE deleted_at IS NULL AND status = 'active' AND calendar_visible = true;

CREATE INDEX IF NOT EXISTS training_programs_highlight_rank_idx
  ON training_programs (calendar_highlight_rank, event_date)
  WHERE deleted_at IS NULL AND status = 'active' AND calendar_visible = true;