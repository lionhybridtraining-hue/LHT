#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const TARGET_EMAIL = 'rodrigolibanio1999@gmail.com';
const PROGRAM_EXTERNAL_SOURCE = 'manual_seed';
const PROGRAM_EXTERNAL_ID = 'LHT_TEST_HYBRID_VARIANTS_APP';
const PROGRAM_NAME = 'LHT Teste Hibrido Variants';
const PROGRAM_DURATION_WEEKS = 6;
const TARGET_VDOT = 44;
const TARGET_THRESHOLD_PACE_SEC_PER_KM = 297;

loadDotEnvFromWorkspace();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required in the workspace .env file.');
}

const today = new Date().toISOString().slice(0, 10);
const nowIso = new Date().toISOString();

main().catch((error) => {
  console.error('[seed-athlete-test-program] Failed:', error.message || error);
  process.exitCode = 1;
});

async function main() {
  const athlete = await requireSingle(
    `athletes?email=eq.${encodeURIComponent(TARGET_EMAIL)}&select=id,email,identity_id,name,weekly_frequency,experience_level,onboarding_answers&limit=1`,
    `athlete ${TARGET_EMAIL}`
  );

  await resetAthleteProgramState(athlete);

  const program = await upsertProgram();
  await clearProgramStructure(program.id);

  const bindings = await loadBindings();
  const sessions = await seedSessions(program.id, bindings);
  const presets = await seedPresets(program.id);
  await seedSlots(presets, sessions, PROGRAM_DURATION_WEEKS);

  const variants = await seedVariants(program.id, bindings);
  await seedVariantPresetLinks(variants, presets);

  const defaultVariant = variants.find((variant) => (
    Number(variant.duration_weeks) === 6
    && variant.experience_level === 'intermediate'
    && Number(variant.weekly_frequency) === 3
  ));
  if (!defaultVariant) {
    throw new Error('Failed to resolve the default 6-week intermediate 3x variant.');
  }

  await patch(
    `training_programs?id=eq.${encodeURIComponent(program.id)}`,
    {
      default_variant_id: defaultVariant.id,
      duration_weeks: PROGRAM_DURATION_WEEKS,
      status: 'active',
      updated_at: nowIso,
    },
    { prefer: 'return=representation' }
  );

  await seedAthleteReadiness(athlete.id);

  const assignment = await requireSingle(
    'program_assignments',
    'program assignment',
    {
      method: 'POST',
      body: [{
        athlete_id: athlete.id,
        coach_id: null,
        training_program_id: program.id,
        start_date: today,
        duration_weeks: PROGRAM_DURATION_WEEKS,
        status: 'active',
        price_cents_snapshot: 0,
        currency_snapshot: 'EUR',
        followup_type_snapshot: 'standard',
        notes: 'Seeded hybrid test program for athlete app validation',
      }],
      prefer: 'return=representation'
    }
  );

  const summary = {
    athlete: {
      id: athlete.id,
      email: athlete.email,
      name: athlete.name,
    },
    program: {
      id: program.id,
      name: PROGRAM_NAME,
      external_id: PROGRAM_EXTERNAL_ID,
    },
    assignment: {
      id: assignment.id,
      status: assignment.status,
      start_date: assignment.start_date,
      duration_weeks: assignment.duration_weeks,
    },
    variants: variants.map((variant) => ({
      id: variant.id,
      duration_weeks: variant.duration_weeks,
      experience_level: variant.experience_level,
      weekly_frequency: variant.weekly_frequency,
      strength_plan_id: variant.strength_plan_id,
      running_plan_template_id: variant.running_plan_template_id,
    })),
    presets: Object.values(presets).map((preset) => ({
      id: preset.id,
      preset_name: preset.preset_name,
      total_training_days: preset.total_training_days,
    })),
    default_variant_id: defaultVariant.id,
    seeded_vdot: TARGET_VDOT,
  };

  console.log(JSON.stringify(summary, null, 2));
}

