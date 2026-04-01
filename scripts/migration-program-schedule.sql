-- ============================================================
-- Migration: Program Schedule Presets & Athlete Weekly Plan
--
-- Creates the unified calendar system that maps abstract program
-- sessions (strength days, running types) to specific weekdays.
--
-- Four new tables:
--   1. program_weekly_sessions  — WHAT sessions compose a program week
--   2. program_schedule_presets — HOW many layout options exist (e.g. 6-day, 4-day)
--   3. program_schedule_slots   — Maps session→day+time_slot within a preset
--   4. athlete_weekly_plan      — Materialized calendar per athlete per week
--
-- Supports:
--   - Multiple sessions per day (time_slot 1=primary, 2=secondary)
--   - N presets per program (athlete picks or coach assigns)
--   - Coach overrides on individual athlete weeks
--   - Self-serve setup (athlete picks preset, system generates plan)
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. program_weekly_sessions — abstract sessions per program
-- ────────────────────────────────────────────────────────────
create table if not exists program_weekly_sessions (
  id uuid primary key default gen_random_uuid(),
  training_program_id uuid not null references training_programs(id) on delete cascade,
  session_key text not null,
  session_type text not null check (session_type in ('strength', 'running', 'rest', 'mobility', 'other')),
  session_label text not null,
  strength_day_number integer check (strength_day_number is null or (strength_day_number >= 1 and strength_day_number <= 7)),
  running_session_type text check (running_session_type is null or running_session_type in (
    'easy', 'threshold', 'interval', 'long', 'tempo', 'repetition', 'recovery'
  )),
  duration_estimate_min integer,
  intensity text check (intensity is null or intensity in ('low', 'moderate', 'high', 'very_high')),
  is_optional boolean not null default false,
  sort_priority integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (training_program_id, session_key)
);

create index if not exists idx_program_weekly_sessions_program
  on program_weekly_sessions(training_program_id);

-- ────────────────────────────────────────────────────────────
-- 2. program_schedule_presets — N layout options per program
-- ────────────────────────────────────────────────────────────
create table if not exists program_schedule_presets (
  id uuid primary key default gen_random_uuid(),
  training_program_id uuid not null references training_programs(id) on delete cascade,
  preset_name text not null,
  description text,
  total_training_days integer not null check (total_training_days >= 1 and total_training_days <= 7),
  is_default boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (training_program_id, preset_name)
);

create index if not exists idx_program_schedule_presets_program
  on program_schedule_presets(training_program_id);

-- ────────────────────────────────────────────────────────────
-- 3. program_schedule_slots — session→day mapping per preset
-- ────────────────────────────────────────────────────────────
create table if not exists program_schedule_slots (
  id uuid primary key default gen_random_uuid(),
  preset_id uuid not null references program_schedule_presets(id) on delete cascade,
  day_of_week integer not null check (day_of_week >= 0 and day_of_week <= 6),
  time_slot integer not null default 1 check (time_slot in (1, 2)),
  session_id uuid not null references program_weekly_sessions(id) on delete cascade,
  sort_order integer not null default 0,
  unique (preset_id, day_of_week, time_slot)
);

create index if not exists idx_program_schedule_slots_preset
  on program_schedule_slots(preset_id);

create index if not exists idx_program_schedule_slots_session
  on program_schedule_slots(session_id);

