-- Allow self-serve assignments by making coach_id nullable.
-- This enables PATCH admin-assign-program with coachId = null.

alter table if exists public.program_assignments
  alter column coach_id drop not null;

-- Optional: keep FK behavior explicit (no-op if already exists as default).
-- If your FK was created with RESTRICT/NO ACTION, this does not change it.
