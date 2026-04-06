-- LHT AI Feedback schema (MVP)

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

create table if not exists athletes (
  id uuid primary key default gen_random_uuid(),
  name text,
  email text not null unique,
  identity_id text,
  lthr integer,
  vdot numeric(5,2),
  zones jsonb default '{}'::jsonb,
  coach_identity_id text,
  created_at timestamptz not null default now()
);

alter table athletes add column if not exists coach_identity_id text;
alter table athletes add column if not exists identity_id text;
alter table athletes add column if not exists phone text;
alter table athletes add column if not exists goal_distance numeric(6,2);
alter table athletes add column if not exists weekly_frequency integer;
alter table athletes add column if not exists experience_level text;
alter table athletes add column if not exists consistency_level text;
alter table athletes add column if not exists funnel_stage text default 'landing';
alter table athletes add column if not exists plan_generated_at timestamptz;
alter table athletes add column if not exists plan_storage text;
alter table athletes add column if not exists onboarding_answers jsonb default '{}'::jsonb;
alter table athletes add column if not exists onboarding_submitted_at timestamptz;
alter table athletes add column if not exists onboarding_updated_at timestamptz;
create index if not exists athletes_coach_identity_idx on athletes(coach_identity_id);
create unique index if not exists athletes_identity_uidx on athletes(identity_id) where identity_id is not null;
create index if not exists athletes_identity_idx on athletes(identity_id) where identity_id is not null;
create index if not exists athletes_onboarding_updated_idx on athletes(onboarding_updated_at desc nulls last);
create index if not exists athletes_funnel_stage_idx on athletes(funnel_stage, onboarding_updated_at desc nulls last);

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
  work_kj numeric(10,2),
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
alter table training_sessions add column if not exists work_kj numeric(10,2);
alter table training_sessions add column if not exists execution_status text;
alter table training_sessions add column if not exists execution_ratio numeric(6,3);
alter table training_sessions add column if not exists context_class text;
alter table training_sessions add column if not exists normalized_title text;
alter table training_sessions add column if not exists classification_version integer;
alter table training_sessions add column if not exists source text;
alter table training_sessions add column if not exists source_session_id text;
alter table training_sessions add column if not exists source_payload jsonb;

update training_sessions set title = coalesce(title, '') where title is null;
update training_sessions set sport_type = coalesce(sport_type, '') where sport_type is null;
update training_sessions set execution_status = 'unknown' where execution_status is null;
update training_sessions set context_class = 'unknown' where context_class is null;
update training_sessions set normalized_title = lower(regexp_replace(coalesce(title, ''), '[[:space:]]+', ' ', 'g')) where normalized_title is null or normalized_title = '';
update training_sessions set classification_version = 1 where classification_version is null;
update training_sessions set source = 'manual_csv' where source is null or source = '';

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
alter table training_sessions alter column source set default 'manual_csv';
alter table training_sessions alter column source set not null;

drop index if exists training_sessions_unique_session;
create unique index if not exists training_sessions_unique_session
on training_sessions (athlete_id, session_date, title, sport_type);

drop index if exists training_sessions_source_unique_idx;
create unique index if not exists training_sessions_source_unique_idx
on training_sessions (athlete_id, source, source_session_id);

create index if not exists training_sessions_athlete_batch_idx
on training_sessions (athlete_id, upload_batch_id);

