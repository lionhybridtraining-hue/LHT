import fs from "node:fs";
import path from "node:path";
import process from "node:process";

loadDotEnvFromWorkspace();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const args = parseArgs(process.argv.slice(2));
const programExternalId = args["program-external-id"] || "";
const programName = args["program-name"] || "Athletic Endurance Runner";
const explicitProgramId = args["program-id"] || "";
const dryRun = Boolean(args["dry-run"]);
const phaseDurationWeeksArg = toPositiveInt(args["phase-duration-weeks"], 0);
const totalWeeksList = resolveTotalWeeksList(args, phaseDurationWeeksArg);

const MODALITIES = {
  1: { key: "lhr_plus", title: "LHR+", sessionType: "threshold" },
  2: { key: "easy", title: "Easy", sessionType: "easy" },
  3: { key: "tempo", title: "Tempo Run", sessionType: "tempo" },
  5: { key: "interval", title: "Interval", sessionType: "interval" },
  6: { key: "repetition", title: "Repetition", sessionType: "repetition" },
  7: { key: "interval_combo", title: "Interval Combo", sessionType: "interval" },
  8: { key: "long_run", title: "Long Run", sessionType: "long" },
  9: { key: "long_tempo", title: "Long Tempo", sessionType: "tempo" },
};

const PRESETS = {
  2: {
    phase1: {
      Beginner: { training_presets: [[2, 2]], training_fractions: [[0.5, 0.5]] },
      Novice: { training_presets: [[2, 2]], training_fractions: [[0.5, 0.5]] },
      Intermediate: { training_presets: [[1, 8]], training_fractions: [[0.35, 0.65]] },
    },
    phase2_3: {
      Beginner: { training_presets: [[1, 8]], training_fractions: [[0.35, 0.65]] },
      Novice: { training_presets: [[1, 8]], training_fractions: [[0.35, 0.65]] },
      Intermediate: { training_presets: [[3, 8]], training_fractions: [[0.4, 0.6]] },
    },
  },
  3: {
    phase1: {
      Beginner: { training_presets: [[2, 2, 8]], training_fractions: [[0.3, 0.3, 0.4]] },
      Novice: { training_presets: [[2, 2, 8]], training_fractions: [[0.3, 0.3, 0.4]] },
      Intermediate: { training_presets: [[1, 1, 8]], training_fractions: [[0.275, 0.275, 0.45]] },
      Advanced: { training_presets: [[3, 7, 8]], training_fractions: [[0.275, 0.275, 0.45]] },
      Elite: { training_presets: [[3, 7, 8]], training_fractions: [[0.275, 0.275, 0.45]] },
    },
    phase2_3: {
      Beginner: { training_presets: [[1, 1, 8]], training_fractions: [[0.275, 0.275, 0.45]] },
      Novice: { training_presets: [[1, 1, 8]], training_fractions: [[0.275, 0.275, 0.45]] },
      Intermediate: { training_presets: [[3, 7, 8]], training_fractions: [[0.275, 0.275, 0.45]] },
      Advanced: { training_presets: [[5, 6, 9]], training_fractions: [[0.275, 0.275, 0.45]] },
      Elite: { training_presets: [[5, 6, 9]], training_fractions: [[0.275, 0.275, 0.45]] },
    },
  },
  4: {
    phase1: {
      Beginner: { training_presets: [[2, 2, 2, 8]], training_fractions: [[0.225, 0.225, 0.225, 0.325]] },
      Novice: { training_presets: [[2, 2, 2, 8]], training_fractions: [[0.225, 0.225, 0.225, 0.325]] },
      Intermediate: { training_presets: [[1, 2, 1, 8]], training_fractions: [[0.25, 0.15, 0.25, 0.35]] },
      Advanced: {
        training_presets: [[3, 2, 5, 8], [3, 2, 6, 8]],
        training_fractions: [[0.25, 0.15, 0.25, 0.35], [0.25, 0.15, 0.25, 0.35]],
      },
      Elite: {
        training_presets: [[3, 2, 5, 8], [3, 2, 6, 8]],
        training_fractions: [[0.25, 0.15, 0.25, 0.35], [0.25, 0.15, 0.25, 0.35]],
      },
    },
    phase2_3: {
      Beginner: { training_presets: [[1, 2, 1, 8]], training_fractions: [[0.225, 0.15, 0.225, 0.4]] },
      Novice: { training_presets: [[1, 2, 1, 8]], training_fractions: [[0.225, 0.15, 0.225, 0.4]] },
      Intermediate: {
        training_presets: [[3, 2, 5, 8], [3, 2, 6, 8]],
        training_fractions: [[0.275, 0.175, 0.2, 0.35], [0.275, 0.175, 0.2, 0.35]],
      },
      Advanced: { training_presets: [[5, 2, 6, 9]], training_fractions: [[0.25, 0.15, 0.25, 0.35]] },
      Elite: { training_presets: [[5, 2, 6, 9]], training_fractions: [[0.25, 0.15, 0.25, 0.35]] },
    },
  },
  5: {
    phase1: {
      Intermediate: { training_presets: [[1, 2, 1, 2, 8]], training_fractions: [[0.2, 0.15, 0.2, 0.15, 0.3]] },
      Advanced: {
        training_presets: [[3, 2, 5, 3, 8], [3, 2, 6, 3, 8]],
        training_fractions: [[0.2, 0.15, 0.2, 0.15, 0.3], [0.2, 0.15, 0.2, 0.15, 0.3]],
      },
      Elite: {
        training_presets: [[3, 2, 5, 3, 8], [3, 2, 6, 3, 8]],
        training_fractions: [[0.2, 0.15, 0.2, 0.15, 0.3], [0.2, 0.15, 0.2, 0.15, 0.3]],
      },
    },
    phase2_3: {
      Intermediate: {
        training_presets: [[3, 2, 5, 2, 8], [3, 2, 6, 2, 8]],
        training_fractions: [[0.25, 0.15, 0.2, 0.1, 0.3], [0.25, 0.15, 0.2, 0.1, 0.3]],
      },
      Advanced: { training_presets: [[5, 2, 6, 2, 9]], training_fractions: [[0.2, 0.15, 0.2, 0.15, 0.3]] },
      Elite: { training_presets: [[5, 2, 6, 2, 9]], training_fractions: [[0.2, 0.15, 0.2, 0.15, 0.3]] },
    },
  },
};

