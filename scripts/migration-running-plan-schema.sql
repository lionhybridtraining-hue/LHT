-- Running Plan Schema Migration
-- Adds 8 new tables + extensions to existing tables for integrated running program support
-- Pattern mirrors strength_plans: templates → instances → workout resolution

-- ═══════════════════════════════════════════════════════════════
-- 1. running_plan_templates
-- ═══════════════════════════════════════════════════════════════

create table if not exists public.running_plan_templates (
  id uuid primary key default gen_random_uuid(),
  training_program_id uuid not null references public.training_programs(id) on delete cascade,
  name text not null,
  objective text,
  total_weeks integer not null check (total_weeks > 0),
  default_metric_model text not null default 'vdot' check (default_metric_model in ('vdot', 'threshold_pace', 'heart_rate', 'rpe')),
  default_vdot_source text not null default 'coach_set' check (default_vdot_source in ('race_result', 'best_recent_effort', 'coach_set', 'manual')),
  status text not null default 'draft' check (status in ('draft', 'active', 'archived')),
  engine_version text not null default 'running-v1',
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists running_plan_templates_program_idx on public.running_plan_templates(training_program_id);
create index if not exists running_plan_templates_status_idx on public.running_plan_templates(status);

-- Enforce association to a training program for calendar preset integration
alter table if exists public.running_plan_templates
  alter column training_program_id set not null;

-- ═══════════════════════════════════════════════════════════════
-- 2. running_workout_templates
-- ═══════════════════════════════════════════════════════════════

create table if not exists public.running_workout_templates (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid references public.coaches(id) on delete set null,
  name text not null,
  session_type text not null check (session_type in (
    'easy', 'threshold', 'interval', 'long', 'tempo', 'repetition', 'recovery', 'test', 'mobility', 'other'
  )),
  objective text,
  target_metric text not null default 'pace' check (target_metric in ('pace', 'heart_rate', 'rpe', 'power', 'none')),
  structure_version text not null default 'v1',
  is_library boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists running_workout_templates_session_type_idx on public.running_workout_templates(session_type);
create index if not exists running_workout_templates_coach_idx on public.running_workout_templates(coach_id);

-- ═══════════════════════════════════════════════════════════════
-- 3. running_workout_template_steps
-- ═══════════════════════════════════════════════════════════════

create table if not exists public.running_workout_template_steps (
  id uuid primary key default gen_random_uuid(),
  workout_template_id uuid not null references public.running_workout_templates(id) on delete cascade,
  step_order integer not null,
  step_type text not null check (step_type in (
    'warmup', 'steady', 'interval', 'recovery', 'cooldown', 'repeat', 'note'
  )),
  target_type text not null default 'none' check (target_type in (
    'none', 'pace', 'heart_rate', 'rpe', 'power', 'cadence'
  )),
  duration_seconds integer,
  distance_meters integer,
  repeat_count integer,
  target_min numeric(8,2),
  target_max numeric(8,2),
  target_unit text,
  prescription_payload jsonb not null default '{}'::jsonb,
  instruction_text text,
  export_hint jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workout_template_id, step_order)
);

-- If table already existed from a previous migration, ensure new columns are present
alter table if exists public.running_workout_template_steps
  add column if not exists prescription_payload jsonb not null default '{}'::jsonb;

create index if not exists running_workout_template_steps_workout_idx on public.running_workout_template_steps(workout_template_id);

-- ═══════════════════════════════════════════════════════════════
-- 4. running_plan_template_sessions
-- ═══════════════════════════════════════════════════════════════

create table if not exists public.running_plan_template_sessions (
  id uuid primary key default gen_random_uuid(),
  plan_template_id uuid not null references public.running_plan_templates(id) on delete cascade,
  week_number integer not null check (week_number >= 1),
  session_key text not null,
  session_label text,
  session_order integer not null default 1,
  workout_template_id uuid not null references public.running_workout_templates(id) on delete restrict,
  session_type text not null check (session_type in (
    'easy', 'threshold', 'interval', 'long', 'tempo', 'repetition', 'recovery', 'test', 'mobility', 'other'
  )),
  progression_rule jsonb not null default '{}'::jsonb,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (plan_template_id, week_number, session_key)
);

alter table if exists public.running_plan_template_sessions
  add column if not exists session_label text;

alter table if exists public.running_plan_template_sessions
  add column if not exists session_order integer;

alter table if exists public.running_plan_template_sessions
  alter column session_order set default 1;

with running_plan_template_sessions_ranked as (
  select
    id,
    row_number() over (
      partition by plan_template_id, week_number
      order by session_key
    ) as rn
  from public.running_plan_template_sessions
)
update public.running_plan_template_sessions s
set session_order = r.rn
from running_plan_template_sessions_ranked r
where s.id = r.id
  and (s.session_order is null or s.session_order < 1);

alter table if exists public.running_plan_template_sessions
  alter column session_order set not null;

create index if not exists running_plan_template_sessions_plan_idx on public.running_plan_template_sessions(plan_template_id);
create index if not exists running_plan_template_sessions_workout_idx on public.running_plan_template_sessions(workout_template_id);

-- ═══════════════════════════════════════════════════════════════
-- 5. running_plan_instances
-- ═══════════════════════════════════════════════════════════════

create table if not exists public.running_plan_instances (
  id uuid primary key default gen_random_uuid(),
  plan_template_id uuid not null references public.running_plan_templates(id) on delete restrict,
  athlete_id uuid not null references public.athletes(id) on delete cascade,
  program_assignment_id uuid references public.program_assignments(id) on delete set null,
  stripe_purchase_id uuid references public.stripe_purchases(id) on delete set null,
  start_date date not null,
  status text not null default 'active' check (status in ('active', 'paused', 'completed', 'cancelled')),
  access_model text check (access_model is null or access_model in ('self_serve', 'coached_one_time', 'coached_recurring')),
  coach_locked_until date,
  current_vdot numeric(5,2),
  current_threshold_pace_sec_per_km numeric(7,2),
  last_recalculated_at timestamptz,
  engine_version text not null default 'running-v1',
  plan_snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists running_plan_instances_athlete_idx on public.running_plan_instances(athlete_id);
create index if not exists running_plan_instances_template_idx on public.running_plan_instances(plan_template_id);
create index if not exists running_plan_instances_status_idx on public.running_plan_instances(status);
create unique index if not exists running_plan_instances_single_active_uidx
  on public.running_plan_instances (athlete_id)
  where status in ('active', 'paused');

-- ═══════════════════════════════════════════════════════════════
-- 6. running_workout_instances
-- ═══════════════════════════════════════════════════════════════

create table if not exists public.running_workout_instances (
  id uuid primary key default gen_random_uuid(),
  running_plan_instance_id uuid not null references public.running_plan_instances(id) on delete cascade,
  athlete_weekly_plan_id uuid references public.athlete_weekly_plan(id) on delete set null,
  week_number integer not null check (week_number >= 1),
  session_key text not null,
  session_type text not null check (session_type in (
    'easy', 'threshold', 'interval', 'long', 'tempo', 'repetition', 'recovery', 'test', 'mobility', 'other'
  )),
  planned_date date,
  workout_template_id uuid references public.running_workout_templates(id) on delete set null,
  vdot_used numeric(5,2),
  threshold_pace_sec_per_km_used numeric(7,2),
  resolved_targets jsonb not null default '{}'::jsonb,
  export_payload jsonb not null default '{}'::jsonb,
  status text not null default 'planned' check (status in ('planned', 'completed', 'skipped', 'moved', 'superseded')),
  recalculation_policy text not null default 'future_only' check (recalculation_policy in ('none', 'future_only', 'always')),
  recalculated_at timestamptz,
  completed_training_session_id uuid references public.training_sessions(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists running_workout_instances_plan_idx on public.running_workout_instances(running_plan_instance_id);
create index if not exists running_workout_instances_athlete_weekly_idx on public.running_workout_instances(athlete_weekly_plan_id);
create index if not exists running_workout_instances_status_idx on public.running_workout_instances(status);
create index if not exists running_workout_instances_session_key_idx on public.running_workout_instances(session_key);

-- ═══════════════════════════════════════════════════════════════
-- 7. athlete_running_vdot_history
-- ═══════════════════════════════════════════════════════════════

create table if not exists public.athlete_running_vdot_history (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references public.athletes(id) on delete cascade,
  training_session_id uuid references public.training_sessions(id) on delete set null,
  source_type text not null check (source_type in (
    'race_result', 'time_trial', 'strava_auto', 'coach_set', 'manual'
  )),
  source_label text,
  race_distance_km numeric(6,2),
  effort_duration_seconds integer,
  vdot numeric(5,2) not null,
  threshold_pace_sec_per_km numeric(7,2),
  confidence numeric(4,3),
  is_current boolean not null default false,
  measured_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists athlete_running_vdot_history_athlete_idx
  on public.athlete_running_vdot_history (athlete_id, measured_at desc);
create index if not exists athlete_running_vdot_history_is_current_idx
  on public.athlete_running_vdot_history (athlete_id, is_current)
  where is_current = true;

-- ═══════════════════════════════════════════════════════════════
-- Extensions to existing tables
-- ═══════════════════════════════════════════════════════════════

-- program_weekly_sessions: link to running templates
alter table if exists public.program_weekly_sessions
  add column if not exists running_plan_template_id uuid references public.running_plan_templates(id) on delete set null,
  add column if not exists running_workout_template_id uuid references public.running_workout_templates(id) on delete set null;

create index if not exists program_weekly_sessions_running_plan_idx
  on public.program_weekly_sessions (running_plan_template_id)
  where running_plan_template_id is not null;

create index if not exists program_weekly_sessions_running_workout_idx
  on public.program_weekly_sessions (running_workout_template_id)
  where running_workout_template_id is not null;

-- athlete_weekly_plan: link to running instances
alter table if exists public.athlete_weekly_plan
  add column if not exists running_workout_instance_id uuid references public.running_workout_instances(id) on delete set null,
  add column if not exists running_plan_instance_id uuid references public.running_plan_instances(id) on delete set null;

create index if not exists athlete_weekly_plan_running_workout_idx
  on public.athlete_weekly_plan (running_workout_instance_id)
  where running_workout_instance_id is not null;

create index if not exists athlete_weekly_plan_running_plan_idx
  on public.athlete_weekly_plan (running_plan_instance_id)
  where running_plan_instance_id is not null;

-- training_sessions: link to running workouts + VDOT tracking
alter table if exists public.training_sessions
  add column if not exists running_workout_instance_id uuid references public.running_workout_instances(id) on delete set null,
  add column if not exists vdot_estimate numeric(5,2),
  add column if not exists threshold_pace_sec_per_km_estimate numeric(7,2);

create index if not exists training_sessions_running_workout_idx
  on public.training_sessions (running_workout_instance_id)
  where running_workout_instance_id is not null;
