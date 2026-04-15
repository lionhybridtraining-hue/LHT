-- Create 4W/5W/6W variants for AER strength plans.
-- Source plans (1 week) remain unchanged.
-- New variants include weekly prescriptions with notes and rep ranges when applicable.

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
  v_zero uuid := '00000000-0000-0000-0000-000000000000';
  v_duration integer;
  v_week integer;

  v_source_plan record;
  v_source_ex record;
  v_source_rx record;
  v_source_note record;

  v_variant_plan_id uuid;
  v_variant_ex_id uuid;

  v_plan_name text;
  v_plan_description text;

  v_range_min integer;
  v_range_max integer;
  v_week_note text;
  v_range_note text;
  v_note_payload text;
BEGIN
  FOR v_source_plan IN
    SELECT sp.id, sp.name, sp.description, sp.training_program_id, sp.created_by
    FROM strength_plans sp
    WHERE sp.name IN (
      'AER - Full Body Push',
      'AER - Full Body Pull',
      'AER - Lower Body A',
      'AER - Lower Body B',
      'AER - Lower Body C',
      'AER - Full Body Power'
    )
    ORDER BY sp.name
  LOOP
    FOR v_duration IN 4..6 LOOP
      v_plan_name := v_source_plan.name || ' - ' || v_duration::text || 'W';
      v_plan_description := coalesce(v_source_plan.description, 'AER strength template') ||
        ' Duration variant: ' || v_duration::text || ' weeks.';

      SELECT sp.id
        INTO v_variant_plan_id
      FROM strength_plans sp
      WHERE lower(sp.name) = lower(v_plan_name)
        AND coalesce(sp.training_program_id, v_zero) = coalesce(v_source_plan.training_program_id, v_zero)
      ORDER BY sp.created_at ASC
      LIMIT 1;

      IF v_variant_plan_id IS NULL THEN
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
          v_plan_name,
          v_plan_description,
          v_duration,
          'active',
          'migration-aer-strength-duration-variants-4w-5w-6w',
          v_source_plan.training_program_id
        )
        RETURNING id INTO v_variant_plan_id;
      ELSE
        UPDATE strength_plans
        SET description = v_plan_description,
            total_weeks = v_duration,
            status = 'active',
            updated_at = now()
        WHERE id = v_variant_plan_id;
      END IF;

      -- Rebuild variant payload so migration stays deterministic on re-run.
      DELETE FROM strength_plan_phase_notes WHERE plan_id = v_variant_plan_id;
      DELETE FROM strength_plan_day_labels WHERE plan_id = v_variant_plan_id;
      DELETE FROM strength_plan_exercises WHERE plan_id = v_variant_plan_id;

      -- Copy day labels from source (or fallback label if source has no labels).
      INSERT INTO strength_plan_day_labels (plan_id, day_number, day_label)
      SELECT v_variant_plan_id, dl.day_number, dl.day_label
      FROM strength_plan_day_labels dl
      WHERE dl.plan_id = v_source_plan.id
      ON CONFLICT (plan_id, day_number) DO UPDATE
      SET day_label = EXCLUDED.day_label,
          updated_at = now();

      IF NOT EXISTS (SELECT 1 FROM strength_plan_day_labels WHERE plan_id = v_variant_plan_id) THEN
        INSERT INTO strength_plan_day_labels (plan_id, day_number, day_label)
        VALUES (v_variant_plan_id, 1, replace(v_source_plan.name, 'AER - ', ''))
        ON CONFLICT (plan_id, day_number) DO UPDATE
        SET day_label = EXCLUDED.day_label,
            updated_at = now();
      END IF;

      -- Copy exercises and generate weekly prescriptions.
      FOR v_source_ex IN
        SELECT spe.*
        FROM strength_plan_exercises spe
        WHERE spe.plan_id = v_source_plan.id
        ORDER BY spe.day_number, spe.section, spe.exercise_order
      LOOP
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
          v_variant_plan_id,
          v_source_ex.day_number,
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
        RETURNING id INTO v_variant_ex_id;

        SELECT rx.*
          INTO v_source_rx
        FROM strength_prescriptions rx
        WHERE rx.plan_exercise_id = v_source_ex.id
          AND rx.week_number = 1
        ORDER BY rx.created_at ASC
        LIMIT 1;

        IF v_source_rx.id IS NULL THEN
          CONTINUE;
        END IF;

        FOR v_week IN 1..v_duration LOOP
          -- Use approved rep ranges whenever applicable.
          v_range_min := NULL;
          v_range_max := NULL;
          IF v_source_rx.prescription_type = 'reps'
             AND v_source_rx.reps IS NOT NULL
             AND v_source_rx.reps >= 6 THEN
            IF v_source_rx.reps <= 8 THEN
              v_range_min := 6;
              v_range_max := 8;
            ELSIF v_source_rx.reps <= 12 THEN
              v_range_min := 8;
              v_range_max := 12;
            ELSIF v_source_rx.reps <= 15 THEN
              v_range_min := 12;
              v_range_max := 15;
            ELSE
              v_range_min := 15;
              v_range_max := 20;
            END IF;
          END IF;

          IF v_week = 1 THEN
            v_week_note := 'Week ' || v_week::text || '/' || v_duration::text || ': base loading and technical consistency.';
          ELSIF v_week = v_duration THEN
            v_week_note := 'Week ' || v_week::text || '/' || v_duration::text || ': consolidation week, execute with best quality and intent.';
          ELSE
            v_week_note := 'Week ' || v_week::text || '/' || v_duration::text || ': progressive overload, maintain movement quality.';
          END IF;

          IF v_range_min IS NOT NULL THEN
            v_range_note := 'Target rep range: ' || v_range_min::text || '-' || v_range_max::text || '.';
          ELSE
            v_range_note := 'Fixed target prescription for this exercise.';
          END IF;

          v_note_payload := concat_ws(
            ' | ',
            nullif(trim(coalesce(v_source_rx.coach_notes, '')), ''),
            v_week_note,
            v_range_note
          );

          INSERT INTO strength_prescriptions (
            plan_exercise_id,
            week_number,
            prescription_type,
            sets,
            reps,
            reps_min,
            reps_max,
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
            v_variant_ex_id,
            v_week,
            v_source_rx.prescription_type,
            coalesce(v_source_rx.sets, 1),
            CASE WHEN v_range_min IS NULL THEN v_source_rx.reps ELSE NULL END,
            CASE WHEN v_range_min IS NULL THEN v_source_rx.reps_min ELSE v_range_min END,
            CASE WHEN v_range_min IS NULL THEN v_source_rx.reps_max ELSE v_range_max END,
            v_source_rx.duration_seconds,
            v_source_rx.rest_seconds,
            v_source_rx.rir,
            v_source_rx.tempo,
            v_source_rx.gct,
            coalesce(v_source_rx.method, 'standard'),
            v_source_rx.rm_percent_override,
            v_source_rx.load_override_kg,
            v_note_payload
          )
          ON CONFLICT (plan_exercise_id, week_number) DO UPDATE
          SET prescription_type = EXCLUDED.prescription_type,
              sets = EXCLUDED.sets,
              reps = EXCLUDED.reps,
              reps_min = EXCLUDED.reps_min,
              reps_max = EXCLUDED.reps_max,
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

      -- Copy source phase notes and expand for each week with weekly context.
      FOR v_source_note IN
        SELECT pn.*
        FROM strength_plan_phase_notes pn
        WHERE pn.plan_id = v_source_plan.id
          AND pn.week_number = 1
        ORDER BY pn.day_number, pn.section
      LOOP
        FOR v_week IN 1..v_duration LOOP
          IF v_week = 1 THEN
            v_week_note := 'Week context: establish execution standards and rhythm.';
          ELSIF v_week = v_duration THEN
            v_week_note := 'Week context: consolidate adaptation with high-quality reps.';
          ELSE
            v_week_note := 'Week context: progress volume/intensity within quality limits.';
          END IF;

          INSERT INTO strength_plan_phase_notes (
            plan_id,
            day_number,
            section,
            week_number,
            notes
          )
          VALUES (
            v_variant_plan_id,
            v_source_note.day_number,
            v_source_note.section,
            v_week,
            concat_ws(E'\n', nullif(trim(coalesce(v_source_note.notes, '')), ''), v_week_note)
          )
          ON CONFLICT (plan_id, day_number, section, week_number) DO UPDATE
          SET notes = EXCLUDED.notes,
              updated_at = now();
        END LOOP;
      END LOOP;

      -- If no source notes existed, add at least one observation note per week.
      IF NOT EXISTS (
        SELECT 1
        FROM strength_plan_phase_notes pn
        WHERE pn.plan_id = v_variant_plan_id
      ) THEN
        FOR v_week IN 1..v_duration LOOP
          INSERT INTO strength_plan_phase_notes (
            plan_id,
            day_number,
            section,
            week_number,
            notes
          )
          VALUES (
            v_variant_plan_id,
            1,
            'observations',
            v_week,
            'Week ' || v_week::text || '/' || v_duration::text ||
            ': preserve technical quality and progress only when execution stays stable.'
          )
          ON CONFLICT (plan_id, day_number, section, week_number) DO UPDATE
          SET notes = EXCLUDED.notes,
              updated_at = now();
        END LOOP;
      END IF;

    END LOOP;
  END LOOP;
END $$;

COMMIT;
