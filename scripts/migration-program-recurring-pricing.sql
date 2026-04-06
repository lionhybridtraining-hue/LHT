-- Migration: add recurring interval pricing for training_programs

alter table training_programs
  add column if not exists recurring_price_monthly_cents integer,
  add column if not exists recurring_price_quarterly_cents integer,
  add column if not exists recurring_price_annual_cents integer,
  add column if not exists stripe_price_id_monthly text,
  add column if not exists stripe_price_id_quarterly text,
  add column if not exists stripe_price_id_annual text;

-- Add safety checks (idempotent pattern for check constraints)
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'training_programs_recurring_price_monthly_cents_check'
  ) then
    alter table training_programs
      add constraint training_programs_recurring_price_monthly_cents_check
      check (recurring_price_monthly_cents is null or recurring_price_monthly_cents >= 0);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'training_programs_recurring_price_quarterly_cents_check'
  ) then
    alter table training_programs
      add constraint training_programs_recurring_price_quarterly_cents_check
      check (recurring_price_quarterly_cents is null or recurring_price_quarterly_cents >= 0);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'training_programs_recurring_price_annual_cents_check'
  ) then
    alter table training_programs
      add constraint training_programs_recurring_price_annual_cents_check
      check (recurring_price_annual_cents is null or recurring_price_annual_cents >= 0);
  end if;
end
$$;

-- Backfill monthly from existing recurring programs where needed
update training_programs
set recurring_price_monthly_cents = price_cents
where billing_type = 'recurring'
  and recurring_price_monthly_cents is null;

update training_programs
set stripe_price_id_monthly = stripe_price_id
where billing_type = 'recurring'
  and stripe_price_id is not null
  and stripe_price_id_monthly is null;

create unique index if not exists training_programs_stripe_price_monthly_uidx
on training_programs (stripe_price_id_monthly)
where stripe_price_id_monthly is not null and deleted_at is null;

create unique index if not exists training_programs_stripe_price_quarterly_uidx
on training_programs (stripe_price_id_quarterly)
where stripe_price_id_quarterly is not null and deleted_at is null;

create unique index if not exists training_programs_stripe_price_annual_uidx
on training_programs (stripe_price_id_annual)
where stripe_price_id_annual is not null and deleted_at is null;
