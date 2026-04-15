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

const LEVELS = ["Beginner", "Novice", "Intermediate", "Advanced", "Elite"];
const LEVEL_PRIORITY = new Map(LEVELS.map((l, idx) => [l.toLowerCase(), idx]));

main().catch((err) => {
  console.error(err?.message || err);
  process.exit(1);
});

async function main() {
  const program = await resolveTargetProgram(targetProgramName);
  if (!program) throw new Error(`Program not found: ${targetProgramName}`);

  const allAERLegacy = await get(
    `running_plan_templates?name=ilike.${encodeURIComponent("AER Legacy %")}&select=id,name,objective,total_weeks,status,training_program_id&order=name`
  );

  const outsideTarget = allAERLegacy.filter((t) => String(t.training_program_id || "") !== String(program.id));

  const templatesInTarget = allAERLegacy.filter((t) => String(t.training_program_id || "") === String(program.id));
  const dedupePlan = await buildDedupePlan(templatesInTarget);

  console.log(`Program: ${program.name} (${program.id})`);
  console.log(`AER Legacy templates total: ${allAERLegacy.length}`);
  console.log(`Need reassociation to target: ${outsideTarget.length}`);
  console.log(`Duplicate level groups found: ${dedupePlan.length}`);

  for (const grp of dedupePlan) {
    console.log(`- ${grp.prefix} | merged=${grp.mergeLevels.join("/")} | keep=${grp.keep.name}`);
    for (const r of grp.remove) {
      console.log(`  remove=${r.name}`);
    }
  }

  if (!apply) {
    console.log("Dry run only. Re-run with --apply to execute.");
    return;
  }

  // 1) Reassociate every AER Legacy plan to Athletic Endurance Runner.
  for (const t of outsideTarget) {
    await patch(
      `running_plan_templates?id=eq.${encodeURIComponent(t.id)}`,
      { training_program_id: program.id },
      "return=minimal"
    );
    console.log(`MOVED: ${t.name} -> ${program.name}`);
  }

  // 2) Dedupe fully identical level plans in target program.
  for (const grp of dedupePlan) {
    const keep = grp.keep;
    const newName = grp.newName;

    for (const dup of grp.remove) {
      await patch(
        `running_plan_instances?plan_template_id=eq.${encodeURIComponent(dup.id)}`,
        { plan_template_id: keep.id },
        "return=minimal"
      );

      await patch(
        `program_weekly_sessions?running_plan_template_id=eq.${encodeURIComponent(dup.id)}`,
        { running_plan_template_id: keep.id },
        "return=minimal"
      );

      await del(`running_plan_templates?id=eq.${encodeURIComponent(dup.id)}`);
      console.log(`DEDUPED: removed ${dup.name}`);
    }

    await patch(
      `running_plan_templates?id=eq.${encodeURIComponent(keep.id)}`,
      {
        name: newName,
        objective: normalizeObjective(keep.objective, grp.mergeLevels),
      },
      "return=minimal"
    );
    console.log(`RENAMED: ${keep.name} -> ${newName}`);
  }

  console.log(`Done. moved=${outsideTarget.length}, deduped_groups=${dedupePlan.length}`);
}

async function buildDedupePlan(targetTemplates) {
  const parsed = targetTemplates
    .map((t) => ({ template: t, parsed: parseSingleLevelName(t.name) }))
    .filter((row) => row.parsed != null);

  const byBucket = new Map();
  for (const row of parsed) {
    const key = `${row.parsed.prefix}::${row.template.total_weeks}`;
    if (!byBucket.has(key)) byBucket.set(key, []);
    byBucket.get(key).push(row);
  }

  const plan = [];

  for (const [bucketKey, rows] of byBucket.entries()) {
    const withSignature = [];
    for (const row of rows) {
      const sessions = await listSessions(row.template.id);
      withSignature.push({
        ...row,
        signature: canonicalizeSessions(sessions),
      });
    }

    const bySignature = new Map();
    for (const row of withSignature) {
      if (!bySignature.has(row.signature)) bySignature.set(row.signature, []);
      bySignature.get(row.signature).push(row);
    }

    for (const sigRows of bySignature.values()) {
      if (sigRows.length < 2) continue;

      const sorted = sigRows.slice().sort((a, b) => {
        const pa = LEVEL_PRIORITY.get(a.parsed.level.toLowerCase()) ?? 999;
        const pb = LEVEL_PRIORITY.get(b.parsed.level.toLowerCase()) ?? 999;
        return pa - pb;
      });

      const keep = sorted[0].template;
      const remove = sorted.slice(1).map((r) => r.template);
      const mergeLevels = sorted.map((r) => r.parsed.level);
      const prefix = sorted[0].parsed.prefix;

      plan.push({
        bucketKey,
        prefix,
        keep,
        remove,
        mergeLevels,
        newName: `${prefix} ${mergeLevels.join("/")}`,
      });
    }
  }

  return plan;
}

function parseSingleLevelName(name) {
  const text = String(name || "").trim();
  if (!text.startsWith("AER Legacy ")) return null;

  // Reject already merged labels like Advanced/Elite.
  if (text.includes("/")) return null;

  const m = text.match(/^(.*)\s(Beginner|Novice|Intermediate|Advanced|Elite)$/i);
  if (!m) return null;

  return {
    prefix: m[1].trim(),
    level: normalizeLevel(m[2]),
  };
}

function normalizeLevel(level) {
  const found = LEVELS.find((l) => l.toLowerCase() === String(level || "").toLowerCase());
  return found || String(level || "");
}

function normalizeObjective(value, levels) {
  const raw = String(value || "").trim();
  const label = levels.join("/");
  if (!raw) return `Imported from aer-backend presets. Level ${label}.`;

  const replaced = raw.replace(/level\s+([A-Za-z\/]+)/i, `level ${label}`);
  if (replaced !== raw) return replaced;
  return `${raw} (Level ${label})`;
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
