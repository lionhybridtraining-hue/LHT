-- Add per-program image URL for home featured section and catalog cards
alter table if exists public.training_programs
  add column if not exists image_url text;

comment on column public.training_programs.image_url is
  'Optional public image URL used in home/program cards and featured program visual.';
