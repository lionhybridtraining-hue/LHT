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
