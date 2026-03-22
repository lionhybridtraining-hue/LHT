-- Migration: add followup_type and is_scheduled_template to training_programs
-- Run this in Supabase SQL Editor if these columns don't exist yet.

alter table training_programs
add column if not exists followup_type text not null default 'standard';

alter table training_programs
add column if not exists is_scheduled_template boolean not null default false;