main().catch((error) => {
  console.error(error?.message || error);
  process.exit(1);
});

async function main() {
  let program = null;
  if (explicitProgramId) {
    program = await getProgramById(explicitProgramId);
  } else {
    if (programExternalId) {
      program = await getProgramByExternalId(programExternalId);
    }
    if (!program && programName) {
      program = await getProgramByName(programName);
    }
    if (!program) {
      program = await findBestProgramFallback(programExternalId || programName);
    }
  }

  if (!program) {
    const sample = await listPrograms(12);
    const sampleLabel = (sample || [])
      .map((p) => `${p.name} [id=${p.id}] [external_id=${p.external_id || "-"}] [status=${p.status || "-"}]`)
      .join("; ");
    throw new Error(
      explicitProgramId
        ? `Training program not found for id ${explicitProgramId}. Available sample: ${sampleLabel}`
          : `Training program not found for external_id ${programExternalId || "(none)"} or name ${programName || "(none)"}. Available sample: ${sampleLabel}`
    );
  }

        const plans = totalWeeksList.flatMap((weeks) => buildPlans(weeks));
  console.log(`Program: ${program.name} (${program.id})`);
        console.log(`Durations: ${totalWeeksList.join(", ")} weeks`);
  console.log(`Plans to process: ${plans.length}`);

  if (dryRun) {
    for (const plan of plans) {
      console.log(`[DRY-RUN] ${plan.name}: ${plan.sessions.length} sessions across ${plan.totalWeeks} weeks`);
    }
    return;
  }

  const workoutTemplatesByModality = await ensureWorkoutTemplates();

  let templatesSynced = 0;
  let sessionsInserted = 0;

  for (const plan of plans) {
    const template = await upsertPlanTemplate(program.id, plan);
    await deleteSessionsForPlan(template.id);

    const payload = plan.sessions.map((s) => ({
      plan_template_id: template.id,
      week_number: s.week_number,
      session_key: s.session_key,
      workout_template_id: workoutTemplatesByModality[s.training_idx],
      session_type: s.session_type,
      progression_rule: { weekly_volume_pct: s.weekly_volume_pct },
      notes: s.notes,
    }));

    await post("running_plan_template_sessions", payload, { prefer: "return=representation" });

    templatesSynced += 1;
    sessionsInserted += payload.length;
    console.log(`Synced ${plan.name}: ${payload.length} sessions`);
  }

  console.log("Done");
  console.log(`Templates synced: ${templatesSynced}`);
  console.log(`Sessions inserted: ${sessionsInserted}`);
}

