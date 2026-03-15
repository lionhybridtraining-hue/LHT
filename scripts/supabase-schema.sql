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
  session_date date not null,
  title text,
  sport_type text,
  duration_minutes integer,
  tss numeric(6,2),
  intensity_factor numeric(5,3),
  ctl numeric(6,2),
  atl numeric(6,2),
  tsb numeric(6,2),
  avg_heart_rate numeric(6,2),
  avg_power numeric(8,2),
  distance_km numeric(8,2),
  avg_pace text,
  raw_row jsonb,
  created_at timestamptz not null default now()
);

create unique index if not exists training_sessions_unique_session
on training_sessions (athlete_id, session_date, coalesce(title, ''), coalesce(sport_type, ''));

create table if not exists weekly_checkins (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references athletes(id) on delete cascade,
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
