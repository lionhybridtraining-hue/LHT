-- Migration: add highlighted control for homepage featured program
-- Ensures only one active highlighted program at a time.

alter table if exists public.training_programs
  add column if not exists highlighted boolean not null default false;

create unique index if not exists training_programs_single_highlighted_idx
  on public.training_programs ((highlighted))
  where highlighted is true and deleted_at is null;
