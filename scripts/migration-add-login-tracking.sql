-- Add login retention tracking and app install funnel stage support.

-- 1) Athletes: retain last login timestamp.
alter table athletes add column if not exists last_login_at timestamptz;
create index if not exists athletes_last_login_idx on athletes(last_login_at desc nulls last);

-- 2) Login history table.
create table if not exists login_events (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid references athletes(id) on delete set null,
  identity_id text,
  logged_in_at timestamptz not null default now(),
  device_hint text,
  created_at timestamptz not null default now()
);

create index if not exists login_events_athlete_logged_in_idx
on login_events (athlete_id, logged_in_at desc);

create index if not exists login_events_identity_logged_in_idx
on login_events (identity_id, logged_in_at desc);

-- 3) Expand leads_central source values.
alter table leads_central drop constraint if exists leads_central_source_check;
alter table leads_central drop constraint if exists leads_central_last_source_check;

alter table leads_central
  add constraint leads_central_source_check
  check (source in (
    'planocorrida_landing',
    'planocorrida_form',
    'planocorrida_generated',
    'meta_ads',
    'stripe',
    'coach_landing',
    'onboarding',
    'manual'
  ));

alter table leads_central
  add constraint leads_central_last_source_check
  check (last_source in (
    'planocorrida_landing',
    'planocorrida_form',
    'planocorrida_generated',
    'meta_ads',
    'stripe',
    'coach_landing',
    'onboarding',
    'manual'
  ));

-- 4) Expand leads_central funnel stages.
alter table leads_central drop constraint if exists leads_central_funnel_stage_check;

alter table leads_central
  add constraint leads_central_funnel_stage_check
  check (funnel_stage in (
    'landing',
    'landing_submitted',
    'meta_received',
    'onboarding_submitted',
    'plan_generated',
    'app_installed',
    'coach_application',
    'qualified',
    'converted',
    'disqualified'
  ));
