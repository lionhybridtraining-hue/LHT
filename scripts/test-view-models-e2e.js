#!/usr/bin/env node
/**
 * E2E smoke test for the new aggregated view-model endpoints.
 *
 * Usage:
 *   node --env-file=.env scripts/test-view-models-e2e.mjs
 *
 * Calls the view-model composers directly against Supabase
 * (no HTTP auth needed — uses service role key).
 */

// Load config from env
const config = {
  supabaseUrl: process.env.SUPABASE_URL,
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
};

if (!config.supabaseUrl || !config.supabaseServiceRoleKey) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env');
  process.exit(1);
}

// Import view-model composers
const {
  composeProgramBlueprint,
  composeAthleteProfile,
  composeCalendarWeek,
} = require('../netlify/functions/_lib/view-models');

const {
  listTrainingPrograms,
  getActiveAssignmentsForAthlete,
} = require('../netlify/functions/_lib/supabase');

let passed = 0;
let failed = 0;
const errors = [];

function assert(condition, label) {
  if (condition) {
    console.log(`  ✅ ${label}`);
    passed++;
  } else {
    console.log(`  ❌ ${label}`);
    failed++;
    errors.push(label);
  }
}

async function testProgramBlueprint() {
  console.log('\n═══ Test: composeProgramBlueprint ═══');

  // 1. Get a real program ID
  const programs = await listTrainingPrograms(config);
  if (!programs || !programs.length) {
    console.log('  ⚠️  No programs found — skipping blueprint test');
    return;
  }

  const programId = programs[0].id;
  console.log(`  Using program: ${programs[0].name} (${programId})`);

  // 2. Compose the blueprint
  const bp = await composeProgramBlueprint(config, programId);

  assert(bp !== null, 'blueprint is not null');
  assert(typeof bp.id === 'string', 'blueprint.id is a string');
  assert(typeof bp.name === 'string', 'blueprint.name is a string');
  assert(Array.isArray(bp.variants), 'blueprint.variants is an array');
  assert(Array.isArray(bp.presets), 'blueprint.presets is an array');
  assert(Array.isArray(bp.sessions), 'blueprint.sessions is an array');
  assert(bp.status !== undefined, 'blueprint.status is defined');

  // Variant structure
  if (bp.variants.length > 0) {
    const v = bp.variants[0];
    assert(typeof v.id === 'string', 'variant.id is a string');
    assert(typeof v.duration_weeks === 'number', 'variant.duration_weeks is a number');
    assert(typeof v.experience_level === 'string', 'variant.experience_level is a string');
    assert(typeof v.weekly_frequency === 'number', 'variant.weekly_frequency is a number');
    assert(Array.isArray(v.compatible_presets), 'variant.compatible_presets is an array');
  }

  // Preset structure
  if (bp.presets.length > 0) {
    const p = bp.presets[0];
    assert(typeof p.id === 'string', 'preset.id is a string');
    assert(typeof p.preset_name === 'string', 'preset.preset_name is a string');
    assert(typeof p.weeks === 'object', 'preset.weeks is an object');
  }

  // Session structure
  if (bp.sessions.length > 0) {
    const s = bp.sessions[0];
    assert(typeof s.session_key === 'string', 'session.session_key is a string');
  }

  // 3. Test non-existent program
  const notFound = await composeProgramBlueprint(config, '00000000-0000-0000-0000-000000000000');
  assert(notFound === null, 'non-existent program returns null');
}

async function testAthleteProfile() {
  console.log('\n═══ Test: composeAthleteProfile ═══');

  // Find a real athlete from assignments
  const { getAthleteByEmail } = require('../netlify/functions/_lib/supabase');

  // Use any athlete — try the test account first, fallback to any
  let athleteId = null;
  try {
    const testAthlete = await getAthleteByEmail(config, 'rodrigolibanio1999@gmail.com');
    if (testAthlete) athleteId = testAthlete.id;
  } catch { /* ignore */ }

  if (!athleteId) {
    // Fallback: pick from any athlete in the system
    const { supabaseRequest } = require('../netlify/functions/_lib/supabase');
    const athletes = await supabaseRequest({
      url: config.supabaseUrl,
      serviceRoleKey: config.supabaseServiceRoleKey,
      path: 'athletes?select=id,email&limit=1',
    });
    if (athletes && athletes.length) athleteId = athletes[0].id;
  }

  if (!athleteId) {
    console.log('  ⚠️  No athletes found — skipping profile test');
    return;
  }

  console.log(`  Using athlete: ${athleteId}`);

  const profile = await composeAthleteProfile(config, athleteId);
  assert(profile !== null, 'profile is not null');
  assert(typeof profile.id === 'string', 'profile.id is a string');
  assert(typeof profile.name === 'string' || profile.name === null, 'profile.name is string or null');

  // Performance section
  assert(typeof profile.performance === 'object', 'profile.performance is an object');
  assert(profile.performance.current_vdot === null || typeof profile.performance.current_vdot === 'number',
    'performance.current_vdot is null or number');
  assert(Array.isArray(profile.performance.vdot_history), 'performance.vdot_history is array');

  // Zones section
  assert(Array.isArray(profile.zones), 'profile.zones is array');
  if (profile.zones.length > 0) {
    const z = profile.zones[0];
    assert(typeof z.modality === 'string', 'zone.modality is string');
    assert(typeof z.thresholds === 'object', 'zone.thresholds is object');
    assert(Array.isArray(z.zones), 'zone.zones is array');
  }

  // Strength section
  assert(Array.isArray(profile.strength), 'profile.strength is array');
  if (profile.strength.length > 0) {
    const s = profile.strength[0];
    assert(typeof s.exercise_id === 'string', 'strength.exercise_id is string');
    assert(typeof s.current_1rm_kg === 'number', 'strength.current_1rm_kg is number');
  }

  // Active assignments
  assert(Array.isArray(profile.active_assignments), 'profile.active_assignments is array');

  // Active instances
  assert(
    profile.active_strength_instance === null || typeof profile.active_strength_instance === 'object',
    'active_strength_instance is null or object'
  );
  assert(
    profile.active_running_instance === null || typeof profile.active_running_instance === 'object',
    'active_running_instance is null or object'
  );

  // Non-existent athlete
  const notFound = await composeAthleteProfile(config, '00000000-0000-0000-0000-000000000000');
  assert(notFound === null, 'non-existent athlete returns null');
}

