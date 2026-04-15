-- Running Plan Template - Session Volume Distribution Mode
-- Defines whether weekly volume allocation per session is automatic (equal split)
-- or manual (weekly_volume_pct must be configured per session).

alter table if exists public.running_plan_templates
  add column if not exists default_volume_distribution_mode text not null default 'automatic'
    check (default_volume_distribution_mode in ('automatic', 'manual'));
