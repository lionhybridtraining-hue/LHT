-- Migration: Add week_number to program_schedule_slots
-- Allows the calendar template to track which week a slot belongs to.
-- ────────────────────────────────────────────────────────────

-- 1. Add week_number column (nullable, default 1)
alter table program_schedule_slots
  add column if not exists week_number integer not null default 1 check (week_number >= 1);

-- 2. Drop the old unique constraint that doesn't include week_number
-- (The constraint name may vary; use DO block to handle safely)
DO $$
BEGIN
  -- Try dropping the named constraint from the original migration
  ALTER TABLE program_schedule_slots DROP CONSTRAINT IF EXISTS program_schedule_slots_preset_id_day_of_week_time_slot_key;
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

-- Also relax time_slot check to allow >= 1 (remove old check that limited to 1 or 2)
DO $$
BEGIN
  ALTER TABLE program_schedule_slots DROP CONSTRAINT IF EXISTS program_schedule_slots_time_slot_check;
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

ALTER TABLE program_schedule_slots
  ADD CONSTRAINT program_schedule_slots_time_slot_check CHECK (time_slot >= 1);

-- 3. Create new unique constraint including week_number
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'program_schedule_slots_preset_week_day_slot_key'
      AND conrelid = 'program_schedule_slots'::regclass
  ) THEN
    ALTER TABLE program_schedule_slots
      ADD CONSTRAINT program_schedule_slots_preset_week_day_slot_key
      UNIQUE (preset_id, week_number, day_of_week, time_slot);
  END IF;
END $$;

-- 4. Create index for week-based queries
CREATE INDEX IF NOT EXISTS idx_program_schedule_slots_week
  ON program_schedule_slots(preset_id, week_number);
