-- Migration: make training_programs.start_date canonical and remove legacy event columns

BEGIN;

ALTER TABLE training_programs
  ADD COLUMN IF NOT EXISTS start_date date;

UPDATE training_programs AS program
SET start_date = (
  event.event_date - make_interval(days => COALESCE(program.duration_weeks, 0) * 7)
)::date
FROM training_events AS event
WHERE program.event_id = event.id
  AND event.deleted_at IS NULL
  AND event.event_date IS NOT NULL;

ALTER TABLE training_programs DROP COLUMN IF EXISTS event_name;
ALTER TABLE training_programs DROP COLUMN IF EXISTS event_date;
ALTER TABLE training_programs DROP COLUMN IF EXISTS event_location;
ALTER TABLE training_programs DROP COLUMN IF EXISTS event_description;
ALTER TABLE training_programs DROP COLUMN IF EXISTS calendar_visible;
ALTER TABLE training_programs DROP COLUMN IF EXISTS calendar_highlight_rank;

COMMIT;