async function testCalendarWeek() {
  console.log('\n═══ Test: composeCalendarWeek ═══');

  // Find an athlete with weekly plan data
  const { supabaseRequest } = require('../netlify/functions/_lib/supabase');
  const planRows = await supabaseRequest({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey,
    path: 'athlete_weekly_plan?select=athlete_id,week_start_date&limit=1&order=created_at.desc',
  });

  if (!planRows || !planRows.length) {
    console.log('  ⚠️  No weekly plan data — skipping calendar test');
    return;
  }

  const athleteId = planRows[0].athlete_id;
  const knownWeekStart = planRows[0].week_start_date;
  console.log(`  Using athlete: ${athleteId}, known week: ${knownWeekStart}`);

  // Test 1: Default week (no filter)
  const cal1 = await composeCalendarWeek(config, athleteId, {});
  assert(typeof cal1.athlete_id === 'string', 'calendar.athlete_id is string');
  assert(Array.isArray(cal1.available_weeks), 'calendar.available_weeks is array');
  assert(cal1.available_weeks.length > 0, 'calendar has available weeks');
  assert(Array.isArray(cal1.entries), 'calendar.entries is array');
  assert(cal1.week_start_date !== undefined, 'calendar.week_start_date is present');
  assert(cal1.week_number !== undefined, 'calendar.week_number is present');

  // Test 2: Filter by week_start_date
  const cal2 = await composeCalendarWeek(config, athleteId, { weekStartDate: knownWeekStart });
  assert(cal2.week_start_date === knownWeekStart, 'weekStartDate filter works');
  assert(cal2.entries.length > 0, 'weekStartDate returns entries');

  if (cal2.entries.length > 0) {
    const e = cal2.entries[0];
    assert(typeof e.id === 'string', 'entry.id is string');
    assert(typeof e.day_of_week === 'number', 'entry.day_of_week is number');
    assert(e.day_label !== undefined, 'entry.day_label is present');
    assert(e.status !== undefined, 'entry.status is present');
  }

  // Test 3: Filter by week_number
  if (cal1.week_number != null) {
    const cal3 = await composeCalendarWeek(config, athleteId, { weekNumber: cal1.week_number });
    assert(cal3.week_number === cal1.week_number, 'weekNumber filter works');
  }

  // Test 4: Empty athlete
  const cal4 = await composeCalendarWeek(config, '00000000-0000-0000-0000-000000000000', {});
  assert(cal4.entries.length === 0, 'non-existent athlete returns empty entries');
  assert(cal4.available_weeks.length === 0, 'non-existent athlete has no available weeks');
}

async function main() {
  console.log('🏃 E2E View-Model Tests');
  console.log('═══════════════════════════════════════');

  try {
    await testProgramBlueprint();
  } catch (err) {
    console.error('  💥 testProgramBlueprint crashed:', err.message);
    failed++;
    errors.push(`ProgramBlueprint crash: ${err.message}`);
  }

  try {
    await testAthleteProfile();
  } catch (err) {
    console.error('  💥 testAthleteProfile crashed:', err.message);
    failed++;
    errors.push(`AthleteProfile crash: ${err.message}`);
  }

  try {
    await testCalendarWeek();
  } catch (err) {
    console.error('  💥 testCalendarWeek crashed:', err.message);
    failed++;
    errors.push(`CalendarWeek crash: ${err.message}`);
  }

  console.log('\n═══════════════════════════════════════');
  console.log(`Results: ${passed} passed, ${failed} failed`);
  if (errors.length) {
    console.log('\nFailed:');
    errors.forEach((e) => console.log(`  • ${e}`));
  }
  console.log('');

  process.exit(failed > 0 ? 1 : 0);
}

main();
