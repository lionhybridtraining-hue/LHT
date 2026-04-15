# Running Program Schema Proposal

## Goal

Integrate running plans into the existing LHT commercial and calendar model without creating a parallel product system.

Target flow:

1. `training_programs` remains the commercial product layer with Stripe relation.
2. Stripe purchase creates `program_assignments`.
3. Assignment unlocks schedule preset selection through the existing program calendar flow.
4. Preset application materializes both calendar rows and running workout instances.
5. Each completed running session can update the athlete's current VDOT, zones, and future workout targets.

This mirrors the existing strength pattern:

- Strength: `training_programs` -> `program_assignments` -> `strength_plan_instances`
- Running: `training_programs` -> `program_assignments` -> `running_plan_instances`

## Design Principles

- Reuse `training_programs`, `stripe_purchases`, `program_assignments`, `program_schedule_presets`, `program_schedule_slots`, and `athlete_weekly_plan`.
- Keep running execution data compatible with existing `training_sessions` and Strava sync.
- Store plan templates separately from athlete instances.
- Snapshot resolved workouts at assignment time, but keep a recalculation mechanism for future sessions.
- Use structured workout steps so the same model can later export `.fit`, `.tcx`, calendar events, and LHT-native UI.

## Existing Tables To Reuse

### Commercial layer

- `training_programs`
- `stripe_purchases`
- `program_assignments`

### Calendar layer

- `program_weekly_sessions`
- `program_schedule_presets`
- `program_schedule_slots`
- `athlete_weekly_plan`

### Athlete physiology / execution layer

- `training_sessions`
- `athlete_training_zone_profiles`
- `athlete_training_zones`
- `training_load_daily`
- `training_load_metrics`

## Recommended Schema Changes

### 1. Extend `program_weekly_sessions`

Purpose: let a running calendar slot point to a concrete running workout definition, just like strength sessions point to a strength plan.

Recommended additions:

```sql
alter table public.program_weekly_sessions
  add column if not exists running_plan_template_id uuid references public.running_plan_templates(id) on delete set null,
  add column if not exists running_workout_template_id uuid references public.running_workout_templates(id) on delete set null;

create index if not exists program_weekly_sessions_running_plan_idx
  on public.program_weekly_sessions (running_plan_template_id)
  where running_plan_template_id is not null;

create index if not exists program_weekly_sessions_running_workout_idx
  on public.program_weekly_sessions (running_workout_template_id)
  where running_workout_template_id is not null;
```

Rule:

- Use `running_plan_template_id` when the program has a week-by-week running progression.
- Use `running_workout_template_id` for standalone reusable sessions like testing, recovery, or ad-hoc sessions.

### 2. Add `running_plan_templates`

Purpose: reusable running plan library linked to a commercial program.

