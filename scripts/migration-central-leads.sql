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
    'stripe',
    'coach_landing',
    'onboarding',
    'manual'
  )),
  last_source text not null default 'manual' check (last_source in (
    'planocorrida_landing',
    'planocorrida_form',
    'planocorrida_generated',
    'meta_ads',
    'stripe',
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
    'app_installed',
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

create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_leads_central_updated_at on leads_central;
create trigger set_leads_central_updated_at
before update on leads_central
for each row
execute function set_updated_at();