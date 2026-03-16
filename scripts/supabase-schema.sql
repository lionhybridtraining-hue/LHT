-- LHT AI Feedback schema (MVP)

create extension if not exists pgcrypto;

create table if not exists athletes (
  id uuid primary key default gen_random_uuid(),
  name text,
  email text not null unique,
  lthr integer,
  vdot numeric(5,2),
  zones jsonb default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists training_sessions (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references athletes(id) on delete cascade,
  upload_batch_id uuid,
  session_date date not null,
  title text,
  sport_type text,
  duration_minutes integer,
  planned_duration_minutes integer,
  planned_distance_meters numeric(10,2),
  actual_duration_minutes integer,
  actual_distance_meters numeric(10,2),
  tss numeric(6,2),
  intensity_factor numeric(5,3),
  ctl numeric(6,2),
  atl numeric(6,2),
  tsb numeric(6,2),
  avg_heart_rate numeric(6,2),
  avg_power numeric(8,2),
  distance_km numeric(8,2),
  avg_pace text,
  execution_status text not null default 'unknown',
  execution_ratio numeric(6,3),
  context_class text not null default 'unknown',
  normalized_title text not null default '',
  classification_version integer not null default 1,
  raw_row jsonb,
  created_at timestamptz not null default now()
);

alter table training_sessions add column if not exists planned_duration_minutes integer;
alter table training_sessions add column if not exists planned_distance_meters numeric(10,2);
alter table training_sessions add column if not exists actual_duration_minutes integer;
alter table training_sessions add column if not exists actual_distance_meters numeric(10,2);
alter table training_sessions add column if not exists upload_batch_id uuid;
alter table training_sessions add column if not exists execution_status text;
alter table training_sessions add column if not exists execution_ratio numeric(6,3);
alter table training_sessions add column if not exists context_class text;
alter table training_sessions add column if not exists normalized_title text;
alter table training_sessions add column if not exists classification_version integer;

update training_sessions set title = coalesce(title, '') where title is null;
update training_sessions set sport_type = coalesce(sport_type, '') where sport_type is null;
update training_sessions set execution_status = 'unknown' where execution_status is null;
update training_sessions set context_class = 'unknown' where context_class is null;
update training_sessions set normalized_title = lower(regexp_replace(coalesce(title, ''), '[[:space:]]+', ' ', 'g')) where normalized_title is null or normalized_title = '';
update training_sessions set classification_version = 1 where classification_version is null;

alter table training_sessions alter column title set default '';
alter table training_sessions alter column sport_type set default '';
alter table training_sessions alter column title set not null;
alter table training_sessions alter column sport_type set not null;
alter table training_sessions alter column execution_status set default 'unknown';
alter table training_sessions alter column context_class set default 'unknown';
alter table training_sessions alter column normalized_title set default '';
alter table training_sessions alter column classification_version set default 1;
alter table training_sessions alter column execution_status set not null;
alter table training_sessions alter column context_class set not null;
alter table training_sessions alter column normalized_title set not null;
alter table training_sessions alter column classification_version set not null;

drop index if exists training_sessions_unique_session;
create unique index if not exists training_sessions_unique_session
on training_sessions (athlete_id, session_date, title, sport_type);

create index if not exists training_sessions_athlete_batch_idx
on training_sessions (athlete_id, upload_batch_id);

create table if not exists weekly_checkins (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references athletes(id) on delete cascade,
  upload_batch_id uuid,
  week_start date not null,
  status text not null default 'pending_athlete',
  training_summary text,
  ai_questions jsonb default '[]'::jsonb,
  athlete_answers jsonb,
  ai_analysis jsonb,
  final_feedback text,
  token uuid not null unique default gen_random_uuid(),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  approved_at timestamptz
);

create index if not exists weekly_checkins_athlete_week_idx
on weekly_checkins (athlete_id, week_start desc);

create index if not exists weekly_checkins_athlete_batch_idx
on weekly_checkins (athlete_id, upload_batch_id);
