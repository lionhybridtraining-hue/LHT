-- Migration: Drop legacy *_labeled views
-- Context: These views were created by an earlier version of readable-id migration.
-- Current approach keeps readable_id only on base entities.

drop view if exists program_assignments_labeled;
drop view if exists training_sessions_labeled;
drop view if exists weekly_checkins_labeled;
drop view if exists training_load_daily_labeled;
drop view if exists training_load_metrics_labeled;
drop view if exists onboarding_intake_labeled;
drop view if exists strength_plans_labeled;
drop view if exists athlete_exercise_1rm_labeled;
drop view if exists strength_log_sets_labeled;
drop view if exists ai_logs_labeled;
drop view if exists strength_plan_instances_labeled;
drop view if exists strength_log_sessions_labeled;
drop view if exists athletes_directory;
drop view if exists coaches_directory;
