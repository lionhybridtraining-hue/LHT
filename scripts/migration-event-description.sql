-- ============================================================
-- Migration: Add event_description to training_programs
--
-- Adds a dedicated text column for the event/challenge marketing
-- description, separate from the program description.
-- Used in the calendar page "Desafio em Destaque" card.
--
-- POST-MIGRATION: After running this, add event_description to
-- the SELECT in supabase.js for both listTrainingPrograms and
-- listPublicTrainingPrograms queries.
-- ============================================================

ALTER TABLE training_programs
  ADD COLUMN IF NOT EXISTS event_description text;

COMMENT ON COLUMN training_programs.event_description IS
  'Marketing description for the event/challenge card on the calendar page. Distinct from the program description.';
