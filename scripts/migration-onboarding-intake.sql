create table if not exists onboarding_intake (
  id uuid primary key default gen_random_uuid(),
  identity_id text not null unique,
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

create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_onboarding_intake_updated_at on onboarding_intake;
create trigger set_onboarding_intake_updated_at
before update on onboarding_intake
for each row
execute function set_updated_at();
