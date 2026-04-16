-- Merge AER Full Body Push/Pull plans into a single multi-day plan per duration.
--
-- This keeps the original source plans untouched and creates a new combined plan
-- that can be selected directly in a variant or used inside phase containers.

BEGIN;

DO $$
DECLARE
  v_zero uuid := '00000000-0000-0000-0000-000000000000';

  v_pair record;
  v_push_plan record;
  v_pull_plan record;
  v_target_plan_id uuid;
  v_target_day_offset integer;
  v_source_plan_ids uuid[];

  v_source_ex record;
  v_source_rx record;
  v_source_note record;
  v_new_plan_exercise_id uuid;
  v_new_day_number integer;
BEGIN
  FOR v_pair IN
    SELECT *
    FROM (
      VALUES
        ('AER - Full Body Push', 'AER - Full Body Pull', 'AER - Full Body Push/Pull'),
        ('AER - Full Body Push - 4W', 'AER - Full Body Pull - 4W', 'AER - Full Body Push/Pull - 4W'),
        ('AER - Full Body Push - 5W', 'AER - Full Body Pull - 5W', 'AER - Full Body Push/Pull - 5W'),
        ('AER - Full Body Push - 6W', 'AER - Full Body Pull - 6W', 'AER - Full Body Push/Pull - 6W')
    ) AS pairs(push_name, pull_name, target_name)
  LOOP
    SELECT sp.id, sp.name, sp.description, sp.total_weeks, sp.training_program_id
      INTO v_push_plan
    FROM strength_plans sp
    WHERE lower(sp.name) = lower(v_pair.push_name)
    ORDER BY sp.created_at ASC
    LIMIT 1;

    SELECT sp.id, sp.name, sp.description, sp.total_weeks, sp.training_program_id
      INTO v_pull_plan
    FROM strength_plans sp
    WHERE lower(sp.name) = lower(v_pair.pull_name)
    ORDER BY sp.created_at ASC
    LIMIT 1;

    IF v_push_plan.id IS NULL OR v_pull_plan.id IS NULL THEN
      RAISE NOTICE 'Skipping merge for %, missing source plan(s): push=%, pull=%',
        v_pair.target_name,
        coalesce(v_push_plan.id::text, 'null'),
        coalesce(v_pull_plan.id::text, 'null');
      CONTINUE;
    END IF;

    IF coalesce(v_push_plan.training_program_id, v_zero) <> coalesce(v_pull_plan.training_program_id, v_zero) THEN
      RAISE EXCEPTION 'Cannot merge % and % because training_program_id differs.',
        v_push_plan.name,
        v_pull_plan.name;
    END IF;

    SELECT sp.id
      INTO v_target_plan_id
    FROM strength_plans sp
    WHERE lower(sp.name) = lower(v_pair.target_name)
      AND coalesce(sp.training_program_id, v_zero) = coalesce(v_push_plan.training_program_id, v_zero)
    ORDER BY sp.created_at ASC
    LIMIT 1;

    IF v_target_plan_id IS NULL THEN
      INSERT INTO strength_plans (
        athlete_id,
        name,
        description,
        total_weeks,
        status,
        created_by,
        training_program_id
      )
      VALUES (
        NULL,
        v_pair.target_name,
        trim(both ' ' from concat(
          coalesce(v_push_plan.description, ''),
          CASE
            WHEN coalesce(v_push_plan.description, '') <> '' AND coalesce(v_pull_plan.description, '') <> ''
              THEN E'\n\n'
            ELSE ''
          END,
          coalesce(v_pull_plan.description, '')
        )),
        greatest(coalesce(v_push_plan.total_weeks, 1), coalesce(v_pull_plan.total_weeks, 1)),
        'active',
        'migration-aer-strength-merge-full-body-push-pull',
        v_push_plan.training_program_id
      )
      RETURNING id INTO v_target_plan_id;
    ELSE
      UPDATE strength_plans
      SET description = trim(both ' ' from concat(
            coalesce(v_push_plan.description, ''),
            CASE
              WHEN coalesce(v_push_plan.description, '') <> '' AND coalesce(v_pull_plan.description, '') <> ''
                THEN E'\n\n'
              ELSE ''
            END,
            coalesce(v_pull_plan.description, '')
          )),
          total_weeks = greatest(coalesce(v_push_plan.total_weeks, 1), coalesce(v_pull_plan.total_weeks, 1)),
          status = 'active',
          updated_at = now()
      WHERE id = v_target_plan_id;
    END IF;

    -- Rebuild target so the migration stays deterministic on re-run.
    DELETE FROM strength_plan_phase_notes WHERE plan_id = v_target_plan_id;
    DELETE FROM strength_plan_day_labels WHERE plan_id = v_target_plan_id;
    DELETE FROM strength_plan_exercises WHERE plan_id = v_target_plan_id;

    v_source_plan_ids := ARRAY[v_push_plan.id, v_pull_plan.id];

    SELECT coalesce(max(day_number), 0)
      INTO v_target_day_offset
    FROM strength_plan_exercises
    WHERE plan_id = v_push_plan.id;

    IF v_target_day_offset < 1 THEN
      SELECT coalesce(max(day_number), 0)
        INTO v_target_day_offset
      FROM strength_plan_day_labels
      WHERE plan_id = v_push_plan.id;
    END IF;

    IF v_target_day_offset < 1 THEN
      v_target_day_offset := 1;
    END IF;

    INSERT INTO strength_plan_day_labels (plan_id, day_number, day_label)
    SELECT v_target_plan_id, src.day_number, src.day_label
    FROM strength_plan_day_labels src
    WHERE src.plan_id = v_push_plan.id
    ON CONFLICT (plan_id, day_number) DO UPDATE
    SET day_label = EXCLUDED.day_label,
        updated_at = now();

    IF NOT EXISTS (
      SELECT 1
      FROM strength_plan_day_labels
      WHERE plan_id = v_target_plan_id
        AND day_number = 1
    ) THEN
      INSERT INTO strength_plan_day_labels (plan_id, day_number, day_label)
      VALUES (v_target_plan_id, 1, 'Full Body Push')
      ON CONFLICT (plan_id, day_number) DO UPDATE
      SET day_label = EXCLUDED.day_label,
          updated_at = now();
    END IF;

    INSERT INTO strength_plan_day_labels (plan_id, day_number, day_label)
    SELECT v_target_plan_id, src.day_number + v_target_day_offset, src.day_label
    FROM strength_plan_day_labels src
    WHERE src.plan_id = v_pull_plan.id
    ON CONFLICT (plan_id, day_number) DO UPDATE
    SET day_label = EXCLUDED.day_label,
        updated_at = now();

    IF NOT EXISTS (
      SELECT 1
      FROM strength_plan_day_labels
      WHERE plan_id = v_target_plan_id
        AND day_number = v_target_day_offset + 1
    ) THEN
      INSERT INTO strength_plan_day_labels (plan_id, day_number, day_label)
      VALUES (v_target_plan_id, v_target_day_offset + 1, 'Full Body Pull')
      ON CONFLICT (plan_id, day_number) DO UPDATE
      SET day_label = EXCLUDED.day_label,
          updated_at = now();
    END IF;

    FOR v_source_ex IN
      SELECT spe.*, 0 AS day_offset
      FROM strength_plan_exercises spe
      WHERE spe.plan_id = v_push_plan.id

      UNION ALL

      SELECT spe.*, v_target_day_offset AS day_offset
      FROM strength_plan_exercises spe
      WHERE spe.plan_id = v_pull_plan.id

      ORDER BY day_number, section, exercise_order
    LOOP
      v_new_day_number := v_source_ex.day_number + v_source_ex.day_offset;

      INSERT INTO strength_plan_exercises (
        plan_id,
        day_number,
        section,
        superset_group,
        exercise_order,
        exercise_id,
        each_side,
        weight_per_side,
        plyo_mechanical_load,
        rm_percent_increase_per_week
      )
      VALUES (
        v_target_plan_id,
        v_new_day_number,
        v_source_ex.section,
        v_source_ex.superset_group,
        v_source_ex.exercise_order,
        v_source_ex.exercise_id,
        v_source_ex.each_side,
        v_source_ex.weight_per_side,
        v_source_ex.plyo_mechanical_load,
        coalesce(v_source_ex.rm_percent_increase_per_week, 0)
      )
      ON CONFLICT (plan_id, day_number, section, exercise_order) DO UPDATE
      SET superset_group = EXCLUDED.superset_group,
          exercise_id = EXCLUDED.exercise_id,
          each_side = EXCLUDED.each_side,
          weight_per_side = EXCLUDED.weight_per_side,
          plyo_mechanical_load = EXCLUDED.plyo_mechanical_load,
          rm_percent_increase_per_week = EXCLUDED.rm_percent_increase_per_week
      RETURNING id INTO v_new_plan_exercise_id;

      FOR v_source_rx IN
        SELECT rx.*
        FROM strength_prescriptions rx
        WHERE rx.plan_exercise_id = v_source_ex.id
        ORDER BY rx.week_number, rx.created_at
      LOOP
        INSERT INTO strength_prescriptions (
          plan_exercise_id,
          week_number,
          prescription_type,
          sets,
          reps,
          duration_seconds,
          rest_seconds,
          rir,
          tempo,
          gct,
          method,
          rm_percent_override,
          load_override_kg,
          coach_notes
        )
        VALUES (
          v_new_plan_exercise_id,
          v_source_rx.week_number,
          v_source_rx.prescription_type,
          v_source_rx.sets,
          v_source_rx.reps,
          v_source_rx.duration_seconds,
          v_source_rx.rest_seconds,
          v_source_rx.rir,
          v_source_rx.tempo,
          v_source_rx.gct,
          v_source_rx.method,
          v_source_rx.rm_percent_override,
          v_source_rx.load_override_kg,
          v_source_rx.coach_notes
        )
        ON CONFLICT (plan_exercise_id, week_number) DO UPDATE
        SET prescription_type = EXCLUDED.prescription_type,
            sets = EXCLUDED.sets,
            reps = EXCLUDED.reps,
            duration_seconds = EXCLUDED.duration_seconds,
            rest_seconds = EXCLUDED.rest_seconds,
            rir = EXCLUDED.rir,
            tempo = EXCLUDED.tempo,
            gct = EXCLUDED.gct,
            method = EXCLUDED.method,
            rm_percent_override = EXCLUDED.rm_percent_override,
            load_override_kg = EXCLUDED.load_override_kg,
            coach_notes = EXCLUDED.coach_notes,
            updated_at = now();
      END LOOP;
    END LOOP;

    FOR v_source_note IN
      SELECT pn.*, 0 AS day_offset
      FROM strength_plan_phase_notes pn
      WHERE pn.plan_id = v_push_plan.id

      UNION ALL

      SELECT pn.*, v_target_day_offset AS day_offset
      FROM strength_plan_phase_notes pn
      WHERE pn.plan_id = v_pull_plan.id

      ORDER BY day_number, section, week_number
    LOOP
      INSERT INTO strength_plan_phase_notes (
        plan_id,
        day_number,
        section,
        week_number,
        notes
      )
      VALUES (
        v_target_plan_id,
        v_source_note.day_number + v_source_note.day_offset,
        v_source_note.section,
        v_source_note.week_number,
        v_source_note.notes
      )
      ON CONFLICT (plan_id, day_number, section, week_number) DO UPDATE
      SET notes = EXCLUDED.notes,
          updated_at = now();
    END LOOP;

    -- Repoint plan references before deleting the legacy standalone plans.
    UPDATE program_variants
    SET strength_plan_id = v_target_plan_id,
        updated_at = now()
    WHERE strength_plan_id = ANY(v_source_plan_ids);

    UPDATE program_weekly_sessions
    SET strength_plan_id = v_target_plan_id,
        updated_at = now()
    WHERE strength_plan_id = ANY(v_source_plan_ids);

    UPDATE strength_plan_instances
    SET plan_id = v_target_plan_id,
        updated_at = now()
    WHERE plan_id = ANY(v_source_plan_ids);

    UPDATE strength_log_sets
    SET plan_id = v_target_plan_id
    WHERE plan_id = ANY(v_source_plan_ids);

    UPDATE strength_plans sp
    SET phase_definitions = mapped.phase_definitions,
        updated_at = now()
    FROM (
      SELECT
        id,
        jsonb_agg(
          CASE
            WHEN elem->>'plan_id' = ANY(ARRAY[v_push_plan.id::text, v_pull_plan.id::text])
              THEN jsonb_set(elem, '{plan_id}', to_jsonb(v_target_plan_id::text), false)
            ELSE elem
          END
          ORDER BY ordinality
        ) AS phase_definitions
      FROM strength_plans src
      CROSS JOIN LATERAL jsonb_array_elements(src.phase_definitions) WITH ORDINALITY AS phase(elem, ordinality)
      WHERE jsonb_typeof(src.phase_definitions) = 'array'
        AND EXISTS (
          SELECT 1
          FROM jsonb_array_elements(src.phase_definitions) AS probe(elem)
          WHERE probe.elem->>'plan_id' = ANY(ARRAY[v_push_plan.id::text, v_pull_plan.id::text])
        )
      GROUP BY id
    ) AS mapped
    WHERE sp.id = mapped.id;

    DELETE FROM strength_plans
    WHERE id = ANY(v_source_plan_ids);
  END LOOP;
END $$;

COMMIT;