```sql
create table if not exists public.running_plan_templates (
  id uuid primary key default gen_random_uuid(),
  training_program_id uuid references public.training_programs(id) on delete cascade,
  name text not null,
  objective text not null,
  total_weeks integer not null check (total_weeks > 0),
  default_metric_model text not null default 'vdot' check (default_metric_model in ('vdot', 'threshold_pace', 'heart_rate', 'rpe')),
  default_vdot_source text not null default 'best_recent_effort' check (default_vdot_source in ('race_result', 'best_recent_effort', 'coach_set', 'manual')),
  status text not null default 'draft' check (status in ('draft', 'active', 'archived')),
  engine_version text not null default 'running-v1',
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

Notes:

- This is the running equivalent of `strength_plans`.
- `training_program_id` keeps the commercial product relation intact.
- Multiple templates can exist for one commercial program if needed.

### 3. Add `running_workout_templates`

Purpose: library of reusable workout archetypes.

```sql
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
```

### 4. Add `running_workout_template_steps`

Purpose: structured workout definition that can render in UI and export to `.fit` later.

```sql
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
  instruction_text text,
  export_hint jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workout_template_id, step_order)
);
```

Why this matters:

- It avoids hardcoding workouts as plain text.
- It is the right abstraction for `.fit` and `.tcx` export.
- It lets the same workout be rendered in the athlete app, coach UI, and external integrations.

### 5. Add `running_plan_template_sessions`

Purpose: map a running plan template to weekly sessions and connect them to workout templates.

```sql
create table if not exists public.running_plan_template_sessions (
  id uuid primary key default gen_random_uuid(),
  plan_template_id uuid not null references public.running_plan_templates(id) on delete cascade,
  week_number integer not null check (week_number >= 1),
  session_key text not null,
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
```

This is the key table that lets a commercial running program have a real week-by-week progression.

### 6. Add `running_plan_instances`

Purpose: athlete-plan binding, equivalent to `strength_plan_instances`.

```sql
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
  engine_version text not null,
  plan_snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists running_plan_instances_single_active_uidx
  on public.running_plan_instances (athlete_id)
  where status in ('active', 'paused');
```

Snapshot contents should include:

- template metadata
- resolved week/session map
- workout step structure
- generation assumptions
- engine version

### 7. Add `running_workout_instances`

Purpose: materialized athlete workouts linked to the calendar.

```sql
create table if not exists public.running_workout_instances (
  id uuid primary key default gen_random_uuid(),
  running_plan_instance_id uuid not null references public.running_plan_instances(id) on delete cascade,
  athlete_weekly_plan_id uuid references public.athlete_weekly_plan(id) on delete set null,
  week_number integer not null check (week_number >= 1),
  session_key text not null,
  session_type text not null,
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
```

Rule:

- Past completed workouts keep the resolved target snapshot used on that day.
- Future planned workouts may be recalculated when VDOT changes.

### 8. Add `athlete_running_vdot_history`

Purpose: same role as `athlete_exercise_1rm`, but for running performance state.

```sql
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
```

Important integration rule:

- `athlete_running_vdot_history` stores history.
- `athlete_training_zone_profiles` with `modality='run'` remains the current effective zone profile for the rest of the app.
- Every accepted VDOT update should also upsert `athlete_training_zone_profiles` and `athlete_training_zones`.

## Minimal Changes To Existing Tables

### `athlete_weekly_plan`

Keep `running_session_data`, but add explicit linkage for normalized running workouts:

```sql
alter table public.athlete_weekly_plan
  add column if not exists running_workout_instance_id uuid references public.running_workout_instances(id) on delete set null,
  add column if not exists running_plan_instance_id uuid references public.running_plan_instances(id) on delete set null;
```

Reason:

- `running_session_data` can stay as a convenient render snapshot.
- relational links are needed for recalculation, adherence, export, and audit.

### `training_sessions`

Recommended additions for explicit matching back to the prescribed workout:

```sql
alter table public.training_sessions
  add column if not exists athlete_weekly_plan_id uuid references public.athlete_weekly_plan(id) on delete set null,
  add column if not exists running_workout_instance_id uuid references public.running_workout_instances(id) on delete set null,
  add column if not exists vdot_estimate numeric(5,2),
  add column if not exists threshold_pace_sec_per_km_estimate numeric(7,2);
```

This removes dependence on fuzzy matching only.

## End-To-End Flow

### 1. Program creation

- Coach/admin creates a `training_programs` row.
- Stripe price/product remains on `training_programs`.
- Program classification should declare it as running-focused, for example:

```json
{
  "primaryCategory": "running",
  "discipline": "road",
  "objective": "half_marathon",
  "level": "intermediate"
}
```

### 2. Running template setup

- Create `running_plan_templates` for the commercial program.
- Define reusable `running_workout_templates`.
- Build weekly progression in `running_plan_template_sessions`.
- Map preset calendar slots through `program_weekly_sessions` and `program_schedule_presets`.

### 3. Purchase and assignment

- Stripe checkout creates `stripe_purchases`.
- Webhook creates `program_assignments`.
- Assignment unlocks preset selection exactly like current programs flow.

### 4. Preset application

When the athlete or coach chooses a preset:

- create `athlete_weekly_plan` rows
- create one `running_plan_instances` row
- create `running_workout_instances` rows for each running session in the generated weeks
- write resolved targets into `athlete_weekly_plan.running_session_data`

### 5. Session completion and recalculation

When a run is completed via Strava sync or manual logging:

- link the `training_sessions` row to `running_workout_instances`
- derive candidate VDOT when the session qualifies
- insert into `athlete_running_vdot_history`
- update `athlete_training_zone_profiles` for run modality
- recalculate future `running_workout_instances` where status = `planned`

This gives you the running analogue of strength's 1RM recalculation loop.

## Recalculation Rules

Recommended policy:

- Completed sessions are immutable snapshots.
- Current week can be recalculated only for workouts not yet completed.
- Future weeks can be fully recalculated.
- Every recalculation should bump `recalculated_at` and preserve `vdot_used` for audit.

Suggested trigger events:

- new race result
- successful Strava sync with qualifying effort
- manual coach override
- manual athlete test session

## FIT / Universal Export Readiness

This schema is designed so `.fit` export is a compiler step, not the source model.

Export path:

1. `running_workout_template_steps`
2. resolve athlete targets into `running_workout_instances.resolved_targets`
3. build `export_payload`
4. compile to `.fit` / `.tcx` / JSON on backend

Because steps are structured, the same running workout can be:

- rendered in the athlete UI
- exported as `.fit`
- exported as `.tcx`
- pushed to other integrations later

## Why This Fits The Existing LHT Model

- Keeps Stripe and commercial logic on `training_programs`.
- Keeps purchase-to-access flow on `program_assignments`.
- Reuses existing preset-driven calendar.
- Mirrors the proven strength pattern instead of inventing a separate running architecture.
- Uses `athlete_training_zone_profiles` as the shared physiological truth for running targets.
- Makes future `.fit` export feasible without rebuilding the schema later.

## Recommended First Implementation Scope

Build in this order:

1. `running_plan_templates`
2. `running_workout_templates`
3. `running_workout_template_steps`
4. `running_plan_template_sessions`
5. `running_plan_instances`
6. `running_workout_instances`
7. `athlete_running_vdot_history`
8. small extensions to `program_weekly_sessions`, `athlete_weekly_plan`, and `training_sessions`

This gets you a coherent running data model without disturbing the existing strength and program assignment flows.

## Seed For New Programs

To speed up creation of new running plans/programs, run:

- [scripts/migration-running-plan-default-matrix-seed.sql](scripts/migration-running-plan-default-matrix-seed.sql)

It creates a SQL function:

- `public.seed_running_plan_matrix_for_program(training_program_id uuid, total_weeks integer default 12)`

What it does:

- Seeds reusable workout templates (`easy`, `threshold`, `tempo`, `interval`, `repetition`, `long`, `recovery`).
- Creates a matrix of running plan templates per frequency/level (legacy aer-backend logic).
- Fills `running_plan_template_sessions` for all weeks with `progression_rule.weekly_volume_pct`.
- Keeps default provisioning fields aligned with current runtime:
  - `default_volume_distribution_mode='automatic'`
  - `default_initial_weekly_volume_km=30`
  - `default_weekly_progression_pct=5`
  - `default_periodization_type='undulating'`

Execution example:

```sql
select public.seed_running_plan_matrix_for_program('<training_program_id>'::uuid, 12);
```

Optional batch example:

```sql
select public.seed_running_plan_matrix_for_program(id, 12)
from public.training_programs
where deleted_at is null
  and status in ('draft', 'active')
  and (
    lower(coalesce(classification->>'primaryCategory', '')) in ('running', 'corrida')
    or lower(coalesce(external_id, '')) like 'aer%'
  );
```