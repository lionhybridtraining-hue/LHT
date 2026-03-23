-- ============================================================
-- Migration: Strength Plans → Templates + Instances
-- 
-- Changes strength_plans from per-athlete to per-program templates.
-- Adds strength_plan_instances to link templates to athletes.
-- ============================================================

-- 1. Drop old athlete-specific constraints/indexes from strength_plans
drop index if exists strength_plans_athlete_status_idx;
drop index if exists strength_plans_single_active_uidx;

-- 2. Alter strength_plans → template model
-- Make athlete_id nullable (legacy rows keep it, new ones don't need it)
alter table strength_plans alter column athlete_id drop not null;

-- Add optional link to training_programs (commercial program)
alter table strength_plans add column if not exists training_program_id uuid
  references training_programs(id) on delete set null;

-- Add description for the template
alter table strength_plans add column if not exists description text;

-- New index on training_program_id
create index if not exists strength_plans_program_idx
on strength_plans (training_program_id)
where training_program_id is not null;

-- Index for listing templates (no athlete filter)
create index if not exists strength_plans_status_idx
on strength_plans (status)
where status in ('draft', 'active');

-- 3. Create strength_plan_instances — links a template to a specific athlete
create table if not exists strength_plan_instances (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references strength_plans(id) on delete cascade,
  athlete_id uuid not null references athletes(id) on delete cascade,
  start_date date,
  load_round numeric(4,2) not null default 2.5,
  status text not null default 'active'
    check (status in ('active', 'paused', 'completed', 'cancelled')),
  assigned_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One active instance per athlete
create unique index if not exists strength_plan_instances_active_uidx
on strength_plan_instances (athlete_id)
where status = 'active';

create index if not exists strength_plan_instances_athlete_idx
on strength_plan_instances (athlete_id, status);

create index if not exists strength_plan_instances_plan_idx
on strength_plan_instances (plan_id);

drop trigger if exists set_strength_plan_instances_updated_at on strength_plan_instances;
create trigger set_strength_plan_instances_updated_at
before update on strength_plan_instances
for each row
execute function set_updated_at();

-- 4. Update strength_log_sets to reference instance instead of plan directly
alter table strength_log_sets add column if not exists instance_id uuid
  references strength_plan_instances(id) on delete set null;

create index if not exists strength_log_sets_instance_idx
on strength_log_sets (instance_id, week_number)
where instance_id is not null;

-- 5. Move load_round from strength_plans default to instance-level
-- (keep it on plans as default, instance overrides it)
