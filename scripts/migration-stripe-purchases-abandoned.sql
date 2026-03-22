-- Migration: add 'abandoned' status to stripe_purchases
-- Run this in Supabase SQL Editor.

alter table stripe_purchases
drop constraint if exists stripe_purchases_status_check;

alter table stripe_purchases
add constraint stripe_purchases_status_check
check (status in ('pending', 'paid', 'refunded', 'payment_failed', 'cancelled', 'abandoned'));