create table if not exists athlete_strava_connections (
  athlete_id uuid primary key references athletes(id) on delete cascade,
  strava_athlete_id bigint unique,
  strava_athlete_username text,
  strava_athlete_firstname text,
  strava_athlete_lastname text,
  scope text,
  access_token text not null,
  refresh_token text not null,
  token_expires_at timestamptz not null,
  last_sync_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists set_athlete_strava_connections_updated_at on athlete_strava_connections;
create trigger set_athlete_strava_connections_updated_at
before update on athlete_strava_connections
for each row
execute function set_updated_at();

create table if not exists strava_sync_events (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references athletes(id) on delete cascade,
  event_type text not null,
  source text not null default 'manual_sync',
  payload jsonb,
  created_at timestamptz not null default now()
);

create index if not exists strava_sync_events_athlete_created_idx
on strava_sync_events (athlete_id, created_at desc);

create table if not exists weekly_checkins (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references athletes(id) on delete cascade,
  upload_batch_id uuid,
  week_start date not null,
  status text not null default 'pending_athlete',
  has_strength_manual_confirmation boolean not null default false,
  strength_planned_done_count integer,
  strength_planned_not_done_count integer,
  coach_strength_feedback text,
  training_summary text,
  ai_questions jsonb default '[]'::jsonb,
  athlete_answers jsonb,
  ai_analysis jsonb,
  final_feedback text,
  token uuid not null unique default gen_random_uuid(),
  token_expires_at timestamptz,
  submitted_via text,
  submitted_by_identity_id text,
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  approved_at timestamptz
);

alter table weekly_checkins add column if not exists has_strength_manual_confirmation boolean;
alter table weekly_checkins add column if not exists strength_planned_done_count integer;
alter table weekly_checkins add column if not exists strength_planned_not_done_count integer;
alter table weekly_checkins add column if not exists coach_strength_feedback text;
alter table weekly_checkins add column if not exists token_expires_at timestamptz;
alter table weekly_checkins add column if not exists submitted_via text;
alter table weekly_checkins add column if not exists submitted_by_identity_id text;
update weekly_checkins set has_strength_manual_confirmation = false where has_strength_manual_confirmation is null;
alter table weekly_checkins alter column has_strength_manual_confirmation set default false;
alter table weekly_checkins alter column has_strength_manual_confirmation set not null;

create index if not exists weekly_checkins_athlete_week_idx
on weekly_checkins (athlete_id, week_start desc);

create index if not exists weekly_checkins_athlete_batch_idx
on weekly_checkins (athlete_id, upload_batch_id);

create table if not exists training_load_daily (
  athlete_id uuid not null references athletes(id) on delete cascade,
  load_date date not null,
  daily_tss numeric(8,2) not null default 0,
  daily_duration_minutes integer not null default 0,
  daily_run_distance_km numeric(8,2) not null default 0,
  daily_work_kj numeric(10,2) not null default 0,
  session_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (athlete_id, load_date)
);

create index if not exists training_load_daily_athlete_date_idx
on training_load_daily (athlete_id, load_date desc);

create table if not exists training_load_metrics (
  athlete_id uuid not null references athletes(id) on delete cascade,
  metric_date date not null,
  daily_tss numeric(8,2) not null default 0,
  ctl numeric(8,2) not null default 0,
  atl numeric(8,2) not null default 0,
  tsb numeric(8,2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (athlete_id, metric_date)
);

create index if not exists training_load_metrics_athlete_date_idx
on training_load_metrics (athlete_id, metric_date desc);

create table if not exists blog_articles (
  id uuid primary key default gen_random_uuid(),
  slug text not null,
  title text not null,
  excerpt text,
  category text not null default 'Artigo',
  content text not null,
  status text not null default 'draft' check (status in ('draft', 'published')),
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

alter table blog_articles add column if not exists slug text;
alter table blog_articles add column if not exists title text;
alter table blog_articles add column if not exists excerpt text;
alter table blog_articles add column if not exists category text;
alter table blog_articles add column if not exists content text;
alter table blog_articles add column if not exists status text;
alter table blog_articles add column if not exists published_at timestamptz;
alter table blog_articles add column if not exists created_at timestamptz;
alter table blog_articles add column if not exists updated_at timestamptz;
alter table blog_articles add column if not exists deleted_at timestamptz;

update blog_articles set slug = coalesce(nullif(slug, ''), id::text) where slug is null or slug = '';
update blog_articles set title = coalesce(nullif(title, ''), 'Sem titulo') where title is null or title = '';
update blog_articles set category = coalesce(nullif(category, ''), 'Artigo') where category is null or category = '';
update blog_articles set content = coalesce(content, '') where content is null;
update blog_articles set status = 'draft' where status is null or status not in ('draft', 'published');
update blog_articles set created_at = now() where created_at is null;
update blog_articles set updated_at = now() where updated_at is null;

alter table blog_articles alter column slug set not null;
alter table blog_articles alter column title set not null;
alter table blog_articles alter column category set default 'Artigo';
alter table blog_articles alter column category set not null;
alter table blog_articles alter column content set not null;
alter table blog_articles alter column status set default 'draft';
alter table blog_articles alter column status set not null;
alter table blog_articles alter column created_at set default now();
alter table blog_articles alter column created_at set not null;
alter table blog_articles alter column updated_at set default now();
alter table blog_articles alter column updated_at set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'blog_articles_status_check'
      and conrelid = 'blog_articles'::regclass
  ) then
    alter table blog_articles
      add constraint blog_articles_status_check
      check (status in ('draft', 'published'));
  end if;
end $$;

alter table blog_articles
  drop constraint if exists blog_articles_slug_key;

drop index if exists blog_articles_slug_uidx;

create unique index if not exists blog_articles_slug_uidx
on blog_articles (slug)
where deleted_at is null;

create index if not exists blog_articles_public_listing_idx
on blog_articles (published_at desc)
where deleted_at is null and status = 'published';

create index if not exists blog_articles_updated_at_idx
on blog_articles (updated_at desc);

drop trigger if exists set_blog_articles_updated_at on blog_articles;
create trigger set_blog_articles_updated_at
before update on blog_articles
for each row
execute function set_updated_at();

-- Dynamic site content managed via /admin

create table if not exists site_metadata (
  key text primary key,
  value text,
  updated_at timestamptz not null default now()
);

create table if not exists site_metrics (
  id uuid primary key default gen_random_uuid(),
  sort_order integer not null default 0,
  value text,
  label text,
  active boolean not null default true,
  updated_at timestamptz not null default now()
);

create table if not exists site_reviews (
  id uuid primary key default gen_random_uuid(),
  sort_order integer not null default 0,
  name text,
  stars integer not null default 5 check (stars between 1 and 5),
  text text,
  meta text,
  review_date date,
  active boolean not null default true,
  updated_at timestamptz not null default now()
);

create table if not exists site_links (
  key text primary key,
  url text not null,
  updated_at timestamptz not null default now()
);

create index if not exists site_metrics_sort_idx
on site_metrics (sort_order asc, updated_at desc);

create index if not exists site_reviews_sort_idx
on site_reviews (sort_order asc, updated_at desc);

drop trigger if exists set_site_metadata_updated_at on site_metadata;
create trigger set_site_metadata_updated_at
before update on site_metadata
for each row
execute function set_updated_at();

drop trigger if exists set_site_metrics_updated_at on site_metrics;
create trigger set_site_metrics_updated_at
before update on site_metrics
for each row
execute function set_updated_at();

drop trigger if exists set_site_reviews_updated_at on site_reviews;
create trigger set_site_reviews_updated_at
before update on site_reviews
for each row
execute function set_updated_at();

drop trigger if exists set_site_links_updated_at on site_links;
create trigger set_site_links_updated_at
before update on site_links
for each row
execute function set_updated_at();

-- Long-term auth and operations foundation

create table if not exists app_roles (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text,
  created_at timestamptz not null default now()
);

insert into app_roles (name, description)
values
  ('admin', 'Full operational access to admin platform'),
  ('coach', 'Coach access to athlete portfolio')
on conflict (name) do nothing;

create table if not exists user_roles (
  id uuid primary key default gen_random_uuid(),
  identity_id text not null,
  role_id uuid not null references app_roles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (identity_id, role_id)
);

create index if not exists user_roles_identity_idx
on user_roles (identity_id);

create table if not exists coaches (
  id uuid primary key default gen_random_uuid(),
  identity_id text not null unique,
  email text not null unique,
  name text not null,
  timezone text not null default 'Europe/Lisbon',
  capacity_limit integer,
  default_followup_type text not null default 'standard',
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists coaches_status_idx
on coaches (status)
where deleted_at is null;

drop trigger if exists set_coaches_updated_at on coaches;
create trigger set_coaches_updated_at
before update on coaches
for each row
execute function set_updated_at();

create table if not exists training_events (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  event_date date,
  event_location text,
  event_description text,
  calendar_visible boolean not null default true,
  calendar_highlight_rank integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists training_events_date_idx
on training_events (event_date)
where deleted_at is null;

create index if not exists training_events_rank_idx
on training_events (calendar_highlight_rank, event_date)
where deleted_at is null and calendar_visible = true;

create unique index if not exists training_events_identity_uidx
on training_events (lower(name), event_date, lower(coalesce(event_location, '')))
where deleted_at is null;

drop trigger if exists set_training_events_updated_at on training_events;
create trigger set_training_events_updated_at
before update on training_events
for each row
execute function set_updated_at();

create table if not exists training_programs (
  id uuid primary key default gen_random_uuid(),
  external_source text not null default 'trainingpeaks',
  external_id text,
  name text not null,
  commercial_description text,
  technical_description text,
  description text,
  image_url text,
  duration_weeks integer not null check (duration_weeks > 0),
  price_cents integer not null default 0,
  recurring_price_monthly_cents integer check (recurring_price_monthly_cents is null or recurring_price_monthly_cents >= 0),
  recurring_price_quarterly_cents integer check (recurring_price_quarterly_cents is null or recurring_price_quarterly_cents >= 0),
  recurring_price_annual_cents integer check (recurring_price_annual_cents is null or recurring_price_annual_cents >= 0),
  currency text not null default 'EUR',
  stripe_product_id text,
  stripe_price_id text,
  stripe_price_id_monthly text,
  stripe_price_id_quarterly text,
  stripe_price_id_annual text,
  billing_type text not null default 'one_time' check (billing_type in ('one_time', 'recurring')),
  event_id uuid references training_events(id) on delete set null,
  start_date date,
  status text not null default 'draft' check (status in ('draft', 'active', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists training_programs_event_idx
on training_programs (event_id)
where deleted_at is null;

alter table training_programs drop column if exists followup_type;
alter table training_programs drop column if exists is_scheduled_template;

create unique index if not exists training_programs_external_uidx
on training_programs (external_source, external_id)
where external_id is not null and deleted_at is null;

create index if not exists training_programs_status_idx
on training_programs (status)
where deleted_at is null;

create index if not exists training_programs_billing_type_idx
on training_programs (billing_type)
where deleted_at is null;

create unique index if not exists training_programs_stripe_price_uidx
on training_programs (stripe_price_id)
where stripe_price_id is not null and deleted_at is null;

create unique index if not exists training_programs_stripe_price_monthly_uidx
on training_programs (stripe_price_id_monthly)
where stripe_price_id_monthly is not null and deleted_at is null;

create unique index if not exists training_programs_stripe_price_quarterly_uidx
on training_programs (stripe_price_id_quarterly)
where stripe_price_id_quarterly is not null and deleted_at is null;

create unique index if not exists training_programs_stripe_price_annual_uidx
on training_programs (stripe_price_id_annual)
where stripe_price_id_annual is not null and deleted_at is null;

drop trigger if exists set_training_programs_updated_at on training_programs;
create trigger set_training_programs_updated_at
before update on training_programs
for each row
execute function set_updated_at();

create table if not exists program_assignments (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references athletes(id) on delete cascade,
  coach_id uuid not null references coaches(id) on delete restrict,
  training_program_id uuid not null references training_programs(id) on delete restrict,
  start_date date not null,
  duration_weeks integer not null check (duration_weeks > 0),
  computed_end_date date generated always as (
    (start_date + ((duration_weeks * 7 - 1) * interval '1 day'))::date
  ) stored,
  actual_end_date date,
  status text not null default 'scheduled' check (status in ('scheduled', 'active', 'paused', 'completed', 'cancelled')),
  price_cents_snapshot integer not null default 0,
  currency_snapshot text not null default 'EUR',
  followup_type_snapshot text not null default 'standard',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists program_assignments_athlete_idx
on program_assignments (athlete_id, start_date desc)
where deleted_at is null;

create index if not exists program_assignments_coach_idx
on program_assignments (coach_id, status)
where deleted_at is null;

create index if not exists program_assignments_program_idx
on program_assignments (training_program_id)
where deleted_at is null;

create unique index if not exists program_assignments_single_active_by_athlete_uidx
on program_assignments (athlete_id)
where deleted_at is null and status in ('scheduled', 'active', 'paused');

drop trigger if exists set_program_assignments_updated_at on program_assignments;
create trigger set_program_assignments_updated_at
before update on program_assignments
for each row
execute function set_updated_at();

create table if not exists stripe_purchases (
  id uuid primary key default gen_random_uuid(),
  stripe_session_id text unique,
  stripe_customer_id text,
  stripe_payment_intent_id text,
  stripe_subscription_id text,
  identity_id text not null,
  program_id uuid not null references training_programs(id) on delete restrict,
  email text,
  amount_cents integer not null default 0,
  currency text not null default 'EUR',
  billing_type text not null default 'one_time' check (billing_type in ('one_time', 'recurring')),
  status text not null default 'pending' check (status in ('pending', 'paid', 'refunded', 'payment_failed', 'cancelled')),
  source text not null default 'stripe',
  paid_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists stripe_purchases_identity_program_idx
on stripe_purchases (identity_id, program_id, status, created_at desc);

create index if not exists stripe_purchases_subscription_idx
on stripe_purchases (stripe_subscription_id)
where stripe_subscription_id is not null;

create index if not exists stripe_purchases_payment_intent_idx
on stripe_purchases (stripe_payment_intent_id)
where stripe_payment_intent_id is not null;

create index if not exists stripe_purchases_program_idx
on stripe_purchases (program_id, status, created_at desc);

drop trigger if exists set_stripe_purchases_updated_at on stripe_purchases;
create trigger set_stripe_purchases_updated_at
before update on stripe_purchases
for each row
execute function set_updated_at();

-- Meta Lead Ads integration

create table if not exists meta_leads (
  id uuid primary key default gen_random_uuid(),
  leadgen_id text unique,
  form_id text,
  form_name text,
  page_id text,
  ad_id text,
  ad_name text,
  name text,
  email text,
  phone text,
  field_data jsonb not null default '[]'::jsonb,
  raw_payload jsonb,
  status text not null default 'new' check (status in ('new', 'contacted', 'qualified', 'disqualified')),
  notes text,
  received_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists meta_leads_status_idx
on meta_leads (status, received_at desc);

create index if not exists meta_leads_received_at_idx
on meta_leads (received_at desc);

drop trigger if exists set_meta_leads_updated_at on meta_leads;
create trigger set_meta_leads_updated_at
before update on meta_leads
for each row
execute function set_updated_at();

-- Unified lead capture

create table if not exists leads_central (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid references athletes(id) on delete set null,
  identity_id text,
  meta_lead_id uuid references meta_leads(id) on delete set null,
  source text not null default 'manual' check (source in (
    'planocorrida_landing',
    'planocorrida_form',
    'planocorrida_generated',
    'meta_ads',
    'coach_landing',
    'onboarding',
    'manual'
  )),
  last_source text not null default 'manual' check (last_source in (
    'planocorrida_landing',
    'planocorrida_form',
    'planocorrida_generated',
    'meta_ads',
    'coach_landing',
    'onboarding',
    'manual'
  )),
  source_ref_id text,
  email text,
  email_normalized text,
  phone text,
  phone_normalized text,
  full_name text,
  consent_email boolean not null default false,
  consent_whatsapp boolean not null default false,
  consent_version text,
  consented_at timestamptz,
  funnel_stage text not null default 'landing' check (funnel_stage in (
    'landing',
    'landing_submitted',
    'meta_received',
    'onboarding_submitted',
    'plan_generated',
    'coach_application',
    'qualified',
    'converted',
    'disqualified'
  )),
  lead_status text not null default 'new' check (lead_status in (
    'new',
    'contacted',
    'qualified',
    'converted',
    'disqualified'
  )),
  lead_score integer not null default 0,
  last_activity_at timestamptz not null default now(),
  last_activity_type text,
  attribution jsonb not null default '{}'::jsonb,
  profile jsonb not null default '{}'::jsonb,
  raw_payload jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table leads_central add column if not exists athlete_id uuid references athletes(id) on delete set null;
alter table leads_central add column if not exists identity_id text;
alter table leads_central add column if not exists meta_lead_id uuid references meta_leads(id) on delete set null;
alter table leads_central add column if not exists source text;
alter table leads_central add column if not exists last_source text;
alter table leads_central add column if not exists source_ref_id text;
alter table leads_central add column if not exists email text;
alter table leads_central add column if not exists email_normalized text;
alter table leads_central add column if not exists phone text;
alter table leads_central add column if not exists phone_normalized text;
alter table leads_central add column if not exists full_name text;
alter table leads_central add column if not exists consent_email boolean not null default false;
alter table leads_central add column if not exists consent_whatsapp boolean not null default false;
alter table leads_central add column if not exists consent_version text;
alter table leads_central add column if not exists consented_at timestamptz;
alter table leads_central add column if not exists funnel_stage text;
alter table leads_central add column if not exists lead_status text;
alter table leads_central add column if not exists lead_score integer not null default 0;
alter table leads_central add column if not exists last_activity_at timestamptz not null default now();
alter table leads_central add column if not exists last_activity_type text;
alter table leads_central add column if not exists attribution jsonb not null default '{}'::jsonb;
alter table leads_central add column if not exists profile jsonb not null default '{}'::jsonb;
alter table leads_central add column if not exists raw_payload jsonb;

update leads_central
set source = coalesce(nullif(source, ''), 'manual'),
    last_source = coalesce(nullif(last_source, ''), coalesce(nullif(source, ''), 'manual')),
    funnel_stage = coalesce(nullif(funnel_stage, ''), 'landing'),
    lead_status = coalesce(nullif(lead_status, ''), 'new'),
    last_activity_at = coalesce(last_activity_at, now()),
    attribution = coalesce(attribution, '{}'::jsonb),
    profile = coalesce(profile, '{}'::jsonb),
    lead_score = coalesce(lead_score, 0),
    consent_email = coalesce(consent_email, false),
    consent_whatsapp = coalesce(consent_whatsapp, false);

alter table leads_central alter column source set default 'manual';
alter table leads_central alter column source set not null;
alter table leads_central alter column last_source set default 'manual';
alter table leads_central alter column last_source set not null;
alter table leads_central alter column funnel_stage set default 'landing';
alter table leads_central alter column funnel_stage set not null;
alter table leads_central alter column lead_status set default 'new';
alter table leads_central alter column lead_status set not null;

create unique index if not exists leads_central_identity_uidx
on leads_central (identity_id)
where identity_id is not null;

create unique index if not exists leads_central_meta_lead_uidx
on leads_central (meta_lead_id)
where meta_lead_id is not null;

create unique index if not exists leads_central_source_ref_uidx
on leads_central (source, source_ref_id)
where source_ref_id is not null;

create index if not exists leads_central_email_idx
on leads_central (email_normalized, last_activity_at desc)
where email_normalized is not null;

create index if not exists leads_central_phone_idx
on leads_central (phone_normalized, last_activity_at desc)
where phone_normalized is not null;

create index if not exists leads_central_funnel_idx
on leads_central (funnel_stage, last_activity_at desc);

create index if not exists leads_central_status_idx
on leads_central (lead_status, last_activity_at desc);

drop trigger if exists set_leads_central_updated_at on leads_central;
create trigger set_leads_central_updated_at
before update on leads_central
for each row
execute function set_updated_at();

-- Onboarding intake now lives in athletes (onboarding_answers + structured columns)

-- AI control center (Phase 1)

create table if not exists ai_prompts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  feature text not null,
  type text not null check (type in ('system', 'user')),
  content text not null,
  version integer not null default 1,
  is_active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ai_prompts_feature_type_active_idx
on ai_prompts (feature, type, is_active);

create unique index if not exists ai_prompts_single_active_per_slot_uidx
on ai_prompts (feature, type)
where is_active = true;

drop trigger if exists set_ai_prompts_updated_at on ai_prompts;
create trigger set_ai_prompts_updated_at
before update on ai_prompts
for each row
execute function set_updated_at();

-- ============================================================
-- Strength Training Planning & Tracking (Phase 1)
-- ============================================================

-- 1. exercises — Master exercise catalog
create table if not exists exercises (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  category text not null check (category in (
    'main_movements', 'core', 'hypertrophy', 'rfd', 'mobility_activation'
  )),
  subcategory text not null,
  video_url text,
  description text,
  default_weight_per_side boolean not null default false,
  default_each_side boolean not null default false,
  default_tempo text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists exercises_category_subcategory_idx
on exercises (category, subcategory);

drop trigger if exists set_exercises_updated_at on exercises;
create trigger set_exercises_updated_at
before update on exercises
for each row
execute function set_updated_at();

-- 2. strength_plans — Mesocycle plan per athlete
create table if not exists strength_plans (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references athletes(id) on delete cascade,
  name text not null,
  total_weeks integer not null check (total_weeks >= 1),
  start_date date,
  status text not null default 'draft' check (status in ('draft', 'active', 'completed', 'archived')),
  created_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists strength_plans_athlete_status_idx
on strength_plans (athlete_id, status)
where status in ('draft', 'active');

create unique index if not exists strength_plans_single_active_uidx
on strength_plans (athlete_id)
where status = 'active';

drop trigger if exists set_strength_plans_updated_at on strength_plans;
create trigger set_strength_plans_updated_at
before update on strength_plans
for each row
execute function set_updated_at();

-- 3. strength_plan_exercises — Exercise slot per day/section
create table if not exists strength_plan_exercises (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references strength_plans(id) on delete cascade,
  day_number integer not null check (day_number between 1 and 7),
  section text not null check (section in (
    'warm_up', 'plyos_speed', 'main', 'conditioning', 'observations'
  )),
  superset_group text,
  exercise_order integer not null,
  exercise_id uuid not null references exercises(id) on delete restrict,
  each_side boolean not null default false,
  weight_per_side boolean not null default false,
  plyo_mechanical_load text check (plyo_mechanical_load in ('high', 'medium', 'low') or plyo_mechanical_load is null),
  rm_percent_increase_per_week numeric(5,4),
  created_at timestamptz not null default now()
);

create unique index if not exists strength_plan_exercises_slot_uidx
on strength_plan_exercises (plan_id, day_number, section, exercise_order);

create index if not exists strength_plan_exercises_plan_day_idx
on strength_plan_exercises (plan_id, day_number);

-- 4. strength_prescriptions — Per exercise per week
create table if not exists strength_prescriptions (
  id uuid primary key default gen_random_uuid(),
  plan_exercise_id uuid not null references strength_plan_exercises(id) on delete cascade,
  week_number integer not null check (week_number >= 1),
  prescription_type text not null default 'reps' check (prescription_type in ('reps', 'duration')),
  sets integer not null default 1,
  reps integer,
  duration_seconds integer,
  rest_seconds integer,
  rir integer,
  tempo text,
  gct text check (gct in ('altura', 'rápido', 'intermédio') or gct is null),
  method text not null default 'standard' check (method in (
    'standard', 'amrap', 'drop_set', 'rest_pause', 'cluster', 'myo_reps', 'isometric'
  )),
  rm_percent_override numeric(5,4),
  load_override_kg numeric(7,2),
  coach_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists strength_prescriptions_exercise_week_uidx
on strength_prescriptions (plan_exercise_id, week_number);

drop trigger if exists set_strength_prescriptions_updated_at on strength_prescriptions;
create trigger set_strength_prescriptions_updated_at
before update on strength_prescriptions
for each row
execute function set_updated_at();

-- 5. strength_plan_phase_notes — Coach notes per section per week
create table if not exists strength_plan_phase_notes (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references strength_plans(id) on delete cascade,
  day_number integer not null,
  section text not null,
  week_number integer not null,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists strength_plan_phase_notes_slot_uidx
on strength_plan_phase_notes (plan_id, day_number, section, week_number);

drop trigger if exists set_strength_plan_phase_notes_updated_at on strength_plan_phase_notes;
create trigger set_strength_plan_phase_notes_updated_at
before update on strength_plan_phase_notes
for each row
execute function set_updated_at();

-- 6. athlete_exercise_1rm — 1RM history (latest = current)
create table if not exists athlete_exercise_1rm (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references athletes(id) on delete cascade,
  exercise_id uuid not null references exercises(id) on delete cascade,
  value_kg numeric(7,2) not null,
  method text not null default 'manual' check (method in ('tested', 'estimated_epley', 'manual')),
  source text not null default 'coach_entry' check (source in ('coach_entry', 'auto_from_log')),
  source_log_id uuid,
  tested_at date not null default current_date,
  created_at timestamptz not null default now()
);

create index if not exists athlete_exercise_1rm_lookup_idx
on athlete_exercise_1rm (athlete_id, exercise_id, created_at desc);

-- 7. strength_log_sets — Athlete execution per set
create table if not exists strength_log_sets (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references athletes(id) on delete cascade,
  plan_exercise_id uuid references strength_plan_exercises(id) on delete set null,
  plan_id uuid not null references strength_plans(id) on delete cascade,
  week_number integer not null,
  day_number integer not null,
  session_date date not null default current_date,
  set_number integer not null default 1,
  reps integer,
  load_kg numeric(7,2),
  rir integer,
  duration_seconds integer,
  method text not null default 'standard' check (method in (
    'standard', 'amrap', 'drop_set', 'rest_pause', 'cluster', 'myo_reps', 'isometric'
  )),
  notes text,
  submitted_at timestamptz not null default now(),
  submitted_by_identity_id text not null
);

create unique index if not exists strength_log_sets_entry_uidx
on strength_log_sets (plan_exercise_id, week_number, session_date, set_number)
where plan_exercise_id is not null;

create index if not exists strength_log_sets_athlete_plan_idx
on strength_log_sets (athlete_id, plan_id, week_number);

create index if not exists strength_log_sets_session_date_idx
on strength_log_sets (athlete_id, session_date desc);

-- 8. ALTER athletes — add strength log detail preference
alter table athletes add column if not exists strength_log_detail text
  default 'exercise' check (strength_log_detail in ('exercise', 'set'));

create table if not exists ai_prompt_versions (
  id uuid primary key default gen_random_uuid(),
  prompt_id uuid not null references ai_prompts(id) on delete cascade,
  version integer not null,
  content text not null,
  notes text,
  created_at timestamptz not null default now()
);

create unique index if not exists ai_prompt_versions_prompt_version_uidx
on ai_prompt_versions (prompt_id, version);

create index if not exists ai_prompt_versions_prompt_created_idx
on ai_prompt_versions (prompt_id, created_at desc);

create table if not exists ai_settings (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  value text not null default '',
  updated_at timestamptz not null default now()
);

drop trigger if exists set_ai_settings_updated_at on ai_settings;
create trigger set_ai_settings_updated_at
before update on ai_settings
for each row
execute function set_updated_at();

create table if not exists ai_logs (
  id uuid primary key default gen_random_uuid(),
  feature text not null,
  athlete_id uuid references athletes(id) on delete set null,
  model text,
  system_prompt_snapshot text,
  user_prompt_snapshot text,
  input_data jsonb,
  output_data jsonb,
  tokens_estimated integer,
  duration_ms integer,
  success boolean not null default false,
  error text,
  created_at timestamptz not null default now()
);

create index if not exists ai_logs_feature_created_idx
on ai_logs (feature, created_at desc);

create index if not exists ai_logs_athlete_created_idx
on ai_logs (athlete_id, created_at desc);

create index if not exists ai_logs_success_created_idx
on ai_logs (success, created_at desc);

insert into ai_settings (key, value)
values
  ('tone', 'motivacional'),
  ('language', 'pt-PT'),
  ('persona', 'Coach Linea Iber Training'),
  ('max_kb_chars', '8000')
on conflict (key) do nothing;

do $$
declare
  weekly_system_exists boolean;
  coach_system_exists boolean;
begin
  select exists (
    select 1 from ai_prompts where feature = 'weekly_questions' and type = 'system' and is_active = true
  ) into weekly_system_exists;

  if not weekly_system_exists then
    insert into ai_prompts (name, feature, type, content, version, is_active, notes)
    values (
      'Weekly Questions - System',
      'weekly_questions',
      'system',
      'Tu es um treinador de endurance + forca. Responde em Portugues europeu. Gera uma analise curta da semana e 4 perguntas estrategicas para o atleta. As perguntas devem confrontar percepcao subjetiva com dados objetivos. ATENCAO: para treino de forca, NAO uses classificacao automatica done_not_planned do CSV. Para forca, usa apenas os contadores de confirmacao manual fornecidos pelo coach. Se houver confirmacao manual de forca, o resumo deve mencionar esses contadores. Se houver confirmacao manual de forca, inclui pelo menos uma pergunta especifica de forca. Devolve apenas JSON valido com formato: {"summary": string, "questions": string[]}.',
      1,
      true,
      'Seed inicial Phase 1'
    );
  end if;

  select exists (
    select 1 from ai_prompts where feature = 'coach_draft' and type = 'system' and is_active = true
  ) into coach_system_exists;

  if not coach_system_exists then
    insert into ai_prompts (name, feature, type, content, version, is_active, notes)
    values (
      'Coach Draft - System',
      'coach_draft',
      'system',
      'Tu es um treinador de endurance + forca. Responde em Portugues europeu. Confronta os dados de treino da semana com as respostas do atleta. Devolve apenas JSON valido com formato: {"alignment": string, "adjustments": string[], "final_feedback": string}.',
      1,
      true,
      'Seed inicial Phase 1'
    );
  end if;
end $$;

-- ============================================================
-- Auto-coach assignment & Admin Notifications
-- ============================================================

-- Allow programs to declare a default coach (auto-assigned on purchase)
alter table training_programs add column if not exists default_coach_identity_id text;

-- Allow assignments without a coach (self-serve programs)
alter table program_assignments alter column coach_id drop not null;

-- Admin notifications — system events requiring operator awareness
create table if not exists admin_notifications (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in (
    'coach_auto_replaced',
    'athlete_no_coach',
    'payment_failed',
    'system'
  )),
  severity text not null default 'info' check (severity in ('info', 'warning', 'error')),
  title text not null,
  message text not null,
  athlete_id uuid references athletes(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  dismissed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists admin_notifications_unread_idx
on admin_notifications (created_at desc)
where read_at is null and dismissed_at is null;

create index if not exists admin_notifications_created_idx
on admin_notifications (created_at desc);
