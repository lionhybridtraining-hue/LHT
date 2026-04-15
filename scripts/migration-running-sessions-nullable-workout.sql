-- Migration: Allow null workout_template_id in running_plan_template_sessions
-- Reason: Auto-generated plan sessions don't have a workout template assigned yet.
-- The coach links workout templates later in the session grid editor.
-- Date: 2026-04-12

alter table if exists public.running_plan_template_sessions
  alter column workout_template_id drop not null;
