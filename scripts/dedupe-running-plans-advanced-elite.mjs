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
const apply = Boolean(args.apply);
const targetProgramName = String(args["program-name"] || "Athletic Endurance Runner").trim();

main().catch((err) => {
  console.error(err?.message || err);
  process.exit(1);
});

async function main() {
  const program = await resolveTargetProgram(targetProgramName);
  if (!program) {
    throw new Error(`Program not found: ${targetProgramName}`);
  }

  const templates = await get(
    `running_plan_templates?training_program_id=eq.${encodeURIComponent(program.id)}&select=id,name,objective,total_weeks,status&order=name`
  );

  const candidates = templates.filter((t) => /\b(Advanced|Elite)\b/i.test(String(t.name || "")));
  const byBase = new Map();

  for (const t of candidates) {
    const parsed = parsePlanLabel(t.name);
    if (!parsed || !parsed.level) continue;
    const key = `${parsed.base}::${t.total_weeks}`;
    if (!byBase.has(key)) {
      byBase.set(key, { base: parsed.base, totalWeeks: t.total_weeks, advanced: null, elite: null });
    }
    const bucket = byBase.get(key);
    if (parsed.level === "advanced") bucket.advanced = t;
    if (parsed.level === "elite") bucket.elite = t;
  }

  const actions = [];

  for (const bucket of byBase.values()) {
    if (!bucket.advanced || !bucket.elite) continue;

    const [advSessions, eliteSessions] = await Promise.all([
      listSessions(bucket.advanced.id),
      listSessions(bucket.elite.id),
    ]);

    const equal = canonicalizeSessions(advSessions) === canonicalizeSessions(eliteSessions);
    if (!equal) continue;

    const keep = bucket.advanced;
    const remove = bucket.elite;
    const newName = keep.name.replace(/\bAdvanced\b/i, "Advanced/Elite");

    actions.push({
      base: bucket.base,
      totalWeeks: bucket.totalWeeks,
      keep,
      remove,
      newName,
      sessions: advSessions.length,
    });
  }

  if (!actions.length) {
    console.log("No fully identical Advanced/Elite duplicates found.");
    return;
  }

  console.log(`Program: ${program.name} (${program.id})`);
  console.log(`Identical duplicate pairs found: ${actions.length}`);
  for (const action of actions) {
    console.log(`- ${action.keep.name} == ${action.remove.name} | sessions=${action.sessions}`);
  }

  if (!apply) {
    console.log("Dry run only. Re-run with --apply to execute dedupe.");
    return;
  }

  for (const action of actions) {
    // Repoint instances and schedule sessions first.
    await patch(
      `running_plan_instances?plan_template_id=eq.${encodeURIComponent(action.remove.id)}`,
      { plan_template_id: action.keep.id },
      "return=minimal"
    );

    await patch(
      `program_weekly_sessions?running_plan_template_id=eq.${encodeURIComponent(action.remove.id)}`,
      { running_plan_template_id: action.keep.id },
      "return=minimal"
    );

    // Rename canonical plan for clearer labeling.
    const updatedObjective = normalizeObjective(action.keep.objective);
    await patch(
      `running_plan_templates?id=eq.${encodeURIComponent(action.keep.id)}`,
      {
        name: action.newName,
        objective: updatedObjective,
      }
    );

    // Remove duplicate template (sessions cascade).
    await del(`running_plan_templates?id=eq.${encodeURIComponent(action.remove.id)}`);

    console.log(`DEDUPED: removed ${action.remove.name}, kept ${action.newName}`);
  }

  console.log(`Done. deduped=${actions.length}`);
}

function parsePlanLabel(name) {
  const text = String(name || "").trim();
  if (!text) return null;

  const advanced = /\bAdvanced\b/i.test(text);
  const elite = /\bElite\b/i.test(text);
  if (!advanced && !elite) return null;

  let level = null;
  if (advanced && !elite) level = "advanced";
  else if (!advanced && elite) level = "elite";
  else return null;

  const base = text.replace(/\s+\b(Advanced|Elite)\b\s*$/i, "").trim();
  return { base, level };
}

function normalizeObjective(value) {
  const raw = String(value || "").trim();
  if (!raw) return "Imported from aer-backend presets. Level Advanced/Elite.";

  let next = raw
    .replace(/level\s+Advanced\b/i, "level Advanced/Elite")
    .replace(/level\s+Elite\b/i, "level Advanced/Elite")
    .replace(/nível\s+Advanced\b/i, "nível Advanced/Elite")
    .replace(/nível\s+Elite\b/i, "nível Advanced/Elite");

  if (next === raw && !/Advanced\/Elite/i.test(next)) {
    next = `${next} (Level Advanced/Elite)`;
  }
  return next;
}

async function listSessions(planTemplateId) {
  const rows = await get(
    `running_plan_template_sessions?plan_template_id=eq.${encodeURIComponent(planTemplateId)}&select=week_number,session_key,session_type,progression_rule,workout_template_id,notes&order=week_number,session_key`
  );
  return Array.isArray(rows) ? rows : [];
}

function canonicalizeSessions(sessions) {
  const normalized = (sessions || []).map((s) => ({
    week_number: Number(s.week_number),
    session_key: String(s.session_key || ""),
    session_type: String(s.session_type || ""),
    workout_template_id: String(s.workout_template_id || ""),
    weekly_volume_pct: toPct(s?.progression_rule?.weekly_volume_pct),
    notes: String(s.notes || "").trim(),
  }));
  return JSON.stringify(normalized);
}

function toPct(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Number(n.toFixed(4));
}

async function resolveTargetProgram(programName) {
  const rows = await get(
    `training_programs?deleted_at=is.null&name=ilike.${encodeURIComponent(programName)}&select=id,name,external_id,status&order=created_at.desc&limit=5`
  );
  if (!Array.isArray(rows) || rows.length === 0) return null;
  const exact = rows.find((r) => String(r.name || "").trim().toLowerCase() === programName.toLowerCase());
  return exact || rows[0] || null;
}

async function get(pathAndQuery) {
  return request(pathAndQuery, { method: "GET" });
}

async function patch(pathAndQuery, body, prefer = "return=representation") {
  return request(pathAndQuery, {
    method: "PATCH",
    body,
    prefer,
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
