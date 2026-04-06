-- Normalized athlete training zones (coach-managed)
-- Created: 2026-04-04

create extension if not exists pgcrypto;

create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists athlete_training_zone_profiles (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references athletes(id) on delete cascade,
  modality text not null,
  metric_type text not null default 'heart_rate',
  model text not null,
  lthr_bpm integer,
  hr_max_bpm integer,
  hr_rest_bpm integer,
  threshold_pace_sec_per_km numeric(7,2),
  vdot numeric(5,2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint athlete_training_zone_profiles_modality_check
    check (modality in ('general', 'run', 'bike', 'swim', 'row', 'other')),
  constraint athlete_training_zone_profiles_metric_type_check
    check (metric_type in ('heart_rate', 'pace')),
  constraint athlete_training_zone_profiles_model_check
    check (model in ('friel_5', 'jack_daniels', 'percent_hrmax', 'hrr', 'lthr')),
  constraint athlete_training_zone_profiles_unique
    unique (athlete_id, modality, metric_type)
);

create table if not exists athlete_training_zones (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references athlete_training_zone_profiles(id) on delete cascade,
  zone_number integer not null,
  min_value numeric(8,2) not null,
  max_value numeric(8,2) not null,
  label text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint athlete_training_zones_zone_number_check
    check (zone_number between 1 and 5),
  constraint athlete_training_zones_range_check
    check (max_value > min_value),
  constraint athlete_training_zones_unique
    unique (profile_id, zone_number)
);

create index if not exists athlete_training_zone_profiles_athlete_idx
  on athlete_training_zone_profiles(athlete_id, modality, metric_type);

create index if not exists athlete_training_zones_profile_idx
  on athlete_training_zones(profile_id, zone_number);

drop trigger if exists set_athlete_training_zone_profiles_updated_at on athlete_training_zone_profiles;
create trigger set_athlete_training_zone_profiles_updated_at
before update on athlete_training_zone_profiles
for each row execute procedure set_updated_at();

drop trigger if exists set_athlete_training_zones_updated_at on athlete_training_zones;
create trigger set_athlete_training_zones_updated_at
before update on athlete_training_zones
for each row execute procedure set_updated_at();
