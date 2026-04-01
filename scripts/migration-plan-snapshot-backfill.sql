-- Backfill Phase 5.1 snapshots for legacy strength instances.
-- Fills strength_plan_instances.plan_snapshot only when currently NULL,
-- using the current template data from the linked plan_id.

UPDATE strength_plan_instances spi
SET plan_snapshot = jsonb_build_object(
  'exercises',
  COALESCE((
    SELECT jsonb_agg(
      jsonb_build_object(
        'id', spe.id,
        'plan_id', spe.plan_id,
        'day_number', spe.day_number,
        'section', spe.section,
        'superset_group', spe.superset_group,
        'exercise_order', spe.exercise_order,
        'exercise_id', spe.exercise_id,
        'each_side', spe.each_side,
        'weight_per_side', spe.weight_per_side,
        'plyo_mechanical_load', spe.plyo_mechanical_load,
        'rm_percent_increase_per_week', spe.rm_percent_increase_per_week,
        'alt_progression_exercise_id', spe.alt_progression_exercise_id,
        'alt_regression_exercise_id', spe.alt_regression_exercise_id,
        'created_at', spe.created_at,
        'exercise', CASE
          WHEN ex.id IS NULL THEN NULL
          ELSE jsonb_build_object(
            'id', ex.id,
            'name', ex.name,
            'category', ex.category,
            'subcategory', ex.subcategory,
            'video_url', ex.video_url,
            'description', ex.description,
            'default_weight_per_side', ex.default_weight_per_side,
            'default_each_side', ex.default_each_side,
            'default_tempo', ex.default_tempo,
            'progression_of', ex.progression_of,
            'regression_of', ex.regression_of
          )
        END,
        'alt_progression_exercise', CASE
          WHEN ex_prog.id IS NULL THEN NULL
          ELSE jsonb_build_object(
            'id', ex_prog.id,
            'name', ex_prog.name,
            'category', ex_prog.category,
            'subcategory', ex_prog.subcategory,
            'video_url', ex_prog.video_url,
            'description', ex_prog.description,
            'default_weight_per_side', ex_prog.default_weight_per_side,
            'default_each_side', ex_prog.default_each_side,
            'default_tempo', ex_prog.default_tempo,
            'progression_of', ex_prog.progression_of,
            'regression_of', ex_prog.regression_of
          )
        END,
        'alt_regression_exercise', CASE
          WHEN ex_reg.id IS NULL THEN NULL
          ELSE jsonb_build_object(
            'id', ex_reg.id,
            'name', ex_reg.name,
            'category', ex_reg.category,
            'subcategory', ex_reg.subcategory,
            'video_url', ex_reg.video_url,
            'description', ex_reg.description,
            'default_weight_per_side', ex_reg.default_weight_per_side,
            'default_each_side', ex_reg.default_each_side,
            'default_tempo', ex_reg.default_tempo,
            'progression_of', ex_reg.progression_of,
            'regression_of', ex_reg.regression_of
          )
        END
      )
      ORDER BY spe.day_number ASC, spe.exercise_order ASC
    )
    FROM strength_plan_exercises spe
    LEFT JOIN exercises ex ON ex.id = spe.exercise_id
    LEFT JOIN exercises ex_prog ON ex_prog.id = spe.alt_progression_exercise_id
    LEFT JOIN exercises ex_reg ON ex_reg.id = spe.alt_regression_exercise_id
    WHERE spe.plan_id = spi.plan_id
  ), '[]'::jsonb),
  'prescriptions',
  COALESCE((
    SELECT jsonb_agg(to_jsonb(rx) ORDER BY rx.week_number ASC)
    FROM strength_prescriptions rx
    JOIN strength_plan_exercises spe ON spe.id = rx.plan_exercise_id
    WHERE spe.plan_id = spi.plan_id
  ), '[]'::jsonb),
  'phaseNotes',
  COALESCE((
    SELECT jsonb_agg(to_jsonb(note) ORDER BY note.day_number ASC, note.week_number ASC)
    FROM strength_plan_phase_notes note
    WHERE note.plan_id = spi.plan_id
  ), '[]'::jsonb)
)
WHERE spi.plan_snapshot IS NULL
  AND EXISTS (
    SELECT 1
    FROM strength_plans p
    WHERE p.id = spi.plan_id
  );
