-- Switch AER strength main flow to duration variants (4W/5W/6W)
-- 1) Archive original 1-week templates so only variants appear in active listings.
-- 2) Associate all related AER strength plans to the target training program.

BEGIN;

DO $$
DECLARE
  v_target_program_id uuid := '3f49bfa5-4ba7-464d-a972-7b488293127e';
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM training_programs tp
    WHERE tp.id = v_target_program_id
      AND tp.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Target training program not found or deleted: %', v_target_program_id;
  END IF;

  -- Keep variants active in main flow and tie all related plans to target program.
  UPDATE strength_plans sp
  SET training_program_id = v_target_program_id,
      status = CASE
        WHEN sp.name ~ ' - (4W|5W|6W)$' THEN 'active'
        WHEN sp.name IN (
          'AER - Full Body Push',
          'AER - Full Body Pull',
          'AER - Lower Body A',
          'AER - Lower Body B',
          'AER - Lower Body C',
          'AER - Full Body Power'
        )
        AND coalesce(sp.total_weeks, 0) = 1 THEN 'archived'
        ELSE sp.status
      END,
      updated_at = now()
  WHERE sp.name ~ '^AER - (Full Body Push|Full Body Pull|Lower Body A|Lower Body B|Lower Body C|Full Body Power)( - (4W|5W|6W))?$';

  -- Safety rule: any active base-name (no suffix) plan should be archived.
  UPDATE strength_plans sp
  SET status = 'archived',
      training_program_id = v_target_program_id,
      updated_at = now()
  WHERE sp.name IN (
      'AER - Full Body Push',
      'AER - Full Body Pull',
      'AER - Lower Body A',
      'AER - Lower Body B',
      'AER - Lower Body C',
      'AER - Full Body Power'
    )
    AND sp.status <> 'archived';
END $$;

COMMIT;