-- ────────────────────────────────────────────────────────────
-- 4. athlete_weekly_plan — materialized week per athlete
-- ────────────────────────────────────────────────────────────
create table if not exists athlete_weekly_plan (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references athletes(id) on delete cascade,
  program_assignment_id uuid not null references program_assignments(id) on delete cascade,
  week_number integer not null check (week_number >= 1),
  week_start_date date not null,
  day_of_week integer not null check (day_of_week >= 0 and day_of_week <= 6),
  time_slot integer not null default 1 check (time_slot in (1, 2)),
  session_key text not null,
  session_type text not null check (session_type in ('strength', 'running', 'rest', 'mobility', 'other')),
  session_label text not null,
  duration_estimate_min integer,
  intensity text check (intensity is null or intensity in ('low', 'moderate', 'high', 'very_high')),
  strength_instance_id uuid references strength_plan_instances(id) on delete set null,
  strength_day_number integer check (strength_day_number is null or (strength_day_number >= 1 and strength_day_number <= 7)),
  running_session_data jsonb,
  source text not null default 'preset' check (source in ('preset', 'coach_override', 'athlete_setup')),
  coach_notes text,
  status text not null default 'planned' check (status in ('planned', 'completed', 'skipped', 'moved')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (athlete_id, program_assignment_id, week_number, day_of_week, time_slot)
);

create index if not exists idx_athlete_weekly_plan_athlete
  on athlete_weekly_plan(athlete_id, week_start_date);

create index if not exists idx_athlete_weekly_plan_assignment
  on athlete_weekly_plan(program_assignment_id, week_number);

create index if not exists idx_athlete_weekly_plan_strength
  on athlete_weekly_plan(strength_instance_id)
  where strength_instance_id is not null;

-- ────────────────────────────────────────────────────────────
-- 5. Triggers — auto-update updated_at
-- ────────────────────────────────────────────────────────────
create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_program_weekly_sessions_updated_at on program_weekly_sessions;
create trigger set_program_weekly_sessions_updated_at
before update on program_weekly_sessions
for each row
execute function set_updated_at();

drop trigger if exists set_program_schedule_presets_updated_at on program_schedule_presets;
create trigger set_program_schedule_presets_updated_at
before update on program_schedule_presets
for each row
execute function set_updated_at();

drop trigger if exists set_athlete_weekly_plan_updated_at on athlete_weekly_plan;
create trigger set_athlete_weekly_plan_updated_at
before update on athlete_weekly_plan
for each row
execute function set_updated_at();

-- ────────────────────────────────────────────────────────────
-- 6. RLS — Row Level Security
-- ────────────────────────────────────────────────────────────

-- 6a. program_weekly_sessions — read-only for everyone, managed via service_role
alter table program_weekly_sessions enable row level security;

drop policy if exists "Service role full access on program_weekly_sessions"
  on program_weekly_sessions;
create policy "Service role full access on program_weekly_sessions"
  on program_weekly_sessions for all
  to service_role
  using (true) with check (true);

drop policy if exists "Authenticated read program_weekly_sessions"
  on program_weekly_sessions;
create policy "Authenticated read program_weekly_sessions"
  on program_weekly_sessions for select
  to authenticated
  using (true);

-- 6b. program_schedule_presets — read-only for everyone, managed via service_role
alter table program_schedule_presets enable row level security;

drop policy if exists "Service role full access on program_schedule_presets"
  on program_schedule_presets;
create policy "Service role full access on program_schedule_presets"
  on program_schedule_presets for all
  to service_role
  using (true) with check (true);

drop policy if exists "Authenticated read program_schedule_presets"
  on program_schedule_presets;
create policy "Authenticated read program_schedule_presets"
  on program_schedule_presets for select
  to authenticated
  using (true);

-- 6c. program_schedule_slots — read-only for everyone, managed via service_role
alter table program_schedule_slots enable row level security;

drop policy if exists "Service role full access on program_schedule_slots"
  on program_schedule_slots;
create policy "Service role full access on program_schedule_slots"
  on program_schedule_slots for all
  to service_role
  using (true) with check (true);

drop policy if exists "Authenticated read program_schedule_slots"
  on program_schedule_slots;
create policy "Authenticated read program_schedule_slots"
  on program_schedule_slots for select
  to authenticated
  using (true);

-- 6d. athlete_weekly_plan — athletes read own, service_role full access
alter table athlete_weekly_plan enable row level security;

drop policy if exists "Service role full access on athlete_weekly_plan"
  on athlete_weekly_plan;
create policy "Service role full access on athlete_weekly_plan"
  on athlete_weekly_plan for all
  to service_role
  using (true) with check (true);

drop policy if exists "Athletes read own weekly plan"
  on athlete_weekly_plan;
create policy "Athletes read own weekly plan"
  on athlete_weekly_plan for select
  to authenticated
  using (
    athlete_id = (select id from athletes where identity_id = auth.uid()::text limit 1)
  );

-- Athletes can update status on their own plan rows (mark completed/skipped)
drop policy if exists "Athletes update own weekly plan status"
  on athlete_weekly_plan;
create policy "Athletes update own weekly plan status"
  on athlete_weekly_plan for update
  to authenticated
  using (
    athlete_id = (select id from athletes where identity_id = auth.uid()::text limit 1)
  )
  with check (
    athlete_id = (select id from athletes where identity_id = auth.uid()::text limit 1)
  );
