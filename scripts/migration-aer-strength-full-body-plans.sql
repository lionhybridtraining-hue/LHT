-- Seed AER strength templates: Full Body Push and Full Body Pull
-- Idempotent migration: safe to re-run.

BEGIN;

CREATE TABLE IF NOT EXISTS strength_plan_day_labels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id uuid NOT NULL REFERENCES strength_plans(id) ON DELETE CASCADE,
  day_number integer NOT NULL CHECK (day_number >= 1 AND day_number <= 7),
  day_label text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (plan_id, day_number)
);

CREATE INDEX IF NOT EXISTS idx_strength_plan_day_labels_plan
  ON strength_plan_day_labels(plan_id, day_number);

DO $$
DECLARE
  v_program_id uuid;
  v_plan_push_id uuid;
  v_plan_pull_id uuid;
  v_exercise_id uuid;
  v_plan_exercise_id uuid;

  v_created_by CONSTANT text := 'migration-aer-strength-full-body-plans';

  -- Conditioning shared slot
  v_zone2_exercise_name CONSTANT text := 'Zone 2 Steady State (Low Impact)';
BEGIN
  -- Link to AER program when available.
  SELECT tp.id
    INTO v_program_id
  FROM training_programs tp
  WHERE lower(coalesce(tp.external_id, '')) = 'aer'
    AND tp.deleted_at IS NULL
  ORDER BY tp.created_at ASC
  LIMIT 1;

  -- ----------
  -- Exercises
  -- ----------
  -- PUSH
  INSERT INTO exercises (name, category, subcategory, description, default_tempo)
  VALUES ('Landmine Push Press', 'main_movements', 'upper_push', 'Explosive unilateral push press variation.', 'N-2-X-0')
  ON CONFLICT (name) DO UPDATE SET
    category = EXCLUDED.category,
    subcategory = EXCLUDED.subcategory,
    description = COALESCE(exercises.description, EXCLUDED.description),
    default_tempo = COALESCE(exercises.default_tempo, EXCLUDED.default_tempo),
    updated_at = now();

  INSERT INTO exercises (name, category, subcategory, description)
  VALUES ('Box Jumps', 'rfd', 'plyo_vertical', 'Bilateral vertical jump for power output.')
  ON CONFLICT (name) DO UPDATE SET
    category = EXCLUDED.category,
    subcategory = EXCLUDED.subcategory,
    description = COALESCE(exercises.description, EXCLUDED.description),
    updated_at = now();

  INSERT INTO exercises (name, category, subcategory, description)
  VALUES ('Extensive Split Stance Jumps', 'rfd', 'plyo_extensive', 'Extensive plyometric jumps in split stance pattern.')
  ON CONFLICT (name) DO UPDATE SET
    category = EXCLUDED.category,
    subcategory = EXCLUDED.subcategory,
    description = COALESCE(exercises.description, EXCLUDED.description),
    updated_at = now();

  INSERT INTO exercises (name, category, subcategory, description, default_tempo)
  VALUES ('BB Front Squat', 'main_movements', 'lower_push', 'Bilateral front squat with barbell.', '1-2-X-1')
  ON CONFLICT (name) DO UPDATE SET
    category = EXCLUDED.category,
    subcategory = EXCLUDED.subcategory,
    description = COALESCE(exercises.description, EXCLUDED.description),
    default_tempo = COALESCE(exercises.default_tempo, EXCLUDED.default_tempo),
    updated_at = now();

  INSERT INTO exercises (name, category, subcategory, description)
  VALUES ('Stir the Pot', 'core', 'anti_extension', 'Core anti-extension drill on Swiss ball.')
  ON CONFLICT (name) DO UPDATE SET
    category = EXCLUDED.category,
    subcategory = EXCLUDED.subcategory,
    description = COALESCE(exercises.description, EXCLUDED.description),
    updated_at = now();

  INSERT INTO exercises (name, category, subcategory, description, default_tempo)
  VALUES ('DB Bench Press', 'main_movements', 'upper_push', 'Horizontal dumbbell press.', '2-0-X-1')
  ON CONFLICT (name) DO UPDATE SET
    category = EXCLUDED.category,
    subcategory = EXCLUDED.subcategory,
    description = COALESCE(exercises.description, EXCLUDED.description),
    default_tempo = COALESCE(exercises.default_tempo, EXCLUDED.default_tempo),
    updated_at = now();

  INSERT INTO exercises (name, category, subcategory, description, default_each_side, default_tempo)
  VALUES ('RFE Split Squat', 'main_movements', 'lower_push_unilateral', 'Rear-foot elevated split squat.', true, '2-1-X-0')
  ON CONFLICT (name) DO UPDATE SET
    category = EXCLUDED.category,
    subcategory = EXCLUDED.subcategory,
    description = COALESCE(exercises.description, EXCLUDED.description),
    default_each_side = COALESCE(exercises.default_each_side, EXCLUDED.default_each_side),
    default_tempo = COALESCE(exercises.default_tempo, EXCLUDED.default_tempo),
    updated_at = now();

  INSERT INTO exercises (name, category, subcategory, description, default_tempo)
  VALUES ('Wall Tibialis Raises', 'hypertrophy', 'lower_leg_anterior', 'Tibialis raises against wall support.', '2-0-1-1')
  ON CONFLICT (name) DO UPDATE SET
    category = EXCLUDED.category,
    subcategory = EXCLUDED.subcategory,
    description = COALESCE(exercises.description, EXCLUDED.description),
    default_tempo = COALESCE(exercises.default_tempo, EXCLUDED.default_tempo),
    updated_at = now();

  INSERT INTO exercises (name, category, subcategory, description, default_each_side, default_tempo)
  VALUES ('Wall SL Bent Knee Calf Raise', 'hypertrophy', 'lower_leg_soleus', 'Single-leg bent-knee calf raise against wall support.', true, '2-0-1-1')
  ON CONFLICT (name) DO UPDATE SET
    category = EXCLUDED.category,
    subcategory = EXCLUDED.subcategory,
    description = COALESCE(exercises.description, EXCLUDED.description),
    default_each_side = COALESCE(exercises.default_each_side, EXCLUDED.default_each_side),
    default_tempo = COALESCE(exercises.default_tempo, EXCLUDED.default_tempo),
    updated_at = now();

  INSERT INTO exercises (name, category, subcategory, description, default_tempo)
  VALUES ('Wall Superman Tricep Extensions', 'hypertrophy', 'upper_push_accessory', 'Bodyweight wall-supported triceps extension.', '2-0-1-1')
  ON CONFLICT (name) DO UPDATE SET
    category = EXCLUDED.category,
    subcategory = EXCLUDED.subcategory,
    description = COALESCE(exercises.description, EXCLUDED.description),
    default_tempo = COALESCE(exercises.default_tempo, EXCLUDED.default_tempo),
    updated_at = now();

  -- PULL
  INSERT INTO exercises (name, category, subcategory, description, default_tempo)
  VALUES ('TB High Pull', 'main_movements', 'upper_pull_power', 'Trap-bar high pull for explosive intent.', '1-0-X-0')
  ON CONFLICT (name) DO UPDATE SET
    category = EXCLUDED.category,
    subcategory = EXCLUDED.subcategory,
    description = COALESCE(exercises.description, EXCLUDED.description),
    default_tempo = COALESCE(exercises.default_tempo, EXCLUDED.default_tempo),
    updated_at = now();

  INSERT INTO exercises (name, category, subcategory, description, default_each_side)
  VALUES ('SL Broad Jump w/ 2 Foot Landing', 'rfd', 'plyo_horizontal', 'Single-leg broad jump landing on two feet.', true)
  ON CONFLICT (name) DO UPDATE SET
    category = EXCLUDED.category,
    subcategory = EXCLUDED.subcategory,
    description = COALESCE(exercises.description, EXCLUDED.description),
    default_each_side = COALESCE(exercises.default_each_side, EXCLUDED.default_each_side),
    updated_at = now();

  INSERT INTO exercises (name, category, subcategory, description)
  VALUES ('Extensive Multidirectional Hops', 'rfd', 'plyo_extensive', 'Extensive multidirectional hop pattern.')
  ON CONFLICT (name) DO UPDATE SET
    category = EXCLUDED.category,
    subcategory = EXCLUDED.subcategory,
    description = COALESCE(exercises.description, EXCLUDED.description),
    updated_at = now();

  INSERT INTO exercises (name, category, subcategory, description, default_tempo)
  VALUES ('TB Deadlift', 'main_movements', 'lower_pull', 'Trap-bar deadlift.', '1-2-X-1')
  ON CONFLICT (name) DO UPDATE SET
    category = EXCLUDED.category,
    subcategory = EXCLUDED.subcategory,
    description = COALESCE(exercises.description, EXCLUDED.description),
    default_tempo = COALESCE(exercises.default_tempo, EXCLUDED.default_tempo),
    updated_at = now();

  INSERT INTO exercises (name, category, subcategory, description)
  VALUES ('Weighted Pallof Press', 'core', 'anti_rotation', 'Anti-rotation press pattern with external load.')
  ON CONFLICT (name) DO UPDATE SET
    category = EXCLUDED.category,
    subcategory = EXCLUDED.subcategory,
    description = COALESCE(exercises.description, EXCLUDED.description),
    updated_at = now();

  INSERT INTO exercises (name, category, subcategory, description, default_tempo)
  VALUES ('Chin Ups', 'main_movements', 'upper_pull', 'Vertical pulling chin-up pattern.', '2-0-X-1')
  ON CONFLICT (name) DO UPDATE SET
    category = EXCLUDED.category,
    subcategory = EXCLUDED.subcategory,
    description = COALESCE(exercises.description, EXCLUDED.description),
    default_tempo = COALESCE(exercises.default_tempo, EXCLUDED.default_tempo),
    updated_at = now();

  INSERT INTO exercises (name, category, subcategory, description, default_each_side, default_tempo)
  VALUES ('SL RDL', 'main_movements', 'lower_pull_unilateral', 'Single-leg Romanian deadlift.', true, '2-1-X-0')
  ON CONFLICT (name) DO UPDATE SET
    category = EXCLUDED.category,
    subcategory = EXCLUDED.subcategory,
    description = COALESCE(exercises.description, EXCLUDED.description),
    default_each_side = COALESCE(exercises.default_each_side, EXCLUDED.default_each_side),
    default_tempo = COALESCE(exercises.default_tempo, EXCLUDED.default_tempo),
    updated_at = now();

  INSERT INTO exercises (name, category, subcategory, description, default_each_side, default_tempo)
  VALUES ('SL Standing Calf Raise', 'hypertrophy', 'lower_leg_gastrocnemius', 'Single-leg standing calf raise.', true, '2-0-1-1')
  ON CONFLICT (name) DO UPDATE SET
    category = EXCLUDED.category,
    subcategory = EXCLUDED.subcategory,
    description = COALESCE(exercises.description, EXCLUDED.description),
    default_each_side = COALESCE(exercises.default_each_side, EXCLUDED.default_each_side),
    default_tempo = COALESCE(exercises.default_tempo, EXCLUDED.default_tempo),
    updated_at = now();

  INSERT INTO exercises (name, category, subcategory, description, default_tempo)
  VALUES ('Rope Facepull', 'hypertrophy', 'upper_pull_accessory', 'Cable rope face pull for posterior shoulder.', '2-0-1-1')
  ON CONFLICT (name) DO UPDATE SET
    category = EXCLUDED.category,
    subcategory = EXCLUDED.subcategory,
    description = COALESCE(exercises.description, EXCLUDED.description),
    default_tempo = COALESCE(exercises.default_tempo, EXCLUDED.default_tempo),
    updated_at = now();

  INSERT INTO exercises (name, category, subcategory, description, default_tempo)
  VALUES ('Rope Hammer Curl', 'hypertrophy', 'upper_pull_accessory', 'Cable rope hammer curl.', '2-0-1-1')
  ON CONFLICT (name) DO UPDATE SET
    category = EXCLUDED.category,
    subcategory = EXCLUDED.subcategory,
    description = COALESCE(exercises.description, EXCLUDED.description),
    default_tempo = COALESCE(exercises.default_tempo, EXCLUDED.default_tempo),
    updated_at = now();

  -- Shared conditioning slot
  INSERT INTO exercises (name, category, subcategory, description)
  VALUES (v_zone2_exercise_name, 'mobility_activation', 'conditioning', 'Optional low-impact Zone 2 steady-state cardio block.')
  ON CONFLICT (name) DO UPDATE SET
    category = EXCLUDED.category,
    subcategory = EXCLUDED.subcategory,
    description = COALESCE(exercises.description, EXCLUDED.description),
    updated_at = now();

  -- -----
  -- Plans
  -- -----
  SELECT sp.id INTO v_plan_push_id
  FROM strength_plans sp
  WHERE lower(sp.name) = lower('AER - Full Body Push')
    AND (
      (v_program_id IS NOT NULL AND sp.training_program_id = v_program_id)
      OR (v_program_id IS NULL AND sp.training_program_id IS NULL)
    )
  ORDER BY sp.created_at ASC
  LIMIT 1;

  IF v_plan_push_id IS NULL THEN
    INSERT INTO strength_plans (athlete_id, name, description, total_weeks, status, created_by, training_program_id)
    VALUES (
      NULL,
      'AER - Full Body Push',
      'Push-emphasis full body session: power + bilateral lower push + unilateral resistance.',
      1,
      'active',
      v_created_by,
      v_program_id
    )
    RETURNING id INTO v_plan_push_id;
  ELSE
    UPDATE strength_plans
    SET
      description = 'Push-emphasis full body session: power + bilateral lower push + unilateral resistance.',
      total_weeks = 1,
      status = 'active',
      training_program_id = COALESCE(v_program_id, training_program_id),
      updated_at = now()
    WHERE id = v_plan_push_id;
  END IF;

  SELECT sp.id INTO v_plan_pull_id
  FROM strength_plans sp
  WHERE lower(sp.name) = lower('AER - Full Body Pull')
    AND (
      (v_program_id IS NOT NULL AND sp.training_program_id = v_program_id)
      OR (v_program_id IS NULL AND sp.training_program_id IS NULL)
    )
  ORDER BY sp.created_at ASC
  LIMIT 1;

  IF v_plan_pull_id IS NULL THEN
    INSERT INTO strength_plans (athlete_id, name, description, total_weeks, status, created_by, training_program_id)
    VALUES (
      NULL,
      'AER - Full Body Pull',
      'Pull-emphasis full body session: power + bilateral lower pull + unilateral resistance.',
      1,
      'active',
      v_created_by,
      v_program_id
    )
    RETURNING id INTO v_plan_pull_id;
  ELSE
    UPDATE strength_plans
    SET
      description = 'Pull-emphasis full body session: power + bilateral lower pull + unilateral resistance.',
      total_weeks = 1,
      status = 'active',
      training_program_id = COALESCE(v_program_id, training_program_id),
      updated_at = now()
    WHERE id = v_plan_pull_id;
  END IF;

  -- Day labels
  INSERT INTO strength_plan_day_labels (plan_id, day_number, day_label)
  VALUES (v_plan_push_id, 1, 'Full Body Push')
  ON CONFLICT (plan_id, day_number) DO UPDATE
  SET day_label = EXCLUDED.day_label,
      updated_at = now();

  INSERT INTO strength_plan_day_labels (plan_id, day_number, day_label)
  VALUES (v_plan_pull_id, 1, 'Full Body Pull')
  ON CONFLICT (plan_id, day_number) DO UPDATE
  SET day_label = EXCLUDED.day_label,
      updated_at = now();

  -- ----------------
  -- Helper-like block
  -- ----------------

  -- PUSH main slots
  -- A1 Landmine Push Press
  SELECT id INTO v_exercise_id FROM exercises WHERE name = 'Landmine Push Press' LIMIT 1;
  INSERT INTO strength_plan_exercises (
    plan_id, day_number, section, superset_group, exercise_order,
    exercise_id, each_side, weight_per_side, plyo_mechanical_load, rm_percent_increase_per_week
  )
  VALUES (v_plan_push_id, 1, 'main', 'A', 1, v_exercise_id, false, false, NULL, 0)
  ON CONFLICT (plan_id, day_number, section, exercise_order) DO UPDATE
  SET superset_group = EXCLUDED.superset_group,
      exercise_id = EXCLUDED.exercise_id,
      each_side = EXCLUDED.each_side,
      weight_per_side = EXCLUDED.weight_per_side,
      plyo_mechanical_load = EXCLUDED.plyo_mechanical_load,
      rm_percent_increase_per_week = EXCLUDED.rm_percent_increase_per_week
  RETURNING id INTO v_plan_exercise_id;

  INSERT INTO strength_prescriptions (
    plan_exercise_id, week_number, prescription_type, sets, reps, duration_seconds,
    rest_seconds, rir, tempo, method, rm_percent_override
  )
  VALUES (v_plan_exercise_id, 1, 'reps', 3, 6, NULL, 15, 6, 'N-2-X-0', 'standard', 0.70)
  ON CONFLICT (plan_exercise_id, week_number) DO UPDATE
  SET prescription_type = EXCLUDED.prescription_type,
      sets = EXCLUDED.sets,
      reps = EXCLUDED.reps,
      duration_seconds = EXCLUDED.duration_seconds,
      rest_seconds = EXCLUDED.rest_seconds,
      rir = EXCLUDED.rir,
      tempo = EXCLUDED.tempo,
      method = EXCLUDED.method,
      rm_percent_override = EXCLUDED.rm_percent_override,
      updated_at = now();

  -- A2 Box Jumps
  SELECT id INTO v_exercise_id FROM exercises WHERE name = 'Box Jumps' LIMIT 1;
  INSERT INTO strength_plan_exercises (
    plan_id, day_number, section, superset_group, exercise_order,
    exercise_id, each_side, weight_per_side, plyo_mechanical_load, rm_percent_increase_per_week
  )
  VALUES (v_plan_push_id, 1, 'main', 'A', 2, v_exercise_id, false, false, 'medium', 0)
  ON CONFLICT (plan_id, day_number, section, exercise_order) DO UPDATE
  SET superset_group = EXCLUDED.superset_group,
      exercise_id = EXCLUDED.exercise_id,
      each_side = EXCLUDED.each_side,
      weight_per_side = EXCLUDED.weight_per_side,
      plyo_mechanical_load = EXCLUDED.plyo_mechanical_load,
      rm_percent_increase_per_week = EXCLUDED.rm_percent_increase_per_week
  RETURNING id INTO v_plan_exercise_id;

  INSERT INTO strength_prescriptions (
    plan_exercise_id, week_number, prescription_type, sets, reps, duration_seconds,
    rest_seconds, rir, tempo, method
  )
  VALUES (v_plan_exercise_id, 1, 'reps', 3, 4, NULL, 30, NULL, NULL, 'standard')
  ON CONFLICT (plan_exercise_id, week_number) DO UPDATE
  SET prescription_type = EXCLUDED.prescription_type,
      sets = EXCLUDED.sets,
      reps = EXCLUDED.reps,
      duration_seconds = EXCLUDED.duration_seconds,
      rest_seconds = EXCLUDED.rest_seconds,
      rir = EXCLUDED.rir,
      tempo = EXCLUDED.tempo,
      method = EXCLUDED.method,
      updated_at = now();

  -- A3 Extensive Split Stance Jumps
  SELECT id INTO v_exercise_id FROM exercises WHERE name = 'Extensive Split Stance Jumps' LIMIT 1;
  INSERT INTO strength_plan_exercises (
    plan_id, day_number, section, superset_group, exercise_order,
    exercise_id, each_side, weight_per_side, plyo_mechanical_load, rm_percent_increase_per_week
  )
  VALUES (v_plan_push_id, 1, 'main', 'A', 3, v_exercise_id, false, false, 'low', 0)
  ON CONFLICT (plan_id, day_number, section, exercise_order) DO UPDATE
  SET superset_group = EXCLUDED.superset_group,
      exercise_id = EXCLUDED.exercise_id,
      each_side = EXCLUDED.each_side,
      weight_per_side = EXCLUDED.weight_per_side,
      plyo_mechanical_load = EXCLUDED.plyo_mechanical_load,
      rm_percent_increase_per_week = EXCLUDED.rm_percent_increase_per_week
  RETURNING id INTO v_plan_exercise_id;

  INSERT INTO strength_prescriptions (
    plan_exercise_id, week_number, prescription_type, sets, reps, duration_seconds,
    rest_seconds, rir, tempo, method
  )
  VALUES (v_plan_exercise_id, 1, 'duration', 3, NULL, 20, 120, NULL, NULL, 'standard')
  ON CONFLICT (plan_exercise_id, week_number) DO UPDATE
  SET prescription_type = EXCLUDED.prescription_type,
      sets = EXCLUDED.sets,
      reps = EXCLUDED.reps,
      duration_seconds = EXCLUDED.duration_seconds,
      rest_seconds = EXCLUDED.rest_seconds,
      rir = EXCLUDED.rir,
      tempo = EXCLUDED.tempo,
      method = EXCLUDED.method,
      updated_at = now();

  -- B1 BB Front Squat
  SELECT id INTO v_exercise_id FROM exercises WHERE name = 'BB Front Squat' LIMIT 1;
  INSERT INTO strength_plan_exercises (
    plan_id, day_number, section, superset_group, exercise_order,
    exercise_id, each_side, weight_per_side, plyo_mechanical_load, rm_percent_increase_per_week
  )
  VALUES (v_plan_push_id, 1, 'main', 'B', 4, v_exercise_id, false, false, NULL, 0)
  ON CONFLICT (plan_id, day_number, section, exercise_order) DO UPDATE
  SET superset_group = EXCLUDED.superset_group,
      exercise_id = EXCLUDED.exercise_id,
      each_side = EXCLUDED.each_side,
      weight_per_side = EXCLUDED.weight_per_side,
      plyo_mechanical_load = EXCLUDED.plyo_mechanical_load,
      rm_percent_increase_per_week = EXCLUDED.rm_percent_increase_per_week
  RETURNING id INTO v_plan_exercise_id;

  INSERT INTO strength_prescriptions (
    plan_exercise_id, week_number, prescription_type, sets, reps, duration_seconds,
    rest_seconds, rir, tempo, method, rm_percent_override
  )
  VALUES (v_plan_exercise_id, 1, 'reps', 3, 8, NULL, 30, 2, '1-2-X-1', 'standard', 0.75)
  ON CONFLICT (plan_exercise_id, week_number) DO UPDATE
  SET prescription_type = EXCLUDED.prescription_type,
      sets = EXCLUDED.sets,
      reps = EXCLUDED.reps,
      duration_seconds = EXCLUDED.duration_seconds,
      rest_seconds = EXCLUDED.rest_seconds,
      rir = EXCLUDED.rir,
      tempo = EXCLUDED.tempo,
      method = EXCLUDED.method,
      rm_percent_override = EXCLUDED.rm_percent_override,
      updated_at = now();

  -- B2 Stir the Pot
  SELECT id INTO v_exercise_id FROM exercises WHERE name = 'Stir the Pot' LIMIT 1;
  INSERT INTO strength_plan_exercises (
    plan_id, day_number, section, superset_group, exercise_order,
    exercise_id, each_side, weight_per_side, plyo_mechanical_load, rm_percent_increase_per_week
  )
  VALUES (v_plan_push_id, 1, 'main', 'B', 5, v_exercise_id, false, false, NULL, 0)
  ON CONFLICT (plan_id, day_number, section, exercise_order) DO UPDATE
  SET superset_group = EXCLUDED.superset_group,
      exercise_id = EXCLUDED.exercise_id,
      each_side = EXCLUDED.each_side,
      weight_per_side = EXCLUDED.weight_per_side,
      plyo_mechanical_load = EXCLUDED.plyo_mechanical_load,
      rm_percent_increase_per_week = EXCLUDED.rm_percent_increase_per_week
  RETURNING id INTO v_plan_exercise_id;

  INSERT INTO strength_prescriptions (
    plan_exercise_id, week_number, prescription_type, sets, reps, duration_seconds,
    rest_seconds, rir, tempo, method
  )
  VALUES (v_plan_exercise_id, 1, 'duration', 3, NULL, 20, 90, NULL, NULL, 'standard')
  ON CONFLICT (plan_exercise_id, week_number) DO UPDATE
  SET prescription_type = EXCLUDED.prescription_type,
      sets = EXCLUDED.sets,
      reps = EXCLUDED.reps,
      duration_seconds = EXCLUDED.duration_seconds,
      rest_seconds = EXCLUDED.rest_seconds,
      rir = EXCLUDED.rir,
      tempo = EXCLUDED.tempo,
      method = EXCLUDED.method,
      updated_at = now();

  -- C1 DB Bench Press
  SELECT id INTO v_exercise_id FROM exercises WHERE name = 'DB Bench Press' LIMIT 1;
  INSERT INTO strength_plan_exercises (
    plan_id, day_number, section, superset_group, exercise_order,
    exercise_id, each_side, weight_per_side, plyo_mechanical_load, rm_percent_increase_per_week
  )
  VALUES (v_plan_push_id, 1, 'main', 'C', 6, v_exercise_id, false, false, NULL, 0)
  ON CONFLICT (plan_id, day_number, section, exercise_order) DO UPDATE
  SET superset_group = EXCLUDED.superset_group,
      exercise_id = EXCLUDED.exercise_id,
      each_side = EXCLUDED.each_side,
      weight_per_side = EXCLUDED.weight_per_side,
      plyo_mechanical_load = EXCLUDED.plyo_mechanical_load,
      rm_percent_increase_per_week = EXCLUDED.rm_percent_increase_per_week
  RETURNING id INTO v_plan_exercise_id;

  INSERT INTO strength_prescriptions (
    plan_exercise_id, week_number, prescription_type, sets, reps, duration_seconds,
    rest_seconds, rir, tempo, method, rm_percent_override
  )
  VALUES (v_plan_exercise_id, 1, 'reps', 3, 12, NULL, 30, 2, '2-0-X-1', 'standard', 0.68)
  ON CONFLICT (plan_exercise_id, week_number) DO UPDATE
  SET prescription_type = EXCLUDED.prescription_type,
      sets = EXCLUDED.sets,
      reps = EXCLUDED.reps,
      duration_seconds = EXCLUDED.duration_seconds,
      rest_seconds = EXCLUDED.rest_seconds,
      rir = EXCLUDED.rir,
      tempo = EXCLUDED.tempo,
      method = EXCLUDED.method,
      rm_percent_override = EXCLUDED.rm_percent_override,
      updated_at = now();

  -- C2 RFE Split Squat
  SELECT id INTO v_exercise_id FROM exercises WHERE name = 'RFE Split Squat' LIMIT 1;
  INSERT INTO strength_plan_exercises (
    plan_id, day_number, section, superset_group, exercise_order,
    exercise_id, each_side, weight_per_side, plyo_mechanical_load, rm_percent_increase_per_week
  )
  VALUES (v_plan_push_id, 1, 'main', 'C', 7, v_exercise_id, true, false, NULL, 0)
  ON CONFLICT (plan_id, day_number, section, exercise_order) DO UPDATE
  SET superset_group = EXCLUDED.superset_group,
      exercise_id = EXCLUDED.exercise_id,
      each_side = EXCLUDED.each_side,
      weight_per_side = EXCLUDED.weight_per_side,
      plyo_mechanical_load = EXCLUDED.plyo_mechanical_load,
      rm_percent_increase_per_week = EXCLUDED.rm_percent_increase_per_week
  RETURNING id INTO v_plan_exercise_id;

  INSERT INTO strength_prescriptions (
    plan_exercise_id, week_number, prescription_type, sets, reps, duration_seconds,
    rest_seconds, rir, tempo, method, rm_percent_override
  )
  VALUES (v_plan_exercise_id, 1, 'reps', 3, 12, NULL, 60, 2, '2-1-X-0', 'standard', 0.68)
  ON CONFLICT (plan_exercise_id, week_number) DO UPDATE
  SET prescription_type = EXCLUDED.prescription_type,
      sets = EXCLUDED.sets,
      reps = EXCLUDED.reps,
      duration_seconds = EXCLUDED.duration_seconds,
      rest_seconds = EXCLUDED.rest_seconds,
      rir = EXCLUDED.rir,
      tempo = EXCLUDED.tempo,
      method = EXCLUDED.method,
      rm_percent_override = EXCLUDED.rm_percent_override,
      updated_at = now();

  -- D1 Wall Tibialis Raises
  SELECT id INTO v_exercise_id FROM exercises WHERE name = 'Wall Tibialis Raises' LIMIT 1;
  INSERT INTO strength_plan_exercises (
    plan_id, day_number, section, superset_group, exercise_order,
    exercise_id, each_side, weight_per_side, plyo_mechanical_load, rm_percent_increase_per_week
  )
  VALUES (v_plan_push_id, 1, 'main', 'D', 8, v_exercise_id, false, false, NULL, 0)
  ON CONFLICT (plan_id, day_number, section, exercise_order) DO UPDATE
  SET superset_group = EXCLUDED.superset_group,
      exercise_id = EXCLUDED.exercise_id,
      each_side = EXCLUDED.each_side,
      weight_per_side = EXCLUDED.weight_per_side,
      plyo_mechanical_load = EXCLUDED.plyo_mechanical_load,
      rm_percent_increase_per_week = EXCLUDED.rm_percent_increase_per_week
  RETURNING id INTO v_plan_exercise_id;

  INSERT INTO strength_prescriptions (
    plan_exercise_id, week_number, prescription_type, sets, reps, duration_seconds,
    rest_seconds, rir, tempo, method, rm_percent_override
  )
  VALUES (v_plan_exercise_id, 1, 'reps', 2, 15, NULL, 15, 1, '2-0-1-1', 'standard', 0.65)
  ON CONFLICT (plan_exercise_id, week_number) DO UPDATE
  SET prescription_type = EXCLUDED.prescription_type,
      sets = EXCLUDED.sets,
      reps = EXCLUDED.reps,
      duration_seconds = EXCLUDED.duration_seconds,
      rest_seconds = EXCLUDED.rest_seconds,
      rir = EXCLUDED.rir,
      tempo = EXCLUDED.tempo,
      method = EXCLUDED.method,
      rm_percent_override = EXCLUDED.rm_percent_override,
      updated_at = now();

  -- D2 Wall SL Bent Knee Calf Raise
  SELECT id INTO v_exercise_id FROM exercises WHERE name = 'Wall SL Bent Knee Calf Raise' LIMIT 1;
  INSERT INTO strength_plan_exercises (
    plan_id, day_number, section, superset_group, exercise_order,
    exercise_id, each_side, weight_per_side, plyo_mechanical_load, rm_percent_increase_per_week
  )
  VALUES (v_plan_push_id, 1, 'main', 'D', 9, v_exercise_id, true, false, NULL, 0)
  ON CONFLICT (plan_id, day_number, section, exercise_order) DO UPDATE
  SET superset_group = EXCLUDED.superset_group,
      exercise_id = EXCLUDED.exercise_id,
      each_side = EXCLUDED.each_side,
      weight_per_side = EXCLUDED.weight_per_side,
      plyo_mechanical_load = EXCLUDED.plyo_mechanical_load,
      rm_percent_increase_per_week = EXCLUDED.rm_percent_increase_per_week
  RETURNING id INTO v_plan_exercise_id;

  INSERT INTO strength_prescriptions (
    plan_exercise_id, week_number, prescription_type, sets, reps, duration_seconds,
    rest_seconds, rir, tempo, method, rm_percent_override
  )
  VALUES (v_plan_exercise_id, 1, 'reps', 2, 15, NULL, 15, 1, '2-0-1-1', 'standard', 0.65)
  ON CONFLICT (plan_exercise_id, week_number) DO UPDATE
  SET prescription_type = EXCLUDED.prescription_type,
      sets = EXCLUDED.sets,
      reps = EXCLUDED.reps,
      duration_seconds = EXCLUDED.duration_seconds,
      rest_seconds = EXCLUDED.rest_seconds,
      rir = EXCLUDED.rir,
      tempo = EXCLUDED.tempo,
      method = EXCLUDED.method,
      rm_percent_override = EXCLUDED.rm_percent_override,
      updated_at = now();

  -- D3 Wall Superman Tricep Extensions
  SELECT id INTO v_exercise_id FROM exercises WHERE name = 'Wall Superman Tricep Extensions' LIMIT 1;
  INSERT INTO strength_plan_exercises (
    plan_id, day_number, section, superset_group, exercise_order,
    exercise_id, each_side, weight_per_side, plyo_mechanical_load, rm_percent_increase_per_week
  )
  VALUES (v_plan_push_id, 1, 'main', 'D', 10, v_exercise_id, false, false, NULL, 0)
  ON CONFLICT (plan_id, day_number, section, exercise_order) DO UPDATE
  SET superset_group = EXCLUDED.superset_group,
      exercise_id = EXCLUDED.exercise_id,
      each_side = EXCLUDED.each_side,
      weight_per_side = EXCLUDED.weight_per_side,
      plyo_mechanical_load = EXCLUDED.plyo_mechanical_load,
      rm_percent_increase_per_week = EXCLUDED.rm_percent_increase_per_week
  RETURNING id INTO v_plan_exercise_id;

  INSERT INTO strength_prescriptions (
    plan_exercise_id, week_number, prescription_type, sets, reps, duration_seconds,
    rest_seconds, rir, tempo, method, rm_percent_override
  )
  VALUES (v_plan_exercise_id, 1, 'reps', 2, 15, NULL, 15, 1, '2-0-1-1', 'standard', 0.65)
  ON CONFLICT (plan_exercise_id, week_number) DO UPDATE
  SET prescription_type = EXCLUDED.prescription_type,
      sets = EXCLUDED.sets,
      reps = EXCLUDED.reps,
      duration_seconds = EXCLUDED.duration_seconds,
      rest_seconds = EXCLUDED.rest_seconds,
      rir = EXCLUDED.rir,
      tempo = EXCLUDED.tempo,
      method = EXCLUDED.method,
      rm_percent_override = EXCLUDED.rm_percent_override,
      updated_at = now();

  -- PUSH conditioning slot
  SELECT id INTO v_exercise_id FROM exercises WHERE name = v_zone2_exercise_name LIMIT 1;
  INSERT INTO strength_plan_exercises (
    plan_id, day_number, section, superset_group, exercise_order,
    exercise_id, each_side, weight_per_side, plyo_mechanical_load, rm_percent_increase_per_week
  )
  VALUES (v_plan_push_id, 1, 'conditioning', NULL, 1, v_exercise_id, false, false, NULL, 0)
  ON CONFLICT (plan_id, day_number, section, exercise_order) DO UPDATE
  SET exercise_id = EXCLUDED.exercise_id,
      each_side = EXCLUDED.each_side,
      weight_per_side = EXCLUDED.weight_per_side,
      plyo_mechanical_load = EXCLUDED.plyo_mechanical_load,
      rm_percent_increase_per_week = EXCLUDED.rm_percent_increase_per_week
  RETURNING id INTO v_plan_exercise_id;

  INSERT INTO strength_prescriptions (
    plan_exercise_id, week_number, prescription_type, sets, reps, duration_seconds,
    rest_seconds, rir, tempo, method, coach_notes
  )
  VALUES (
    v_plan_exercise_id, 1, 'duration', 1, NULL, 1200,
    NULL, NULL, NULL, 'standard',
    'Optional: Zone 2 low-impact cardio. Target 15-20 min steady state.'
  )
  ON CONFLICT (plan_exercise_id, week_number) DO UPDATE
  SET prescription_type = EXCLUDED.prescription_type,
      sets = EXCLUDED.sets,
      reps = EXCLUDED.reps,
      duration_seconds = EXCLUDED.duration_seconds,
      rest_seconds = EXCLUDED.rest_seconds,
      rir = EXCLUDED.rir,
      tempo = EXCLUDED.tempo,
      method = EXCLUDED.method,
      coach_notes = EXCLUDED.coach_notes,
      updated_at = now();

  INSERT INTO strength_plan_phase_notes (plan_id, day_number, section, week_number, notes)
  VALUES
    (
      v_plan_push_id, 1, 'conditioning', 1,
      'Options: bike, incline treadmill, swim. Keep impact low and cadence smooth.'
    ),
    (
      v_plan_push_id, 1, 'observations', 1,
      'Superset A: Full Body Push + vertical jump contrast for power and extensive plyo with knee-structure focus.' || E'\n' ||
      'Superset B: Bilateral lower-body push for force + anti-extension core.' || E'\n' ||
      'Superset C: Upper-body push + unilateral lower-body push for muscular resistance.' || E'\n' ||
      'Superset D: Isolations for tibialis anterior, soleus and triceps with resistance focus.'
    )
  ON CONFLICT (plan_id, day_number, section, week_number) DO UPDATE
  SET notes = EXCLUDED.notes,
      updated_at = now();

  -- PULL main slots
  -- A1 TB High Pull
  SELECT id INTO v_exercise_id FROM exercises WHERE name = 'TB High Pull' LIMIT 1;
  INSERT INTO strength_plan_exercises (
    plan_id, day_number, section, superset_group, exercise_order,
    exercise_id, each_side, weight_per_side, plyo_mechanical_load, rm_percent_increase_per_week
  )
  VALUES (v_plan_pull_id, 1, 'main', 'A', 1, v_exercise_id, false, false, NULL, 0)
  ON CONFLICT (plan_id, day_number, section, exercise_order) DO UPDATE
  SET superset_group = EXCLUDED.superset_group,
      exercise_id = EXCLUDED.exercise_id,
      each_side = EXCLUDED.each_side,
      weight_per_side = EXCLUDED.weight_per_side,
      plyo_mechanical_load = EXCLUDED.plyo_mechanical_load,
      rm_percent_increase_per_week = EXCLUDED.rm_percent_increase_per_week
  RETURNING id INTO v_plan_exercise_id;

  INSERT INTO strength_prescriptions (
    plan_exercise_id, week_number, prescription_type, sets, reps, duration_seconds,
    rest_seconds, rir, tempo, method, rm_percent_override
  )
  VALUES (v_plan_exercise_id, 1, 'reps', 3, 6, NULL, 15, 6, '1-0-X-0', 'standard', 0.70)
  ON CONFLICT (plan_exercise_id, week_number) DO UPDATE
  SET prescription_type = EXCLUDED.prescription_type,
      sets = EXCLUDED.sets,
      reps = EXCLUDED.reps,
      duration_seconds = EXCLUDED.duration_seconds,
      rest_seconds = EXCLUDED.rest_seconds,
      rir = EXCLUDED.rir,
      tempo = EXCLUDED.tempo,
      method = EXCLUDED.method,
      rm_percent_override = EXCLUDED.rm_percent_override,
      updated_at = now();

  -- A2 SL Broad Jump w/ 2 Foot Landing
  SELECT id INTO v_exercise_id FROM exercises WHERE name = 'SL Broad Jump w/ 2 Foot Landing' LIMIT 1;
  INSERT INTO strength_plan_exercises (
    plan_id, day_number, section, superset_group, exercise_order,
    exercise_id, each_side, weight_per_side, plyo_mechanical_load, rm_percent_increase_per_week
  )
  VALUES (v_plan_pull_id, 1, 'main', 'A', 2, v_exercise_id, true, false, 'medium', 0)
  ON CONFLICT (plan_id, day_number, section, exercise_order) DO UPDATE
  SET superset_group = EXCLUDED.superset_group,
      exercise_id = EXCLUDED.exercise_id,
      each_side = EXCLUDED.each_side,
      weight_per_side = EXCLUDED.weight_per_side,
      plyo_mechanical_load = EXCLUDED.plyo_mechanical_load,
      rm_percent_increase_per_week = EXCLUDED.rm_percent_increase_per_week
  RETURNING id INTO v_plan_exercise_id;

  INSERT INTO strength_prescriptions (
    plan_exercise_id, week_number, prescription_type, sets, reps, duration_seconds,
    rest_seconds, rir, tempo, method
  )
  VALUES (v_plan_exercise_id, 1, 'reps', 3, 2, NULL, 30, NULL, NULL, 'standard')
  ON CONFLICT (plan_exercise_id, week_number) DO UPDATE
  SET prescription_type = EXCLUDED.prescription_type,
      sets = EXCLUDED.sets,
      reps = EXCLUDED.reps,
      duration_seconds = EXCLUDED.duration_seconds,
      rest_seconds = EXCLUDED.rest_seconds,
      rir = EXCLUDED.rir,
      tempo = EXCLUDED.tempo,
      method = EXCLUDED.method,
      updated_at = now();

  -- A3 Extensive Multidirectional Hops
  SELECT id INTO v_exercise_id FROM exercises WHERE name = 'Extensive Multidirectional Hops' LIMIT 1;
  INSERT INTO strength_plan_exercises (
    plan_id, day_number, section, superset_group, exercise_order,
    exercise_id, each_side, weight_per_side, plyo_mechanical_load, rm_percent_increase_per_week
  )
  VALUES (v_plan_pull_id, 1, 'main', 'A', 3, v_exercise_id, false, false, 'low', 0)
  ON CONFLICT (plan_id, day_number, section, exercise_order) DO UPDATE
  SET superset_group = EXCLUDED.superset_group,
      exercise_id = EXCLUDED.exercise_id,
      each_side = EXCLUDED.each_side,
      weight_per_side = EXCLUDED.weight_per_side,
      plyo_mechanical_load = EXCLUDED.plyo_mechanical_load,
      rm_percent_increase_per_week = EXCLUDED.rm_percent_increase_per_week
  RETURNING id INTO v_plan_exercise_id;

  INSERT INTO strength_prescriptions (
    plan_exercise_id, week_number, prescription_type, sets, reps, duration_seconds,
    rest_seconds, rir, tempo, method
  )
  VALUES (v_plan_exercise_id, 1, 'duration', 3, NULL, 20, 120, NULL, NULL, 'standard')
  ON CONFLICT (plan_exercise_id, week_number) DO UPDATE
  SET prescription_type = EXCLUDED.prescription_type,
      sets = EXCLUDED.sets,
      reps = EXCLUDED.reps,
      duration_seconds = EXCLUDED.duration_seconds,
      rest_seconds = EXCLUDED.rest_seconds,
      rir = EXCLUDED.rir,
      tempo = EXCLUDED.tempo,
      method = EXCLUDED.method,
      updated_at = now();

  -- B1 TB Deadlift
  SELECT id INTO v_exercise_id FROM exercises WHERE name = 'TB Deadlift' LIMIT 1;
  INSERT INTO strength_plan_exercises (
    plan_id, day_number, section, superset_group, exercise_order,
    exercise_id, each_side, weight_per_side, plyo_mechanical_load, rm_percent_increase_per_week
  )
  VALUES (v_plan_pull_id, 1, 'main', 'B', 4, v_exercise_id, false, false, NULL, 0)
  ON CONFLICT (plan_id, day_number, section, exercise_order) DO UPDATE
  SET superset_group = EXCLUDED.superset_group,
      exercise_id = EXCLUDED.exercise_id,
      each_side = EXCLUDED.each_side,
      weight_per_side = EXCLUDED.weight_per_side,
      plyo_mechanical_load = EXCLUDED.plyo_mechanical_load,
      rm_percent_increase_per_week = EXCLUDED.rm_percent_increase_per_week
  RETURNING id INTO v_plan_exercise_id;

  INSERT INTO strength_prescriptions (
    plan_exercise_id, week_number, prescription_type, sets, reps, duration_seconds,
    rest_seconds, rir, tempo, method, rm_percent_override
  )
  VALUES (v_plan_exercise_id, 1, 'reps', 3, 8, NULL, 30, 2, '1-2-X-1', 'standard', 0.75)
  ON CONFLICT (plan_exercise_id, week_number) DO UPDATE
  SET prescription_type = EXCLUDED.prescription_type,
      sets = EXCLUDED.sets,
      reps = EXCLUDED.reps,
      duration_seconds = EXCLUDED.duration_seconds,
      rest_seconds = EXCLUDED.rest_seconds,
      rir = EXCLUDED.rir,
      tempo = EXCLUDED.tempo,
      method = EXCLUDED.method,
      rm_percent_override = EXCLUDED.rm_percent_override,
      updated_at = now();

  -- B2 Weighted Pallof Press
  SELECT id INTO v_exercise_id FROM exercises WHERE name = 'Weighted Pallof Press' LIMIT 1;
  INSERT INTO strength_plan_exercises (
    plan_id, day_number, section, superset_group, exercise_order,
    exercise_id, each_side, weight_per_side, plyo_mechanical_load, rm_percent_increase_per_week
  )
  VALUES (v_plan_pull_id, 1, 'main', 'B', 5, v_exercise_id, false, false, NULL, 0)
  ON CONFLICT (plan_id, day_number, section, exercise_order) DO UPDATE
  SET superset_group = EXCLUDED.superset_group,
      exercise_id = EXCLUDED.exercise_id,
      each_side = EXCLUDED.each_side,
      weight_per_side = EXCLUDED.weight_per_side,
      plyo_mechanical_load = EXCLUDED.plyo_mechanical_load,
      rm_percent_increase_per_week = EXCLUDED.rm_percent_increase_per_week
  RETURNING id INTO v_plan_exercise_id;

  INSERT INTO strength_prescriptions (
    plan_exercise_id, week_number, prescription_type, sets, reps, duration_seconds,
    rest_seconds, rir, tempo, method, rm_percent_override
  )
  VALUES (v_plan_exercise_id, 1, 'reps', 3, 8, NULL, 90, NULL, NULL, 'standard', 0.80)
  ON CONFLICT (plan_exercise_id, week_number) DO UPDATE
  SET prescription_type = EXCLUDED.prescription_type,
      sets = EXCLUDED.sets,
      reps = EXCLUDED.reps,
      duration_seconds = EXCLUDED.duration_seconds,
      rest_seconds = EXCLUDED.rest_seconds,
      rir = EXCLUDED.rir,
      tempo = EXCLUDED.tempo,
      method = EXCLUDED.method,
      rm_percent_override = EXCLUDED.rm_percent_override,
      updated_at = now();

  -- C1 Chin Ups
  SELECT id INTO v_exercise_id FROM exercises WHERE name = 'Chin Ups' LIMIT 1;
  INSERT INTO strength_plan_exercises (
    plan_id, day_number, section, superset_group, exercise_order,
    exercise_id, each_side, weight_per_side, plyo_mechanical_load, rm_percent_increase_per_week
  )
  VALUES (v_plan_pull_id, 1, 'main', 'C', 6, v_exercise_id, false, false, NULL, 0)
  ON CONFLICT (plan_id, day_number, section, exercise_order) DO UPDATE
  SET superset_group = EXCLUDED.superset_group,
      exercise_id = EXCLUDED.exercise_id,
      each_side = EXCLUDED.each_side,
      weight_per_side = EXCLUDED.weight_per_side,
      plyo_mechanical_load = EXCLUDED.plyo_mechanical_load,
      rm_percent_increase_per_week = EXCLUDED.rm_percent_increase_per_week
  RETURNING id INTO v_plan_exercise_id;

  INSERT INTO strength_prescriptions (
    plan_exercise_id, week_number, prescription_type, sets, reps, duration_seconds,
    rest_seconds, rir, tempo, method, rm_percent_override
  )
  VALUES (v_plan_exercise_id, 1, 'reps', 3, 12, NULL, 30, 2, '2-0-X-1', 'standard', 0.68)
  ON CONFLICT (plan_exercise_id, week_number) DO UPDATE
  SET prescription_type = EXCLUDED.prescription_type,
      sets = EXCLUDED.sets,
      reps = EXCLUDED.reps,
      duration_seconds = EXCLUDED.duration_seconds,
      rest_seconds = EXCLUDED.rest_seconds,
      rir = EXCLUDED.rir,
      tempo = EXCLUDED.tempo,
      method = EXCLUDED.method,
      rm_percent_override = EXCLUDED.rm_percent_override,
      updated_at = now();

  -- C2 SL RDL
  SELECT id INTO v_exercise_id FROM exercises WHERE name = 'SL RDL' LIMIT 1;
  INSERT INTO strength_plan_exercises (
    plan_id, day_number, section, superset_group, exercise_order,
    exercise_id, each_side, weight_per_side, plyo_mechanical_load, rm_percent_increase_per_week
  )
  VALUES (v_plan_pull_id, 1, 'main', 'C', 7, v_exercise_id, true, false, NULL, 0)
  ON CONFLICT (plan_id, day_number, section, exercise_order) DO UPDATE
  SET superset_group = EXCLUDED.superset_group,
      exercise_id = EXCLUDED.exercise_id,
      each_side = EXCLUDED.each_side,
      weight_per_side = EXCLUDED.weight_per_side,
      plyo_mechanical_load = EXCLUDED.plyo_mechanical_load,
      rm_percent_increase_per_week = EXCLUDED.rm_percent_increase_per_week
  RETURNING id INTO v_plan_exercise_id;

  INSERT INTO strength_prescriptions (
    plan_exercise_id, week_number, prescription_type, sets, reps, duration_seconds,
    rest_seconds, rir, tempo, method, rm_percent_override
  )
  VALUES (v_plan_exercise_id, 1, 'reps', 3, 12, NULL, 60, 2, '2-1-X-0', 'standard', 0.68)
  ON CONFLICT (plan_exercise_id, week_number) DO UPDATE
  SET prescription_type = EXCLUDED.prescription_type,
      sets = EXCLUDED.sets,
      reps = EXCLUDED.reps,
      duration_seconds = EXCLUDED.duration_seconds,
      rest_seconds = EXCLUDED.rest_seconds,
      rir = EXCLUDED.rir,
      tempo = EXCLUDED.tempo,
      method = EXCLUDED.method,
      rm_percent_override = EXCLUDED.rm_percent_override,
      updated_at = now();

  -- D1 SL Standing Calf Raise
  SELECT id INTO v_exercise_id FROM exercises WHERE name = 'SL Standing Calf Raise' LIMIT 1;
  INSERT INTO strength_plan_exercises (
    plan_id, day_number, section, superset_group, exercise_order,
    exercise_id, each_side, weight_per_side, plyo_mechanical_load, rm_percent_increase_per_week
  )
  VALUES (v_plan_pull_id, 1, 'main', 'D', 8, v_exercise_id, true, false, NULL, 0)
  ON CONFLICT (plan_id, day_number, section, exercise_order) DO UPDATE
  SET superset_group = EXCLUDED.superset_group,
      exercise_id = EXCLUDED.exercise_id,
      each_side = EXCLUDED.each_side,
      weight_per_side = EXCLUDED.weight_per_side,
      plyo_mechanical_load = EXCLUDED.plyo_mechanical_load,
      rm_percent_increase_per_week = EXCLUDED.rm_percent_increase_per_week
  RETURNING id INTO v_plan_exercise_id;

  INSERT INTO strength_prescriptions (
    plan_exercise_id, week_number, prescription_type, sets, reps, duration_seconds,
    rest_seconds, rir, tempo, method, rm_percent_override
  )
  VALUES (v_plan_exercise_id, 1, 'reps', 2, 15, NULL, 15, 1, '2-0-1-1', 'standard', 0.65)
  ON CONFLICT (plan_exercise_id, week_number) DO UPDATE
  SET prescription_type = EXCLUDED.prescription_type,
      sets = EXCLUDED.sets,
      reps = EXCLUDED.reps,
      duration_seconds = EXCLUDED.duration_seconds,
      rest_seconds = EXCLUDED.rest_seconds,
      rir = EXCLUDED.rir,
      tempo = EXCLUDED.tempo,
      method = EXCLUDED.method,
      rm_percent_override = EXCLUDED.rm_percent_override,
      updated_at = now();

  -- D2 Rope Facepull
  SELECT id INTO v_exercise_id FROM exercises WHERE name = 'Rope Facepull' LIMIT 1;
  INSERT INTO strength_plan_exercises (
    plan_id, day_number, section, superset_group, exercise_order,
    exercise_id, each_side, weight_per_side, plyo_mechanical_load, rm_percent_increase_per_week
  )
  VALUES (v_plan_pull_id, 1, 'main', 'D', 9, v_exercise_id, false, false, NULL, 0)
  ON CONFLICT (plan_id, day_number, section, exercise_order) DO UPDATE
  SET superset_group = EXCLUDED.superset_group,
      exercise_id = EXCLUDED.exercise_id,
      each_side = EXCLUDED.each_side,
      weight_per_side = EXCLUDED.weight_per_side,
      plyo_mechanical_load = EXCLUDED.plyo_mechanical_load,
      rm_percent_increase_per_week = EXCLUDED.rm_percent_increase_per_week
  RETURNING id INTO v_plan_exercise_id;

  INSERT INTO strength_prescriptions (
    plan_exercise_id, week_number, prescription_type, sets, reps, duration_seconds,
    rest_seconds, rir, tempo, method, rm_percent_override
  )
  VALUES (v_plan_exercise_id, 1, 'reps', 2, 15, NULL, 15, 1, '2-0-1-1', 'standard', 0.65)
  ON CONFLICT (plan_exercise_id, week_number) DO UPDATE
  SET prescription_type = EXCLUDED.prescription_type,
      sets = EXCLUDED.sets,
      reps = EXCLUDED.reps,
      duration_seconds = EXCLUDED.duration_seconds,
      rest_seconds = EXCLUDED.rest_seconds,
      rir = EXCLUDED.rir,
      tempo = EXCLUDED.tempo,
      method = EXCLUDED.method,
      rm_percent_override = EXCLUDED.rm_percent_override,
      updated_at = now();

  -- D3 Rope Hammer Curl
  SELECT id INTO v_exercise_id FROM exercises WHERE name = 'Rope Hammer Curl' LIMIT 1;
  INSERT INTO strength_plan_exercises (
    plan_id, day_number, section, superset_group, exercise_order,
    exercise_id, each_side, weight_per_side, plyo_mechanical_load, rm_percent_increase_per_week
  )
  VALUES (v_plan_pull_id, 1, 'main', 'D', 10, v_exercise_id, false, false, NULL, 0)
  ON CONFLICT (plan_id, day_number, section, exercise_order) DO UPDATE
  SET superset_group = EXCLUDED.superset_group,
      exercise_id = EXCLUDED.exercise_id,
      each_side = EXCLUDED.each_side,
      weight_per_side = EXCLUDED.weight_per_side,
      plyo_mechanical_load = EXCLUDED.plyo_mechanical_load,
      rm_percent_increase_per_week = EXCLUDED.rm_percent_increase_per_week
  RETURNING id INTO v_plan_exercise_id;

  INSERT INTO strength_prescriptions (
    plan_exercise_id, week_number, prescription_type, sets, reps, duration_seconds,
    rest_seconds, rir, tempo, method, rm_percent_override
  )
  VALUES (v_plan_exercise_id, 1, 'reps', 2, 15, NULL, 15, 1, '2-0-1-1', 'standard', 0.65)
  ON CONFLICT (plan_exercise_id, week_number) DO UPDATE
  SET prescription_type = EXCLUDED.prescription_type,
      sets = EXCLUDED.sets,
      reps = EXCLUDED.reps,
      duration_seconds = EXCLUDED.duration_seconds,
      rest_seconds = EXCLUDED.rest_seconds,
      rir = EXCLUDED.rir,
      tempo = EXCLUDED.tempo,
      method = EXCLUDED.method,
      rm_percent_override = EXCLUDED.rm_percent_override,
      updated_at = now();

  -- PULL conditioning slot
  SELECT id INTO v_exercise_id FROM exercises WHERE name = v_zone2_exercise_name LIMIT 1;
  INSERT INTO strength_plan_exercises (
    plan_id, day_number, section, superset_group, exercise_order,
    exercise_id, each_side, weight_per_side, plyo_mechanical_load, rm_percent_increase_per_week
  )
  VALUES (v_plan_pull_id, 1, 'conditioning', NULL, 1, v_exercise_id, false, false, NULL, 0)
  ON CONFLICT (plan_id, day_number, section, exercise_order) DO UPDATE
  SET exercise_id = EXCLUDED.exercise_id,
      each_side = EXCLUDED.each_side,
      weight_per_side = EXCLUDED.weight_per_side,
      plyo_mechanical_load = EXCLUDED.plyo_mechanical_load,
      rm_percent_increase_per_week = EXCLUDED.rm_percent_increase_per_week
  RETURNING id INTO v_plan_exercise_id;

  INSERT INTO strength_prescriptions (
    plan_exercise_id, week_number, prescription_type, sets, reps, duration_seconds,
    rest_seconds, rir, tempo, method, coach_notes
  )
  VALUES (
    v_plan_exercise_id, 1, 'duration', 1, NULL, 1200,
    NULL, NULL, NULL, 'standard',
    'Optional: Zone 2 low-impact cardio. Target 15-20 min steady state.'
  )
  ON CONFLICT (plan_exercise_id, week_number) DO UPDATE
  SET prescription_type = EXCLUDED.prescription_type,
      sets = EXCLUDED.sets,
      reps = EXCLUDED.reps,
      duration_seconds = EXCLUDED.duration_seconds,
      rest_seconds = EXCLUDED.rest_seconds,
      rir = EXCLUDED.rir,
      tempo = EXCLUDED.tempo,
      method = EXCLUDED.method,
      coach_notes = EXCLUDED.coach_notes,
      updated_at = now();

  INSERT INTO strength_plan_phase_notes (plan_id, day_number, section, week_number, notes)
  VALUES
    (
      v_plan_pull_id, 1, 'conditioning', 1,
      'Options: bike, incline treadmill, swim. Keep impact low and cadence smooth.'
    ),
    (
      v_plan_pull_id, 1, 'observations', 1,
      'Superset A: Full Body Pull + horizontal jump contrast for power and extensive plyo with ankle-structure focus.' || E'\n' ||
      'Superset B: Bilateral lower-body pull for force + anti-rotation core.' || E'\n' ||
      'Superset C: Upper-body pull + unilateral lower-body pull for muscular resistance.' || E'\n' ||
      'Superset D: Isolations for calves, external rotators/posterior shoulder and biceps with resistance focus.'
    )
  ON CONFLICT (plan_id, day_number, section, week_number) DO UPDATE
  SET notes = EXCLUDED.notes,
      updated_at = now();
END $$;

COMMIT;
