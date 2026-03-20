create table if not exists onboarding_intake (
  id uuid primary key default gen_random_uuid(),
  identity_id text not null unique,
  email text not null,
  answers jsonb not null default '{}'::jsonb,
  submitted_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists onboarding_intake_submitted_idx
on onboarding_intake (submitted_at desc);

create index if not exists onboarding_intake_email_idx
on onboarding_intake (email);

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
