-- Migration: decouple provas/events from training_programs using training_events + event_id

BEGIN;

CREATE TABLE IF NOT EXISTS training_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  event_date date,
  event_location text,
  event_description text,
  calendar_visible boolean NOT NULL DEFAULT true,
  calendar_highlight_rank integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE INDEX IF NOT EXISTS training_events_date_idx
  ON training_events (event_date)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS training_events_rank_idx
  ON training_events (calendar_highlight_rank, event_date)
  WHERE deleted_at IS NULL AND calendar_visible = true;

CREATE UNIQUE INDEX IF NOT EXISTS training_events_identity_uidx
  ON training_events (lower(name), event_date, lower(coalesce(event_location, '')))
  WHERE deleted_at IS NULL;

DROP TRIGGER IF EXISTS set_training_events_updated_at ON training_events;
CREATE TRIGGER set_training_events_updated_at
BEFORE UPDATE ON training_events
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

ALTER TABLE training_programs
  ADD COLUMN IF NOT EXISTS event_id uuid REFERENCES training_events(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS training_programs_event_idx
  ON training_programs (event_id)
  WHERE deleted_at IS NULL;

WITH source_events AS (
  SELECT DISTINCT
    NULLIF(trim(event_name), '') AS name,
    event_date,
    NULLIF(trim(event_location), '') AS event_location,
    NULLIF(trim(event_description), '') AS event_description,
    COALESCE(calendar_visible, true) AS calendar_visible,
    calendar_highlight_rank
  FROM training_programs
  WHERE deleted_at IS NULL
    AND (
      NULLIF(trim(event_name), '') IS NOT NULL
      OR event_date IS NOT NULL
      OR NULLIF(trim(event_location), '') IS NOT NULL
      OR NULLIF(trim(event_description), '') IS NOT NULL
      OR calendar_highlight_rank IS NOT NULL
      OR calendar_visible = false
    )
), inserted AS (
  INSERT INTO training_events (
    name,
    event_date,
    event_location,
    event_description,
    calendar_visible,
    calendar_highlight_rank
  )
  SELECT
    COALESCE(name, 'Prova sem nome') AS name,
    event_date,
    event_location,
    event_description,
    calendar_visible,
    calendar_highlight_rank
  FROM source_events
  ON CONFLICT (lower(name), event_date, lower(coalesce(event_location, '')))
    WHERE deleted_at IS NULL
  DO UPDATE SET
    event_description = COALESCE(EXCLUDED.event_description, training_events.event_description),
    calendar_visible = COALESCE(EXCLUDED.calendar_visible, training_events.calendar_visible),
    calendar_highlight_rank = COALESCE(EXCLUDED.calendar_highlight_rank, training_events.calendar_highlight_rank)
  RETURNING id
)
SELECT COUNT(*) AS touched_events FROM inserted;

UPDATE training_programs p
SET event_id = e.id
FROM training_events e
WHERE p.deleted_at IS NULL
  AND p.event_id IS NULL
  AND COALESCE(NULLIF(trim(p.event_name), ''), 'Prova sem nome') = e.name
  AND p.event_date IS NOT DISTINCT FROM e.event_date
  AND COALESCE(NULLIF(trim(p.event_location), ''), '') = COALESCE(e.event_location, '')
  AND e.deleted_at IS NULL;

COMMIT;