async function resetAthleteProgramState(athlete) {
  const athleteId = athlete.id;
  const identityId = athlete.identity_id || null;

  await del(`athlete_weekly_plan?athlete_id=eq.${encodeURIComponent(athleteId)}`);
  await del(`strength_log_sets?athlete_id=eq.${encodeURIComponent(athleteId)}`);

  const runningInstances = await get(
    `running_plan_instances?athlete_id=eq.${encodeURIComponent(athleteId)}&select=id`
  );
  if (runningInstances.length > 0) {
    const ids = runningInstances.map((row) => row.id).filter(Boolean);
    const filter = ids.map((value) => encodeURIComponent(value)).join(',');
    await del(`running_workout_instances?running_plan_instance_id=in.(${filter})`).catch(() => null);
    await del(`running_plan_instances?id=in.(${filter})`);
  }

  await del(`strength_plan_instances?athlete_id=eq.${encodeURIComponent(athleteId)}`);
  await del(`program_assignments?athlete_id=eq.${encodeURIComponent(athleteId)}`);
  if (identityId) {
    await del(`stripe_purchases?identity_id=eq.${encodeURIComponent(identityId)}`);
  }
  await del(`stripe_purchases?email=ilike.${encodeURIComponent(TARGET_EMAIL)}`);
  await del(`athlete_running_vdot_history?athlete_id=eq.${encodeURIComponent(athleteId)}`);
}

async function upsertProgram() {
  const payload = {
    external_source: PROGRAM_EXTERNAL_SOURCE,
    external_id: PROGRAM_EXTERNAL_ID,
    name: PROGRAM_NAME,
    commercial_description: 'Programa de teste hibrido com variantes e varios calendarios para validar o fluxo do atleta.',
    technical_description: 'Seed tecnico para testar recomendacao de variante, escolha de calendario e geracao do plano semanal.',
    description: 'Programa de teste de 6 semanas com corrida e forca, desenhado para exercitar o novo fluxo variante + calendario compativel.',
    classification: {
      primaryCategory: 'hybrid',
      tags: ['test', 'calendar-variants', 'athlete-app']
    },
    duration_weeks: PROGRAM_DURATION_WEEKS,
    price_cents: 0,
    currency: 'EUR',
    status: 'active',
    billing_type: 'one_time',
    access_model: 'self_serve',
    payment_model: 'single',
    preset_selection: 'athlete',
  };

  const existing = await get(
    `training_programs?external_source=eq.${encodeURIComponent(PROGRAM_EXTERNAL_SOURCE)}&external_id=eq.${encodeURIComponent(PROGRAM_EXTERNAL_ID)}&deleted_at=is.null&select=id&limit=1`
  );

  if (existing.length > 0) {
    return requireSingle(
      `training_programs?id=eq.${encodeURIComponent(existing[0].id)}`,
      'seed program update',
      {
        method: 'PATCH',
        body: { ...payload, updated_at: nowIso },
        prefer: 'return=representation'
      }
    );
  }

  return requireSingle(
    'training_programs',
    'seed program create',
    {
      method: 'POST',
      body: [{ ...payload, created_at: nowIso, updated_at: nowIso }],
      prefer: 'return=representation'
    }
  );
}

async function clearProgramStructure(programId) {
  await patch(
    `training_programs?id=eq.${encodeURIComponent(programId)}`,
    { default_variant_id: null, updated_at: nowIso },
    { prefer: 'return=representation' }
  ).catch(() => null);

  await del(`program_variants?training_program_id=eq.${encodeURIComponent(programId)}`);
  await del(`program_schedule_presets?training_program_id=eq.${encodeURIComponent(programId)}`);
  await del(`program_weekly_sessions?training_program_id=eq.${encodeURIComponent(programId)}`);
}

async function loadBindings() {
  const bindings = {
    strength4: await findByNames('strength_plans', [
      'AER - Full Body Push/Pull - 4W'
    ]),
    strength5: await findByNames('strength_plans', [
      'AER - Full Body Push/Pull - 5W'
    ]),
    strength6: await findByNames('strength_plans', [
      'AER - Full Body Push/Pull - 6W'
    ]),
    running15x3Beginner: await findByNames('running_plan_templates', [
      'AER Legacy 15w 3x Beginner/Novice',
      'AER Legacy 15w 3x Intermediate'
    ]),
    running15x3Intermediate: await findByNames('running_plan_templates', [
      'AER Legacy 15w 3x Intermediate'
    ]),
    running18x3Intermediate: await findByNames('running_plan_templates', [
      'AER Legacy 18w 3x Intermediate'
    ]),
    running18x4Intermediate: await findByNames('running_plan_templates', [
      'AER Legacy 18w 4x Intermediate'
    ]),
  };

  return bindings;
}

