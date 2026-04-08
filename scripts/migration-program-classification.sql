-- Migration: add structured program classification metadata
-- Supports filters and automation rules based on training focus, modalities,
-- experience level, and category.

alter table if exists public.training_programs
  add column if not exists classification jsonb;

comment on column public.training_programs.classification is
  'Structured metadata for filters and automation: primary/secondary categories, training components, modalities, experience levels, automation tags, and notes.';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'training_programs_classification_object_check'
  ) then
    alter table public.training_programs
      add constraint training_programs_classification_object_check
      check (classification is null or jsonb_typeof(classification) = 'object');
  end if;
end $$;

create index if not exists training_programs_classification_gin_idx
  on public.training_programs using gin (classification)
  where deleted_at is null;

create index if not exists training_programs_classification_primary_category_idx
  on public.training_programs ((classification->>'primaryCategory'))
  where deleted_at is null;