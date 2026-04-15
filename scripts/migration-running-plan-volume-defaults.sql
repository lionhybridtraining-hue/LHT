-- Running Plan Template — Volume Defaults
-- Adds default volume configuration columns so presets can be applied
-- without the coach needing to specify volume per athlete each time.

alter table if exists public.running_plan_templates
  add column if not exists default_initial_weekly_volume_km numeric(6,1) not null default 30,
  add column if not exists default_weekly_progression_pct numeric(5,2) not null default 5,
  add column if not exists default_periodization_type text not null default 'undulating'
    check (default_periodization_type in ('linear', 'undulating', 'block'));