async function seedSessions(programId, bindings) {
  const sessionRows = [
    {
      training_program_id: programId,
      session_key: 'run_easy',
      session_type: 'running',
      session_label: 'Corrida Base',
      strength_day_number: null,
      running_session_type: 'easy',
      duration_estimate_min: 45,
      intensity: 'low',
      is_optional: false,
      sort_priority: 10,
      strength_plan_id: null,
      running_plan_template_id: bindings.running18x3Intermediate.id,
    },
    {
      training_program_id: programId,
      session_key: 'run_quality',
      session_type: 'running',
      session_label: 'Corrida de Qualidade',
      strength_day_number: null,
      running_session_type: 'threshold',
      duration_estimate_min: 55,
      intensity: 'high',
      is_optional: false,
      sort_priority: 20,
      strength_plan_id: null,
      running_plan_template_id: bindings.running18x3Intermediate.id,
    },
    {
      training_program_id: programId,
      session_key: 'run_long',
      session_type: 'running',
      session_label: 'Longo',
      strength_day_number: null,
      running_session_type: 'long',
      duration_estimate_min: 75,
      intensity: 'moderate',
      is_optional: false,
      sort_priority: 30,
      strength_plan_id: null,
      running_plan_template_id: bindings.running18x3Intermediate.id,
    },
    {
      training_program_id: programId,
      session_key: 'strength_a',
      session_type: 'strength',
      session_label: 'Forca A',
      strength_day_number: 1,
      running_session_type: null,
      duration_estimate_min: 45,
      intensity: 'moderate',
      is_optional: false,
      sort_priority: 40,
      strength_plan_id: bindings.strength6.id,
      running_plan_template_id: null,
    },
    {
      training_program_id: programId,
      session_key: 'strength_b',
      session_type: 'strength',
      session_label: 'Forca B',
      strength_day_number: 2,
      running_session_type: null,
      duration_estimate_min: 45,
      intensity: 'moderate',
      is_optional: false,
      sort_priority: 50,
      strength_plan_id: bindings.strength6.id,
      running_plan_template_id: null,
    }
  ];

  await post('program_weekly_sessions?on_conflict=training_program_id,session_key', sessionRows, {
    prefer: 'return=representation,resolution=merge-duplicates'
  });

  const created = await get(
    `program_weekly_sessions?training_program_id=eq.${encodeURIComponent(programId)}&select=id,session_key&order=sort_priority.asc`
  );

  return Object.fromEntries(created.map((row) => [row.session_key, row]));
}

async function seedPresets(programId) {
  const presetRows = [
    {
      training_program_id: programId,
      preset_name: 'Base 3 Dias',
      description: 'Compacta as cinco sessoes em tres dias, com duas jornadas de dupla sessao.',
      total_training_days: 3,
      is_default: true,
      sort_order: 0,
    },
    {
      training_program_id: programId,
      preset_name: 'Equilibrado 4 Dias',
      description: 'Distribui melhor a carga semanal e deixa apenas uma jornada com dupla sessao.',
      total_training_days: 4,
      is_default: false,
      sort_order: 1,
    },
    {
      training_program_id: programId,
      preset_name: 'Distribuido 5 Dias',
      description: 'Espalha corrida e forca por cinco dias para reduzir acumulacao de fadiga.',
      total_training_days: 5,
      is_default: false,
      sort_order: 2,
    }
  ];

  await post('program_schedule_presets?on_conflict=training_program_id,preset_name', presetRows, {
    prefer: 'return=representation,resolution=merge-duplicates'
  });

  const created = await get(
    `program_schedule_presets?training_program_id=eq.${encodeURIComponent(programId)}&select=id,preset_name,total_training_days,is_default&order=sort_order.asc`
  );

  return Object.fromEntries(created.map((row) => [row.preset_name, row]));
}

