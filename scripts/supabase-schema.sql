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
create index if not exists athletes_coach_identity_idx on athletes(coach_identity_id);
create unique index if not exists athletes_identity_uidx on athletes(identity_id) where identity_id is not null;
create index if not exists athletes_identity_idx on athletes(identity_id) where identity_id is not null;

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
  slug text not null unique,
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

create unique index if not exists blog_articles_slug_uidx
on blog_articles (slug);

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

create table if not exists training_programs (
  id uuid primary key default gen_random_uuid(),
  external_source text not null default 'trainingpeaks',
  external_id text,
  name text not null,
  description text,
  duration_weeks integer not null check (duration_weeks > 0),
  price_cents integer not null default 0,
  currency text not null default 'EUR',
  stripe_product_id text,
  stripe_price_id text,
  billing_type text not null default 'one_time' check (billing_type in ('one_time', 'recurring')),
  followup_type text not null default 'standard',
  status text not null default 'draft' check (status in ('draft', 'active', 'archived')),
  is_scheduled_template boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

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

-- Onboarding intake responses (authenticated athlete form)

create table if not exists onboarding_intake (
  id uuid primary key default gen_random_uuid(),
  identity_id text not null unique,
  athlete_id uuid references athletes(id) on delete set null,
  email text not null,
  phone text,
  full_name text,
  goal_distance numeric(6,2),
  weekly_frequency integer,
  experience_level text,
  consistency_level text,
  funnel_stage text not null default 'landing',
  plan_generated_at timestamptz,
  plan_storage text,
  answers jsonb not null default '{}'::jsonb,
  submitted_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table onboarding_intake add column if not exists athlete_id uuid references athletes(id) on delete set null;
alter table onboarding_intake add column if not exists phone text;
alter table onboarding_intake add column if not exists full_name text;
alter table onboarding_intake add column if not exists goal_distance numeric(6,2);
alter table onboarding_intake add column if not exists weekly_frequency integer;
alter table onboarding_intake add column if not exists experience_level text;
alter table onboarding_intake add column if not exists consistency_level text;
alter table onboarding_intake add column if not exists funnel_stage text;
alter table onboarding_intake add column if not exists plan_generated_at timestamptz;
alter table onboarding_intake add column if not exists plan_storage text;

update onboarding_intake
set funnel_stage = 'landing'
where funnel_stage is null;

alter table onboarding_intake alter column funnel_stage set default 'landing';
alter table onboarding_intake alter column funnel_stage set not null;

create index if not exists onboarding_intake_submitted_idx
on onboarding_intake (submitted_at desc);

create index if not exists onboarding_intake_athlete_idx
on onboarding_intake (athlete_id)
where athlete_id is not null;

create index if not exists onboarding_intake_email_idx
on onboarding_intake (email);

create index if not exists onboarding_intake_phone_idx
on onboarding_intake (phone)
where phone is not null;

create index if not exists onboarding_intake_funnel_stage_idx
on onboarding_intake (funnel_stage, submitted_at desc);

create index if not exists onboarding_intake_plan_generated_idx
on onboarding_intake (plan_generated_at desc)
where plan_generated_at is not null;

drop trigger if exists set_onboarding_intake_updated_at on onboarding_intake;
create trigger set_onboarding_intake_updated_at
before update on onboarding_intake
for each row
execute function set_updated_at();

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