function buildPlans(totalWeeks) {
  const phaseDurationWeeks = resolvePhaseDurationWeeks(totalWeeks);
  const plans = [];

  for (const [freqRaw, freqPreset] of Object.entries(PRESETS)) {
    const frequency = Number(freqRaw);
    const levels = new Set([...Object.keys(freqPreset.phase1 || {}), ...Object.keys(freqPreset.phase2_3 || {})]);

    for (const level of levels) {
      const phase1 = freqPreset.phase1?.[level];
      const phase23 = freqPreset.phase2_3?.[level];
      if (!isValidPreset(phase1) || !isValidPreset(phase23)) continue;

      const sessions = [];
      for (let week = 1; week <= totalWeeks; week += 1) {
        const isPhase1 = week <= phaseDurationWeeks;
        const phase = isPhase1 ? "phase1" : "phase2_3";
        const preset = isPhase1 ? phase1 : phase23;
        const weekInsidePhase = ((week - 1) % phaseDurationWeeks) + 1;
        const variantIndex = preset.training_presets.length > 1 ? (weekInsidePhase % 2 === 1 ? 0 : 1) : 0;
        const trainingList = preset.training_presets[variantIndex];
        const fractions = preset.training_fractions[variantIndex];
        sessions.push(...makeWeekRows(week, phase, variantIndex, trainingList, fractions));
      }

      plans.push({
        name: `AER Legacy ${totalWeeks}w ${frequency}x ${level}`,
        objective: `Imported from aer-backend presets. ${totalWeeks} weeks, frequency ${frequency}x/week, level ${level}.`,
        frequency,
        level,
        totalWeeks,
        sessions,
      });
    }
  }

  return plans;
}

function makeWeekRows(week, phase, variantIndex, trainingList, fractions) {
  const rows = [];
  let sum = 0;

  for (let i = 0; i < trainingList.length; i += 1) {
    const trainingIdx = trainingList[i];
    const modality = MODALITIES[trainingIdx];
    if (!modality) throw new Error(`Unsupported training index ${trainingIdx}`);

    let pct = Number((fractions[i] * 100).toFixed(2));
    if (i === trainingList.length - 1) {
      pct = Number((100 - sum).toFixed(2));
    }
    sum += pct;

    rows.push({
      week_number: week,
      session_key: `S${i + 1}`,
      session_label: modality.title,
      session_order: i + 1,
      training_idx: trainingIdx,
      session_type: modality.sessionType,
      weekly_volume_pct: pct,
      notes: `Seeded from aer-backend preset (${phase}, variant ${variantIndex === 0 ? "A" : "B"}, modality ${modality.key})`,
    });
  }

  return rows;
}

function isValidPreset(preset) {
  return Boolean(
    preset
      && Array.isArray(preset.training_presets)
      && Array.isArray(preset.training_fractions)
      && preset.training_presets.length > 0
      && preset.training_presets.length === preset.training_fractions.length
  );
}

async function ensureWorkoutTemplates() {
  const byTrainingIdx = {};

  for (const [trainingIdxRaw, modality] of Object.entries(MODALITIES)) {
    const trainingIdx = Number(trainingIdxRaw);
    const existing = await get(
      `running_workout_templates?name=eq.${encodeURIComponent(`AER Legacy - ${modality.title}`)}&session_type=eq.${encodeURIComponent(modality.sessionType)}&select=id&limit=1`
    );

    if (Array.isArray(existing) && existing[0]?.id) {
      byTrainingIdx[trainingIdx] = existing[0].id;
      continue;
    }

    const created = await post("running_workout_templates", [{
      name: `AER Legacy - ${modality.title}`,
      session_type: modality.sessionType,
      objective: `Seed template for ${modality.title} imported from aer-backend presets`,
      target_metric: "pace",
      structure_version: "v1",
      is_library: true,
    }], { prefer: "return=representation" });

    byTrainingIdx[trainingIdx] = created[0].id;
  }

  return byTrainingIdx;
}

async function upsertPlanTemplate(trainingProgramId, plan) {
  const existing = await get(
    `running_plan_templates?training_program_id=eq.${encodeURIComponent(trainingProgramId)}&name=eq.${encodeURIComponent(plan.name)}&select=id&limit=1`
  );

  const payload = {
    training_program_id: trainingProgramId,
    name: plan.name,
    objective: plan.objective,
    total_weeks: plan.totalWeeks,
    default_metric_model: "vdot",
    default_vdot_source: "coach_set",
    status: "active",
    engine_version: "running-v1",
    created_by: "seed-running-plans-from-aer-backend",
  };

  if (Array.isArray(existing) && existing.length > 0) {
    const updated = await patch(`running_plan_templates?id=eq.${encodeURIComponent(existing[0].id)}`, payload, { prefer: "return=representation" });
    return updated[0];
  }

  const created = await post("running_plan_templates", [payload], { prefer: "return=representation" });
  return created[0];
}

async function deleteSessionsForPlan(planId) {
  await del(`running_plan_template_sessions?plan_template_id=eq.${encodeURIComponent(planId)}`);
}