async function seedSlots(presets, sessions, totalWeeks) {
  const slotRows = [];

  for (let weekNumber = 1; weekNumber <= totalWeeks; weekNumber += 1) {
    slotRows.push(
      buildSlot(presets['Base 3 Dias'].id, weekNumber, 1, 1, sessions.strength_a.id, 10),
      buildSlot(presets['Base 3 Dias'].id, weekNumber, 1, 2, sessions.run_easy.id, 20),
      buildSlot(presets['Base 3 Dias'].id, weekNumber, 3, 1, sessions.run_quality.id, 30),
      buildSlot(presets['Base 3 Dias'].id, weekNumber, 5, 1, sessions.strength_b.id, 40),
      buildSlot(presets['Base 3 Dias'].id, weekNumber, 5, 2, sessions.run_long.id, 50),

      buildSlot(presets['Equilibrado 4 Dias'].id, weekNumber, 0, 1, sessions.strength_a.id, 10),
      buildSlot(presets['Equilibrado 4 Dias'].id, weekNumber, 1, 1, sessions.run_quality.id, 20),
      buildSlot(presets['Equilibrado 4 Dias'].id, weekNumber, 3, 1, sessions.run_easy.id, 30),
      buildSlot(presets['Equilibrado 4 Dias'].id, weekNumber, 5, 1, sessions.strength_b.id, 40),
      buildSlot(presets['Equilibrado 4 Dias'].id, weekNumber, 5, 2, sessions.run_long.id, 50),

      buildSlot(presets['Distribuido 5 Dias'].id, weekNumber, 0, 1, sessions.strength_a.id, 10),
      buildSlot(presets['Distribuido 5 Dias'].id, weekNumber, 1, 1, sessions.run_quality.id, 20),
      buildSlot(presets['Distribuido 5 Dias'].id, weekNumber, 3, 1, sessions.run_easy.id, 30),
      buildSlot(presets['Distribuido 5 Dias'].id, weekNumber, 4, 1, sessions.strength_b.id, 40),
      buildSlot(presets['Distribuido 5 Dias'].id, weekNumber, 6, 1, sessions.run_long.id, 50),
    );
  }

  await post('program_schedule_slots?on_conflict=preset_id,week_number,day_of_week,time_slot', slotRows, {
    prefer: 'return=representation,resolution=merge-duplicates'
  });
}

async function seedVariants(programId, bindings) {
  const variantRows = [
    {
      training_program_id: programId,
      duration_weeks: 4,
      experience_level: 'beginner',
      weekly_frequency: 3,
      strength_plan_id: bindings.strength4.id,
      running_plan_template_id: bindings.running15x3Beginner.id,
      running_config_preset: {
        initial_weekly_volume_km: 22,
        weekly_progression_pct: 3,
        periodization_type: 'linear',
      },
    },
    {
      training_program_id: programId,
      duration_weeks: 5,
      experience_level: 'intermediate',
      weekly_frequency: 3,
      strength_plan_id: bindings.strength5.id,
      running_plan_template_id: bindings.running15x3Intermediate.id,
      running_config_preset: {
        initial_weekly_volume_km: 28,
        weekly_progression_pct: 4,
        periodization_type: 'linear',
      },
    },
    {
      training_program_id: programId,
      duration_weeks: 6,
      experience_level: 'intermediate',
      weekly_frequency: 3,
      strength_plan_id: bindings.strength6.id,
      running_plan_template_id: bindings.running18x3Intermediate.id,
      running_config_preset: {
        initial_weekly_volume_km: 32,
        weekly_progression_pct: 4,
        periodization_type: 'linear',
      },
    },
    {
      training_program_id: programId,
      duration_weeks: 6,
      experience_level: 'intermediate',
      weekly_frequency: 4,
      strength_plan_id: bindings.strength6.id,
      running_plan_template_id: bindings.running18x4Intermediate.id,
      running_config_preset: {
        initial_weekly_volume_km: 36,
        weekly_progression_pct: 4,
        periodization_type: 'linear',
      },
    }
  ];

  await post(
    'program_variants?on_conflict=training_program_id,duration_weeks,experience_level,weekly_frequency',
    variantRows,
    { prefer: 'return=representation,resolution=merge-duplicates' }
  );

  return get(
    `program_variants?training_program_id=eq.${encodeURIComponent(programId)}&select=id,duration_weeks,experience_level,weekly_frequency,strength_plan_id,running_plan_template_id&order=duration_weeks.asc,experience_level.asc,weekly_frequency.asc`
  );
}

