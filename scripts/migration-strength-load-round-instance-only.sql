-- ============================================================
-- Migration: keep load_round only on strength_plan_instances
--
-- Drops legacy load_round from strength_plans so rounding lives
-- exclusively on athlete assignments / instances.
-- ============================================================

alter table strength_plans
  drop column if exists load_round;
