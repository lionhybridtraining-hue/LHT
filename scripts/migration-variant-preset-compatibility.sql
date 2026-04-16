-- Migration: Variant ↔ Preset compatibility
--
-- Allows each variant to expose one or more compatible calendar presets,
-- with one optional default preset used as the recommended athlete setup.

begin;

create table if not exists program_variant_preset_links (
  id uuid primary key default gen_random_uuid(),
  variant_id uuid not null references program_variants(id) on delete cascade,
  preset_id uuid not null references program_schedule_presets(id) on delete cascade,
  sort_order integer not null default 0,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (variant_id, preset_id)
);

create index if not exists idx_variant_preset_links_variant
  on program_variant_preset_links (variant_id, sort_order asc);

create index if not exists idx_variant_preset_links_preset
  on program_variant_preset_links (preset_id);

drop trigger if exists set_program_variant_preset_links_updated_at on program_variant_preset_links;
create trigger set_program_variant_preset_links_updated_at
before update on program_variant_preset_links
for each row
execute function set_updated_at();

comment on table program_variant_preset_links is
'Declares which calendar presets are valid for a given program variant. One row can be marked as the default recommendation for athlete setup.';

comment on column program_variant_preset_links.is_default is
'True when this preset should be the recommended default for the linked variant.';

commit;