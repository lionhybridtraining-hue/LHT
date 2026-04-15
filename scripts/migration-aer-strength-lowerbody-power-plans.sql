-- Seed AER strength templates: Lower Body A/B/C + Full Body Power
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
  v_created_by CONSTANT text := 'migration-aer-strength-lowerbody-power-plans';

  v_plan_lb_a uuid;
  v_plan_lb_b uuid;
  v_plan_lb_c uuid;
  v_plan_fb_power uuid;

  v_exercise_id uuid;
  v_plan_exercise_id uuid;

  v_section text;
  v_superset text;
  v_order integer;
  v_exercise_name text;
  v_each_side boolean;
  v_plyo_load text;
  v_sets integer;
  v_reps integer;
  v_duration integer;
  v_rest integer;
  v_rir integer;
  v_tempo text;
  v_rm numeric;
  v_coach_notes text;
BEGIN
  SELECT tp.id
    INTO v_program_id
  FROM training_programs tp
  WHERE lower(coalesce(tp.external_id, '')) = 'aer'
    AND tp.deleted_at IS NULL
  ORDER BY tp.created_at ASC
  LIMIT 1;

  -- Exercises used by these 4 plans
  INSERT INTO exercises (name, category, subcategory, description)
  VALUES ('Extensive Step Up Jumps', 'rfd', 'plyo_extensive', 'Extensive step-up jump pattern focused on elastic stiffness.')
  ON CONFLICT (name) DO UPDATE SET
    category = EXCLUDED.category,
    subcategory = EXCLUDED.subcategory,
    description = COALESCE(exercises.description, EXCLUDED.description),
    updated_at = now();

  INSERT INTO exercises (name, category, subcategory, description)
  VALUES ('Reactive Step Up Jumps', 'rfd', 'plyo_reactive', 'Reactive step-up jump variation with short ground contact.')
  ON CONFLICT (name) DO UPDATE SET
    category = EXCLUDED.category,
    subcategory = EXCLUDED.subcategory,
    description = COALESCE(exercises.description, EXCLUDED.description),
    updated_at = now();

  INSERT INTO exercises (name, category, subcategory, description, default_each_side)
  VALUES ('SL Drop Jump w/ Lateral Bound', 'rfd', 'plyo_intensive', 'Single-leg drop jump with lateral rebound reaction.', true)
  ON CONFLICT (name) DO UPDATE SET
    category = EXCLUDED.category,
    subcategory = EXCLUDED.subcategory,
    description = COALESCE(exercises.description, EXCLUDED.description),
    default_each_side = COALESCE(exercises.default_each_side, EXCLUDED.default_each_side),
    updated_at = now();

  INSERT INTO exercises (name, category, subcategory, description, default_each_side, default_tempo)
  VALUES ('BB Step Up', 'main_movements', 'lower_knee_dominant_unilateral', 'Barbell step-up lower-body strength movement.', true, '2-1-X-1')
  ON CONFLICT (name) DO UPDATE SET
    category = EXCLUDED.category,
    subcategory = EXCLUDED.subcategory,
    description = COALESCE(exercises.description, EXCLUDED.description),
    default_each_side = COALESCE(exercises.default_each_side, EXCLUDED.default_each_side),
    default_tempo = COALESCE(exercises.default_tempo, EXCLUDED.default_tempo),
    updated_at = now();

  INSERT INTO exercises (name, category, subcategory, description, default_tempo)
  VALUES ('BB RDL', 'main_movements', 'lower_hip_dominant', 'Barbell Romanian deadlift.', '2-1-1-0')
  ON CONFLICT (name) DO UPDATE SET
    category = EXCLUDED.category,
    subcategory = EXCLUDED.subcategory,
    description = COALESCE(exercises.description, EXCLUDED.description),
    default_tempo = COALESCE(exercises.default_tempo, EXCLUDED.default_tempo),
    updated_at = now();

  INSERT INTO exercises (name, category, subcategory, description, default_tempo)
  VALUES ('Band Explosive Lateral Lunge', 'rfd', 'lateral_force', 'Explosive lateral lunge pattern with band resistance.', 'X-X-X-1')
  ON CONFLICT (name) DO UPDATE SET
    category = EXCLUDED.category,
    subcategory = EXCLUDED.subcategory,
    description = COALESCE(exercises.description, EXCLUDED.description),
    default_tempo = COALESCE(exercises.default_tempo, EXCLUDED.default_tempo),
    updated_at = now();

  INSERT INTO exercises (name, category, subcategory, description)
  VALUES ('Extensive Low Box Jumps', 'rfd', 'plyo_extensive', 'Extensive low-box jump pattern.')
  ON CONFLICT (name) DO UPDATE SET
    category = EXCLUDED.category,
    subcategory = EXCLUDED.subcategory,
    description = COALESCE(exercises.description, EXCLUDED.description),
    updated_at = now();

  INSERT INTO exercises (name, category, subcategory, description)
  VALUES ('Drop Jump', 'rfd', 'plyo_reactive', 'Reactive drop jump with fast amortization phase.')
  ON CONFLICT (name) DO UPDATE SET
    category = EXCLUDED.category,
    subcategory = EXCLUDED.subcategory,
    description = COALESCE(exercises.description, EXCLUDED.description),
    updated_at = now();

  INSERT INTO exercises (name, category, subcategory, description)
  VALUES ('Depth Jump', 'rfd', 'plyo_intensive', 'Depth jump focused on maximal vertical expression.')
  ON CONFLICT (name) DO UPDATE SET
    category = EXCLUDED.category,
    subcategory = EXCLUDED.subcategory,
    description = COALESCE(exercises.description, EXCLUDED.description),
    updated_at = now();

  INSERT INTO exercises (name, category, subcategory, description, default_each_side)
  VALUES ('RFE Split Squat Jumps', 'rfd', 'plyo_unilateral', 'Rear-foot elevated split squat jump pattern.', true)
  ON CONFLICT (name) DO UPDATE SET
    category = EXCLUDED.category,
    subcategory = EXCLUDED.subcategory,
    description = COALESCE(exercises.description, EXCLUDED.description),
    default_each_side = COALESCE(exercises.default_each_side, EXCLUDED.default_each_side),
    updated_at = now();

  INSERT INTO exercises (name, category, subcategory, description, default_tempo)
  VALUES ('BB Back Squat', 'main_movements', 'lower_knee_dominant_bilateral', 'Barbell back squat.', '2-1-X-2')
  ON CONFLICT (name) DO UPDATE SET
    category = EXCLUDED.category,
    subcategory = EXCLUDED.subcategory,
    description = COALESCE(exercises.description, EXCLUDED.description),
    default_tempo = COALESCE(exercises.default_tempo, EXCLUDED.default_tempo),
    updated_at = now();

  INSERT INTO exercises (name, category, subcategory, description, default_tempo)
  VALUES ('Ecc Nordic Curls', 'hypertrophy', 'hamstrings_eccentric', 'Eccentric Nordic curl pattern for hamstring resilience.', '3-N-N-N')
  ON CONFLICT (name) DO UPDATE SET
    category = EXCLUDED.category,
    subcategory = EXCLUDED.subcategory,
    description = COALESCE(exercises.description, EXCLUDED.description),
    default_tempo = COALESCE(exercises.default_tempo, EXCLUDED.default_tempo),
    updated_at = now();

  INSERT INTO exercises (name, category, subcategory, description, default_tempo)
  VALUES ('Ecc Reverse Nordic Curls', 'hypertrophy', 'quads_eccentric', 'Eccentric reverse Nordic curl pattern.', '3-N-N-N')
  ON CONFLICT (name) DO UPDATE SET
    category = EXCLUDED.category,
    subcategory = EXCLUDED.subcategory,
    description = COALESCE(exercises.description, EXCLUDED.description),
    default_tempo = COALESCE(exercises.default_tempo, EXCLUDED.default_tempo),
    updated_at = now();

  INSERT INTO exercises (name, category, subcategory, description)
  VALUES ('Extensive Jumps', 'rfd', 'plyo_extensive', 'General extensive jump pattern.')
  ON CONFLICT (name) DO UPDATE SET
    category = EXCLUDED.category,
    subcategory = EXCLUDED.subcategory,
    description = COALESCE(exercises.description, EXCLUDED.description),
    updated_at = now();

  INSERT INTO exercises (name, category, subcategory, description)
  VALUES ('Pogo Jumps', 'rfd', 'ankle_reactive', 'Reactive pogo jumps for ankle stiffness and reactivity.')
  ON CONFLICT (name) DO UPDATE SET
    category = EXCLUDED.category,
    subcategory = EXCLUDED.subcategory,
    description = COALESCE(exercises.description, EXCLUDED.description),
    updated_at = now();

  INSERT INTO exercises (name, category, subcategory, description)
  VALUES ('Extensive Lateral Drop Bound', 'rfd', 'lateral_extensive', 'Extensive lateral drop-and-bound pattern.')
  ON CONFLICT (name) DO UPDATE SET
    category = EXCLUDED.category,
    subcategory = EXCLUDED.subcategory,
    description = COALESCE(exercises.description, EXCLUDED.description),
    updated_at = now();

  INSERT INTO exercises (name, category, subcategory, description)
  VALUES ('Reactive Lateral Drop Bound', 'rfd', 'lateral_reactive', 'Reactive lateral drop-and-bound pattern.')
  ON CONFLICT (name) DO UPDATE SET
    category = EXCLUDED.category,
    subcategory = EXCLUDED.subcategory,
    description = COALESCE(exercises.description, EXCLUDED.description),
    updated_at = now();

  INSERT INTO exercises (name, category, subcategory, description, default_tempo)
  VALUES ('Power Clean', 'main_movements', 'olympic_derivative', 'Power clean for triple-extension power.', 'N-2-X-0')
  ON CONFLICT (name) DO UPDATE SET
    category = EXCLUDED.category,
    subcategory = EXCLUDED.subcategory,
    description = COALESCE(exercises.description, EXCLUDED.description),
    default_tempo = COALESCE(exercises.default_tempo, EXCLUDED.default_tempo),
    updated_at = now();

  INSERT INTO exercises (name, category, subcategory, description, default_tempo)
  VALUES ('Smith Pin RFE 1/2 Triple Extension Squat', 'main_movements', 'triple_extension_knee_dominant', 'Smith pin rear-foot elevated half squat with triple extension intent.', 'X-X-X-X')
  ON CONFLICT (name) DO UPDATE SET
    category = EXCLUDED.category,
    subcategory = EXCLUDED.subcategory,
    description = COALESCE(exercises.description, EXCLUDED.description),
    default_tempo = COALESCE(exercises.default_tempo, EXCLUDED.default_tempo),
    updated_at = now();

  INSERT INTO exercises (name, category, subcategory, description)
  VALUES ('Rocker Jumps', 'rfd', 'plyo_reactive', 'Rocker jump variation for reactive lower-body output.')
  ON CONFLICT (name) DO UPDATE SET
    category = EXCLUDED.category,
    subcategory = EXCLUDED.subcategory,
    description = COALESCE(exercises.description, EXCLUDED.description),
    updated_at = now();

  INSERT INTO exercises (name, category, subcategory, description, default_tempo)
  VALUES ('TB Jumps', 'rfd', 'loaded_jump', 'Trap-bar loaded jump for power development.', '0-2-X-1')
  ON CONFLICT (name) DO UPDATE SET
    category = EXCLUDED.category,
    subcategory = EXCLUDED.subcategory,
    description = COALESCE(exercises.description, EXCLUDED.description),
    default_tempo = COALESCE(exercises.default_tempo, EXCLUDED.default_tempo),
    updated_at = now();

  INSERT INTO exercises (name, category, subcategory, description, default_tempo)
  VALUES ('Band Pogos', 'rfd', 'ankle_reactive', 'Band-assisted pogo jumps.', 'X-X-X-X')
  ON CONFLICT (name) DO UPDATE SET
    category = EXCLUDED.category,
    subcategory = EXCLUDED.subcategory,
    description = COALESCE(exercises.description, EXCLUDED.description),
    default_tempo = COALESCE(exercises.default_tempo, EXCLUDED.default_tempo),
    updated_at = now();

  INSERT INTO exercises (name, category, subcategory, description, default_tempo)
  VALUES ('Band HK Rotational 45º Lat Pull Down', 'main_movements', 'upper_pull_unilateral', 'Half-kneeling 45-degree rotational unilateral lat pulldown with band.', '2-0-1-1')
  ON CONFLICT (name) DO UPDATE SET
    category = EXCLUDED.category,
    subcategory = EXCLUDED.subcategory,
    description = COALESCE(exercises.description, EXCLUDED.description),
    default_tempo = COALESCE(exercises.default_tempo, EXCLUDED.default_tempo),
    updated_at = now();

  INSERT INTO exercises (name, category, subcategory, description, default_each_side, default_tempo)
  VALUES ('Forefoot Elevated SL Pin Press', 'main_movements', 'isometric_unilateral', 'Single-leg forefoot-elevated pin press isometric variation.', true, '3')
  ON CONFLICT (name) DO UPDATE SET
    category = EXCLUDED.category,
    subcategory = EXCLUDED.subcategory,
    description = COALESCE(exercises.description, EXCLUDED.description),
    default_each_side = COALESCE(exercises.default_each_side, EXCLUDED.default_each_side),
    default_tempo = COALESCE(exercises.default_tempo, EXCLUDED.default_tempo),
    updated_at = now();

  INSERT INTO exercises (name, category, subcategory, description, default_tempo)
  VALUES ('DB Shoulder Press + Push Press Complex (7+7)', 'main_movements', 'upper_push_complex', 'Dumbbell shoulder press plus push press complex.', '1-1-X-0')
  ON CONFLICT (name) DO UPDATE SET
    category = EXCLUDED.category,
    subcategory = EXCLUDED.subcategory,
    description = COALESCE(exercises.description, EXCLUDED.description),
    default_tempo = COALESCE(exercises.default_tempo, EXCLUDED.default_tempo),
    updated_at = now();

  INSERT INTO exercises (name, category, subcategory, description)
  VALUES ('DB Bicep Carry', 'hypertrophy', 'loaded_carry', 'Dumbbell loaded carry with elbow flexor demand.')
  ON CONFLICT (name) DO UPDATE SET
    category = EXCLUDED.category,
    subcategory = EXCLUDED.subcategory,
    description = COALESCE(exercises.description, EXCLUDED.description),
    updated_at = now();

  -- Plans
  SELECT sp.id INTO v_plan_lb_a
  FROM strength_plans sp
  WHERE lower(sp.name) = lower('AER - Lower Body A')
    AND ((v_program_id IS NOT NULL AND sp.training_program_id = v_program_id) OR (v_program_id IS NULL AND sp.training_program_id IS NULL))
  ORDER BY sp.created_at ASC
  LIMIT 1;

  IF v_plan_lb_a IS NULL THEN
    INSERT INTO strength_plans (athlete_id, name, description, total_weeks, status, created_by, training_program_id)
    VALUES (
      NULL,
      'AER - Lower Body A',
      'Lower-body unilateral knee-dominant focus with lateral resilience and reactive plyometrics.',
      1,
      'active',
      v_created_by,
      v_program_id
    )
    RETURNING id INTO v_plan_lb_a;
  ELSE
    UPDATE strength_plans
    SET description = 'Lower-body unilateral knee-dominant focus with lateral resilience and reactive plyometrics.',
        total_weeks = 1,
        status = 'active',
        training_program_id = COALESCE(v_program_id, training_program_id),
        updated_at = now()
    WHERE id = v_plan_lb_a;
  END IF;

  SELECT sp.id INTO v_plan_lb_b
  FROM strength_plans sp
  WHERE lower(sp.name) = lower('AER - Lower Body B')
    AND ((v_program_id IS NOT NULL AND sp.training_program_id = v_program_id) OR (v_program_id IS NULL AND sp.training_program_id IS NULL))
  ORDER BY sp.created_at ASC
  LIMIT 1;

  IF v_plan_lb_b IS NULL THEN
    INSERT INTO strength_plans (athlete_id, name, description, total_weeks, status, created_by, training_program_id)
    VALUES (
      NULL,
      'AER - Lower Body B',
      'Lower-body bilateral knee-dominant strength with eccentric muscular resistance focus.',
      1,
      'active',
      v_created_by,
      v_program_id
    )
    RETURNING id INTO v_plan_lb_b;
  ELSE
    UPDATE strength_plans
    SET description = 'Lower-body bilateral knee-dominant strength with eccentric muscular resistance focus.',
        total_weeks = 1,
        status = 'active',
        training_program_id = COALESCE(v_program_id, training_program_id),
        updated_at = now()
    WHERE id = v_plan_lb_b;
  END IF;

  SELECT sp.id INTO v_plan_lb_c
  FROM strength_plans sp
  WHERE lower(sp.name) = lower('AER - Lower Body C')
    AND ((v_program_id IS NOT NULL AND sp.training_program_id = v_program_id) OR (v_program_id IS NULL AND sp.training_program_id IS NULL))
  ORDER BY sp.created_at ASC
  LIMIT 1;

  IF v_plan_lb_c IS NULL THEN
    INSERT INTO strength_plans (athlete_id, name, description, total_weeks, status, created_by, training_program_id)
    VALUES (
      NULL,
      'AER - Lower Body C',
      'Power-oriented lower body session with triple-extension emphasis.',
      1,
      'active',
      v_created_by,
      v_program_id
    )
    RETURNING id INTO v_plan_lb_c;
  ELSE
    UPDATE strength_plans
    SET description = 'Power-oriented lower body session with triple-extension emphasis.',
        total_weeks = 1,
        status = 'active',
        training_program_id = COALESCE(v_program_id, training_program_id),
        updated_at = now()
    WHERE id = v_plan_lb_c;
  END IF;

  SELECT sp.id INTO v_plan_fb_power
  FROM strength_plans sp
  WHERE lower(sp.name) = lower('AER - Full Body Power')
    AND ((v_program_id IS NOT NULL AND sp.training_program_id = v_program_id) OR (v_program_id IS NULL AND sp.training_program_id IS NULL))
  ORDER BY sp.created_at ASC
  LIMIT 1;

  IF v_plan_fb_power IS NULL THEN
    INSERT INTO strength_plans (athlete_id, name, description, total_weeks, status, created_by, training_program_id)
    VALUES (
      NULL,
      'AER - Full Body Power',
      'Full-body power session combining contrast work, unilateral pull and loaded carry.',
      1,
      'active',
      v_created_by,
      v_program_id
    )
    RETURNING id INTO v_plan_fb_power;
  ELSE
    UPDATE strength_plans
    SET description = 'Full-body power session combining contrast work, unilateral pull and loaded carry.',
        total_weeks = 1,
        status = 'active',
        training_program_id = COALESCE(v_program_id, training_program_id),
        updated_at = now()
    WHERE id = v_plan_fb_power;
  END IF;

  INSERT INTO strength_plan_day_labels (plan_id, day_number, day_label)
  VALUES
    (v_plan_lb_a, 1, 'Lower Body A'),
    (v_plan_lb_b, 1, 'Lower Body B'),
    (v_plan_lb_c, 1, 'Lower Body C'),
    (v_plan_fb_power, 1, 'Full Body Power')
  ON CONFLICT (plan_id, day_number) DO UPDATE
  SET day_label = EXCLUDED.day_label,
      updated_at = now();

  -- Lower Body A slots
  FOR
    v_section, v_superset, v_order, v_exercise_name, v_each_side, v_plyo_load,
    v_sets, v_reps, v_duration, v_rest, v_rir, v_tempo, v_rm, v_coach_notes
  IN
    SELECT * FROM (
      VALUES
        ('plyos_speed','P',1,'Extensive Step Up Jumps',false,'low',2,NULL,20,10,NULL,NULL,NULL,NULL),
        ('plyos_speed','P',2,'Reactive Step Up Jumps',false,'medium',2,8,NULL,30,NULL,NULL,NULL,NULL),
        ('plyos_speed','P',3,'SL Drop Jump w/ Lateral Bound',true,'high',2,4,NULL,30,NULL,NULL,NULL,NULL),
        ('main','A',1,'BB Step Up',true,NULL,3,8,NULL,120,2,'2-1-X-1',0.75,NULL),
        ('main','B',2,'BB RDL',false,NULL,3,10,NULL,30,3,'2-1-1-0',0.69,NULL),
        ('main','B',3,'Band Explosive Lateral Lunge',false,NULL,3,8,NULL,60,6,'X-X-X-1',0.68,NULL)
    ) AS t(section,superset,exercise_order,exercise_name,each_side,plyo_load,sets,reps,duration_seconds,rest_seconds,rir,tempo,rm_percent,coach_notes)
  LOOP
    SELECT id INTO v_exercise_id FROM exercises WHERE name = v_exercise_name LIMIT 1;

    INSERT INTO strength_plan_exercises (
      plan_id, day_number, section, superset_group, exercise_order, exercise_id,
      each_side, weight_per_side, plyo_mechanical_load, rm_percent_increase_per_week
    )
    VALUES (v_plan_lb_a, 1, v_section, v_superset, v_order, v_exercise_id, v_each_side, false, v_plyo_load, 0)
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
      rest_seconds, rir, tempo, method, rm_percent_override, coach_notes
    )
    VALUES (
      v_plan_exercise_id,
      1,
      CASE WHEN v_duration IS NULL THEN 'reps' ELSE 'duration' END,
      v_sets,
      v_reps,
      v_duration,
      v_rest,
      v_rir,
      v_tempo,
      'standard',
      v_rm,
      v_coach_notes
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
        rm_percent_override = EXCLUDED.rm_percent_override,
        coach_notes = EXCLUDED.coach_notes,
        updated_at = now();
  END LOOP;

  INSERT INTO strength_plan_phase_notes (plan_id, day_number, section, week_number, notes)
  VALUES
    (
      v_plan_lb_a, 1, 'observations', 1,
      'Plyo 1: Pliometria extensiva para aquecimento, foco no joelho.' || E'\n' ||
      'Plyo 2: Mesmo movimento, mas feito de forma reativa.' || E'\n' ||
      'Plyo 3: Pliometria intensiva. Salto da caixa a uma perna com reação lateral.' || E'\n' ||
      'Exercício A: Trabalho de força num movimento dominante de joelho unilateral.' || E'\n' ||
      'Superset B: Trabalho de resistência muscular dos isquiotibiais em alongamento + explosão num padrão de movimento lateral.'
    )
  ON CONFLICT (plan_id, day_number, section, week_number) DO UPDATE
  SET notes = EXCLUDED.notes,
      updated_at = now();

  -- Lower Body B slots
  FOR
    v_section, v_superset, v_order, v_exercise_name, v_each_side, v_plyo_load,
    v_sets, v_reps, v_duration, v_rest, v_rir, v_tempo, v_rm, v_coach_notes
  IN
    SELECT * FROM (
      VALUES
        ('plyos_speed','P',1,'Extensive Low Box Jumps',false,'low',2,NULL,20,10,NULL,NULL,NULL,NULL),
        ('plyos_speed','P',2,'Drop Jump',false,'medium',2,6,NULL,30,NULL,NULL,NULL,NULL),
        ('plyos_speed','P',3,'Depth Jump',false,'high',2,4,NULL,30,NULL,NULL,NULL,NULL),
        ('plyos_speed','P',4,'RFE Split Squat Jumps',true,'high',2,6,NULL,60,NULL,NULL,NULL,NULL),
        ('main','A',1,'BB Back Squat',false,NULL,3,6,NULL,120,5,'2-1-X-2',0.73,NULL),
        ('main','B',2,'Ecc Nordic Curls',false,NULL,3,6,NULL,30,1,'3-N-N-N',0.83,NULL),
        ('main','B',3,'Ecc Reverse Nordic Curls',false,NULL,3,6,NULL,60,1,'3-N-N-N',0.83,NULL)
    ) AS t(section,superset,exercise_order,exercise_name,each_side,plyo_load,sets,reps,duration_seconds,rest_seconds,rir,tempo,rm_percent,coach_notes)
  LOOP
    SELECT id INTO v_exercise_id FROM exercises WHERE name = v_exercise_name LIMIT 1;

    INSERT INTO strength_plan_exercises (
      plan_id, day_number, section, superset_group, exercise_order, exercise_id,
      each_side, weight_per_side, plyo_mechanical_load, rm_percent_increase_per_week
    )
    VALUES (v_plan_lb_b, 1, v_section, v_superset, v_order, v_exercise_id, v_each_side, false, v_plyo_load, 0)
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
      rest_seconds, rir, tempo, method, rm_percent_override, coach_notes
    )
    VALUES (
      v_plan_exercise_id,
      1,
      CASE WHEN v_duration IS NULL THEN 'reps' ELSE 'duration' END,
      v_sets,
      v_reps,
      v_duration,
      v_rest,
      v_rir,
      v_tempo,
      'standard',
      v_rm,
      v_coach_notes
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
        rm_percent_override = EXCLUDED.rm_percent_override,
        coach_notes = EXCLUDED.coach_notes,
        updated_at = now();
  END LOOP;

  INSERT INTO strength_plan_phase_notes (plan_id, day_number, section, week_number, notes)
  VALUES
    (
      v_plan_lb_b, 1, 'observations', 1,
      'Plyo 1: Pliometria extensiva para aquecimento, foco no tornozelo.' || E'\n' ||
      'Plyo 2: Salto da caixa com foco em reagir rápido ao chão.' || E'\n' ||
      'Plyo 3: Pliometria intensiva. Salto da caixa com foco a saltar o mais alto possível.' || E'\n' ||
      'Plyo 4: Trabalho de explosão num movimento unilateral.' || E'\n' ||
      'Exercício A: Trabalho de força num movimento dominante de joelho bilateral.' || E'\n' ||
      'Superset B: Trabalho de resistência muscular com foco excêntrico.'
    )
  ON CONFLICT (plan_id, day_number, section, week_number) DO UPDATE
  SET notes = EXCLUDED.notes,
      updated_at = now();

  -- Lower Body C slots
  FOR
    v_section, v_superset, v_order, v_exercise_name, v_each_side, v_plyo_load,
    v_sets, v_reps, v_duration, v_rest, v_rir, v_tempo, v_rm, v_coach_notes
  IN
    SELECT * FROM (
      VALUES
        ('plyos_speed','P',1,'Extensive Jumps',false,'low',2,NULL,30,15,NULL,NULL,NULL,NULL),
        ('plyos_speed','P',2,'Pogo Jumps',false,'medium',2,10,NULL,30,NULL,NULL,NULL,NULL),
        ('plyos_speed','P',3,'Extensive Lateral Drop Bound',false,'low',2,NULL,20,15,NULL,NULL,NULL,NULL),
        ('plyos_speed','P',4,'Reactive Lateral Drop Bound',false,'medium',2,6,NULL,30,NULL,NULL,NULL,NULL),
        ('main','A',1,'Power Clean',false,NULL,3,6,NULL,120,2,'N-2-X-0',0.80,NULL),
        ('main','B',2,'Smith Pin RFE 1/2 Triple Extension Squat',false,NULL,3,6,NULL,120,4,'X-X-X-X',0.75,NULL)
    ) AS t(section,superset,exercise_order,exercise_name,each_side,plyo_load,sets,reps,duration_seconds,rest_seconds,rir,tempo,rm_percent,coach_notes)
  LOOP
    SELECT id INTO v_exercise_id FROM exercises WHERE name = v_exercise_name LIMIT 1;

    INSERT INTO strength_plan_exercises (
      plan_id, day_number, section, superset_group, exercise_order, exercise_id,
      each_side, weight_per_side, plyo_mechanical_load, rm_percent_increase_per_week
    )
    VALUES (v_plan_lb_c, 1, v_section, v_superset, v_order, v_exercise_id, v_each_side, false, v_plyo_load, 0)
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
      rest_seconds, rir, tempo, method, rm_percent_override, coach_notes
    )
    VALUES (
      v_plan_exercise_id,
      1,
      CASE WHEN v_duration IS NULL THEN 'reps' ELSE 'duration' END,
      v_sets,
      v_reps,
      v_duration,
      v_rest,
      v_rir,
      v_tempo,
      'standard',
      v_rm,
      v_coach_notes
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
        rm_percent_override = EXCLUDED.rm_percent_override,
        coach_notes = EXCLUDED.coach_notes,
        updated_at = now();
  END LOOP;

  INSERT INTO strength_plan_phase_notes (plan_id, day_number, section, week_number, notes)
  VALUES
    (
      v_plan_lb_c, 1, 'observations', 1,
      'Plyo 1: Pliometria extensiva para aquecimento, foco no tornozelo.' || E'\n' ||
      'Plyo 2: Mesmo movimento, mas feito de forma reativa.' || E'\n' ||
      'Plyo 3: Pliometria extensiva. Trabalho lateral.' || E'\n' ||
      'Plyo 4: Mesmo movimento, mas feito de forma reativa.' || E'\n' ||
      'Exercício A: Trabalho de potência. Tripla extensão. Dominantes de anca.' || E'\n' ||
      'Exercício B: Trabalho de potência. Tripla extensão. Dominantes de joelho.'
    )
  ON CONFLICT (plan_id, day_number, section, week_number) DO UPDATE
  SET notes = EXCLUDED.notes,
      updated_at = now();

  -- Full Body Power slots
  FOR
    v_section, v_superset, v_order, v_exercise_name, v_each_side, v_plyo_load,
    v_sets, v_reps, v_duration, v_rest, v_rir, v_tempo, v_rm, v_coach_notes
  IN
    SELECT * FROM (
      VALUES
        ('plyos_speed','P',1,'Extensive Low Box Jumps',false,'low',2,NULL,20,10,NULL,NULL,NULL,NULL),
        ('plyos_speed','P',2,'Drop Jump',false,'medium',2,6,NULL,30,NULL,NULL,NULL,NULL),
        ('plyos_speed','P',3,'Depth Jump',false,'high',2,4,NULL,30,NULL,NULL,NULL,NULL),
        ('plyos_speed','P',4,'Rocker Jumps',false,'medium',2,6,NULL,60,NULL,NULL,NULL,NULL),
        ('main','A',1,'TB Jumps',false,NULL,3,6,NULL,15,6,'0-2-X-1',0.70,NULL),
        ('main','A',2,'Band Pogos',false,NULL,3,10,NULL,15,NULL,'X-X-X-X',NULL,NULL),
        ('main','A',3,'Band HK Rotational 45º Lat Pull Down',true,NULL,3,12,NULL,120,1,'2-0-1-1',0.69,NULL),
        ('main','B',4,'Forefoot Elevated SL Pin Press',true,NULL,3,5,NULL,15,0,'3',0.88,NULL),
        ('main','B',5,'DB Shoulder Press + Push Press Complex (7+7)',false,NULL,3,14,NULL,15,2,'1-1-X-0',0.65,NULL),
        ('main','B',6,'DB Bicep Carry',false,NULL,3,20,NULL,60,NULL,NULL,NULL,'20m loaded carry')
    ) AS t(section,superset,exercise_order,exercise_name,each_side,plyo_load,sets,reps,duration_seconds,rest_seconds,rir,tempo,rm_percent,coach_notes)
  LOOP
    SELECT id INTO v_exercise_id FROM exercises WHERE name = v_exercise_name LIMIT 1;

    INSERT INTO strength_plan_exercises (
      plan_id, day_number, section, superset_group, exercise_order, exercise_id,
      each_side, weight_per_side, plyo_mechanical_load, rm_percent_increase_per_week
    )
    VALUES (v_plan_fb_power, 1, v_section, v_superset, v_order, v_exercise_id, v_each_side, false, v_plyo_load, 0)
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
      rest_seconds, rir, tempo, method, rm_percent_override, coach_notes
    )
    VALUES (
      v_plan_exercise_id,
      1,
      CASE WHEN v_duration IS NULL THEN 'reps' ELSE 'duration' END,
      v_sets,
      v_reps,
      v_duration,
      v_rest,
      v_rir,
      v_tempo,
      'standard',
      v_rm,
      v_coach_notes
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
        rm_percent_override = EXCLUDED.rm_percent_override,
        coach_notes = EXCLUDED.coach_notes,
        updated_at = now();
  END LOOP;

  INSERT INTO strength_plan_phase_notes (plan_id, day_number, section, week_number, notes)
  VALUES
    (
      v_plan_fb_power, 1, 'observations', 1,
      'Superset A: Trabalho de contraste (potência + pliometria assistida) + puxada unilateral.' || E'\n' ||
      'Superset B: Isométrico de alta intensidade + combo empurrar vertical + loaded carry.'
    )
  ON CONFLICT (plan_id, day_number, section, week_number) DO UPDATE
  SET notes = EXCLUDED.notes,
      updated_at = now();
END $$;

COMMIT;