async function seedVariantPresetLinks(variants, presets) {
  if (!Array.isArray(variants) || variants.length === 0) {
    throw new Error('Cannot seed variant preset links without variants.');
  }

  const rows = [];
  for (const variant of variants) {
    const frequency = Number(variant.weekly_frequency);
    if (frequency <= 3) {
      rows.push(
        { variant_id: variant.id, preset_id: presets['Base 3 Dias'].id, sort_order: 0, is_default: true },
        { variant_id: variant.id, preset_id: presets['Equilibrado 4 Dias'].id, sort_order: 1, is_default: false },
      );
      continue;
    }

    rows.push(
      { variant_id: variant.id, preset_id: presets['Equilibrado 4 Dias'].id, sort_order: 0, is_default: true },
      { variant_id: variant.id, preset_id: presets['Distribuido 5 Dias'].id, sort_order: 1, is_default: false },
    );
  }

  await post('program_variant_preset_links', rows, { prefer: 'return=representation' });
}

async function seedAthleteReadiness(athleteId) {
  await patch(
    `athletes?id=eq.${encodeURIComponent(athleteId)}`,
    {
      vdot: TARGET_VDOT,
      strength_level: 'intermediate',
      updated_at: nowIso,
    },
    { prefer: 'return=representation' }
  ).catch(() => null);

  await post('athlete_running_vdot_history', [{
    athlete_id: athleteId,
    training_session_id: null,
    source_type: 'coach_set',
    source_label: 'Seeded for athlete app variant test',
    race_distance_km: null,
    effort_duration_seconds: null,
    vdot: TARGET_VDOT,
    threshold_pace_sec_per_km: TARGET_THRESHOLD_PACE_SEC_PER_KM,
    confidence: 0.95,
    measured_at: nowIso,
    is_current: true,
  }], { prefer: 'return=representation' });
}

function buildSlot(presetId, weekNumber, dayOfWeek, timeSlot, sessionId, sortOrder) {
  return {
    preset_id: presetId,
    week_number: weekNumber,
    day_of_week: dayOfWeek,
    time_slot: timeSlot,
    session_id: sessionId,
    sort_order: sortOrder,
  };
}

async function findByNames(table, candidateNames) {
  for (const name of candidateNames) {
    const rows = await get(
      `${table}?name=eq.${encodeURIComponent(name)}&select=id,name,total_weeks,status&order=created_at.desc&limit=1`
    );
    if (rows[0]) return rows[0];
  }
  throw new Error(`Could not resolve a row in ${table} for: ${candidateNames.join(', ')}`);
}

async function requireSingle(pathAndQuery, label, options) {
  const rows = await request(pathAndQuery, options);
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error(`Expected one row for ${label}, got none.`);
  }
  return rows[0];
}

async function get(pathAndQuery) {
  const rows = await request(pathAndQuery, { method: 'GET' });
  return Array.isArray(rows) ? rows : [];
}

async function post(pathAndQuery, body, options = {}) {
  return request(pathAndQuery, {
    method: 'POST',
    body,
    prefer: options.prefer || 'return=representation',
  });
}

async function patch(pathAndQuery, body, options = {}) {
  return request(pathAndQuery, {
    method: 'PATCH',
    body,
    prefer: options.prefer || 'return=representation',
  });
}

async function del(pathAndQuery) {
  return request(pathAndQuery, {
    method: 'DELETE',
    prefer: 'return=representation',
  });
}

async function request(pathAndQuery, options = {}) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${pathAndQuery}`, {
    method: options.method || 'GET',
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      ...(options.prefer ? { Prefer: options.prefer } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const text = await response.text();
  const payload = text ? safeJsonParse(text) : null;
  if (!response.ok) {
    throw new Error(`Supabase ${response.status} on ${pathAndQuery}: ${text}`);
  }
  return payload;
}

function safeJsonParse(value) {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function loadDotEnvFromWorkspace() {
  const envPath = path.resolve(process.cwd(), '.env');
  if (!fs.existsSync(envPath)) return;

  const raw = fs.readFileSync(envPath, 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const idx = trimmed.indexOf('=');
    if (idx <= 0) continue;

    const key = trimmed.slice(0, idx).trim();
    let value = trimmed.slice(idx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}