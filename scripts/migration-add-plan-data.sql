-- Migration: Add plan persistence to program_assignments
-- Purpose: Store generated training plans (phase 1, 2, 3 data)
-- Date: 2026-03-20

-- Add plan_data column to program_assignments (stores entire plan JSON)
alter table program_assignments
add column if not exists plan_data jsonb default null;

-- Add plan metadata columns for easy filtering
alter table program_assignments
add column if not exists plan_generated_at timestamptz default null;

alter table program_assignments
add column if not exists plan_params jsonb default null;

-- Add indices for plan-related queries
create index if not exists program_assignments_plan_generated_idx
on program_assignments (athlete_id, plan_generated_at desc)
where plan_data is not null;

-- Note: plan_params stores the input parameters (vdot, progression_rate, phase_duration, etc)
-- plan_data stores the full generated plan (phases with weeks and training sessions)
