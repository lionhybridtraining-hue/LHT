alter table training_programs
add column if not exists stripe_product_id text,
add column if not exists stripe_price_id text,
add column if not exists billing_type text not null default 'one_time' check (billing_type in ('one_time', 'recurring'));

create index if not exists training_programs_billing_type_idx
on training_programs (billing_type)
where deleted_at is null;

create unique index if not exists training_programs_stripe_price_uidx
on training_programs (stripe_price_id)
where stripe_price_id is not null and deleted_at is null;
