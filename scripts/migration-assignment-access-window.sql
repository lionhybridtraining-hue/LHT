-- Assignment access window
-- Goal:
-- 1. Keep duration_weeks as a snapshot of the program metadata.
-- 2. Allow assignments to define an optional access_end_date.
-- 3. Lifetime access = access_end_date IS NULL.

alter table if exists public.program_assignments
  add column if not exists access_end_date date;

-- Backfill existing assignments so current behavior stays unchanged.
update public.program_assignments
set access_end_date = computed_end_date
where access_end_date is null
  and computed_end_date is not null;
