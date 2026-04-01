-- Shared warmup presets library for strength planning UI.
-- Presets store only the warm_up section payload for a single day,
-- including exercises, weekly prescriptions, and warm_up phase notes.

create table if not exists strength_warmup_presets (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  payload jsonb not null,
  created_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists strength_warmup_presets_updated_idx
on strength_warmup_presets (updated_at desc);

drop trigger if exists set_strength_warmup_presets_updated_at on strength_warmup_presets;
create trigger set_strength_warmup_presets_updated_at
before update on strength_warmup_presets
for each row
execute function set_updated_at();