async function getProgramByExternalId(externalId) {
  const rows = await get(
    `training_programs?external_id=eq.${encodeURIComponent(externalId)}&deleted_at=is.null&select=id,name,external_id,status&limit=1`
  );
  return Array.isArray(rows) ? rows[0] || null : null;
}

async function getProgramByName(name) {
  const normalized = String(name || "").trim();
  if (!normalized) return null;
  const rows = await get(
    `training_programs?name=ilike.${encodeURIComponent(normalized)}&deleted_at=is.null&select=id,name,external_id,status&order=created_at.desc&limit=5`
  );
  if (!Array.isArray(rows) || rows.length === 0) return null;

  const exact = rows.find((row) => String(row.name || "").trim().toLowerCase() === normalized.toLowerCase());
  return exact || rows[0] || null;
}

async function getProgramById(programId) {
  const rows = await get(
    `training_programs?id=eq.${encodeURIComponent(programId)}&deleted_at=is.null&select=id,name,external_id,status&limit=1`
  );
  return Array.isArray(rows) ? rows[0] || null : null;
}

async function listPrograms(limit = 20) {
  const rows = await get(
    `training_programs?deleted_at=is.null&select=id,name,external_id,status&order=created_at.desc&limit=${encodeURIComponent(limit)}`
  );
  return Array.isArray(rows) ? rows : [];
}

async function findBestProgramFallback(hint) {
  const normalizedHint = String(hint || "").trim().toLowerCase();
  const rows = await listPrograms(100);
  if (!rows.length) return null;

  const active = rows.filter((p) => p.status === "active");
  const pool = active.length > 0 ? active : rows;

  const exactExternal = pool.find((p) => String(p.external_id || "").toLowerCase() === normalizedHint);
  if (exactExternal) return exactExternal;

  const containsHint = pool.find((p) => {
    const ext = String(p.external_id || "").toLowerCase();
    const name = String(p.name || "").toLowerCase();
    return ext.includes(normalizedHint) || name.includes(normalizedHint);
  });
  if (containsHint) return containsHint;

  const aerName = pool.find((p) => {
    const ext = String(p.external_id || "").toLowerCase();
    const name = String(p.name || "").toLowerCase();
    return ext.includes("aer") || name.includes("aer");
  });
  if (aerName) return aerName;

  return pool[0] || null;
}

async function get(pathAndQuery) {
  return request(pathAndQuery, { method: "GET" });
}

async function post(pathAndQuery, body, opts = {}) {
  return request(pathAndQuery, {
    method: "POST",
    body,
    prefer: opts.prefer || "return=representation",
  });
}

async function patch(pathAndQuery, body, opts = {}) {
  return request(pathAndQuery, {
    method: "PATCH",
    body,
    prefer: opts.prefer || "return=representation",
  });
}

async function del(pathAndQuery) {
  return request(pathAndQuery, {
    method: "DELETE",
    prefer: "return=minimal",
  });
}

async function request(pathAndQuery, options = {}) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${pathAndQuery}`, {
    method: options.method || "GET",
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
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

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) continue;

    const body = token.slice(2);
    const eqIdx = body.indexOf("=");
    if (eqIdx >= 0) {
      out[body.slice(0, eqIdx)] = body.slice(eqIdx + 1);
      continue;
    }

    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      out[body] = true;
    } else {
      out[body] = next;
      i += 1;
    }
  }
  return out;
}

function toPositiveInt(raw, fallback) {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.floor(n);
}

function resolveTotalWeeksList(parsedArgs, phaseDurationWeeksArg) {
  const raw = String(parsedArgs["total-weeks"] || parsedArgs["total-weeks-list"] || "").trim();
  if (raw) {
    const weeks = raw
      .split(",")
      .map((item) => Number(item.trim()))
      .filter((n) => Number.isInteger(n) && n >= 4);
    const unique = [...new Set(weeks)];
    if (unique.length > 0) {
      return unique;
    }
  }

  if (phaseDurationWeeksArg >= 1) {
    return [phaseDurationWeeksArg * 3];
  }

  return [15, 18];
}

function resolvePhaseDurationWeeks(totalWeeks) {
  const n = Number(totalWeeks);
  if (!Number.isInteger(n) || n < 4) {
    throw new Error(`Invalid total weeks: ${totalWeeks}`);
  }
  if (n % 3 !== 0) {
    throw new Error(`Total weeks ${n} is not divisible by 3 (required for phase1/phase2/phase3 split).`);
  }
  return n / 3;
}

function loadDotEnvFromWorkspace() {
  const envPath = path.resolve(process.cwd(), ".env");
  if (!fs.existsSync(envPath)) return;

  const raw = fs.readFileSync(envPath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const idx = trimmed.indexOf("=");
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
