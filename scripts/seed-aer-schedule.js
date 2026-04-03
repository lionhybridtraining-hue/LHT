/**
 * Seed sessions and schedule presets for the AER (Athletic Endurance Runner) program.
 *
 * Creates:
 *   9 program_weekly_sessions (6 running + 3 strength)
 *   4 program_schedule_presets  (4, 5, 6, 7 training days/week)
 *   + program_schedule_slots for each preset
 *
 * Usage:
 *   node scripts/seed-aer-schedule.js
 *
 * Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (loaded from .env if present).
 */

try { require("dotenv").config(); } catch (_) {}

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("❌  Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

// ─── Minimal Supabase REST helper ──────────────────────────────────────────────
async function sb(path, { method = "GET", body, prefer } = {}) {
  const url = `${SUPABASE_URL}/rest/v1/${path}`;
  const headers = {
    apikey:        SERVICE_KEY,
    Authorization: `Bearer ${SERVICE_KEY}`,
    "Content-Type": "application/json",
    Accept:        "application/json",
  };
  if (prefer) headers.Prefer = prefer;

  const res = await fetch(url, {
    method,
    headers,
    body: body != null ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  if (!res.ok) throw new Error(`Supabase ${method} ${path} → ${res.status}: ${text}`);
  if (!text) return null;
  try { return JSON.parse(text); } catch { return text; }
}

// ─── Find AER program ──────────────────────────────────────────────────────────
async function findAerProgram() {
  const rows = await sb(
    "training_programs?external_id=eq.AER&deleted_at=is.null&select=id,name&limit=1"
  );
  if (!Array.isArray(rows) || !rows.length) {
    throw new Error("AER program not found (external_id = 'AER')");
  }
  return rows[0];
}

// ─── Session definitions ───────────────────────────────────────────────────────
function normalizeSession(s) {
  // Ensure all objects share the same key set for Supabase batch upsert
  return {
    training_program_id:  s.training_program_id,
    session_key:          s.session_key,
    session_type:         s.session_type,
    session_label:        s.session_label,
    strength_day_number:  s.strength_day_number  ?? null,
    running_session_type: s.running_session_type ?? null,
    duration_estimate_min: s.duration_estimate_min ?? null,
    intensity:            s.intensity ?? null,
    is_optional:          s.is_optional ?? false,
    sort_priority:        s.sort_priority ?? 0,
  };
}

function buildSessions(programId) {
  return [
    // ── Running sessions ──
    {
      training_program_id: programId,
      session_key: "easy_run",
      session_type: "running",
      session_label: "Corrida Fácil",
      running_session_type: "easy",
      duration_estimate_min: 45,
      intensity: "low",
      is_optional: false,
      sort_priority: 10,
    },
    {
      training_program_id: programId,
      session_key: "recovery_run",
      session_type: "running",
      session_label: "Corrida de Recuperação",
      running_session_type: "recovery",
      duration_estimate_min: 30,
      intensity: "low",
      is_optional: true,
      sort_priority: 11,
    },
    {
      training_program_id: programId,
      session_key: "long_run",
      session_type: "running",
      session_label: "Corrida Longa",
      running_session_type: "long",
      duration_estimate_min: 90,
      intensity: "low",
      is_optional: false,
      sort_priority: 12,
    },
    {
      training_program_id: programId,
      session_key: "threshold_run",
      session_type: "running",
      session_label: "Corrida de Limiar",
      running_session_type: "threshold",
      duration_estimate_min: 55,
      intensity: "high",
      is_optional: false,
      sort_priority: 13,
    },
    {
      training_program_id: programId,
      session_key: "interval_run",
      session_type: "running",
      session_label: "Intervalos",
      running_session_type: "interval",
      duration_estimate_min: 50,
      intensity: "very_high",
      is_optional: false,
      sort_priority: 14,
    },
    {
      training_program_id: programId,
      session_key: "tempo_run",
      session_type: "running",
      session_label: "Corrida de Tempo",
      running_session_type: "tempo",
      duration_estimate_min: 45,
      intensity: "high",
      is_optional: true,
      sort_priority: 15,
    },
    // ── Strength sessions ──
    {
      training_program_id: programId,
      session_key: "strength_a",
      session_type: "strength",
      session_label: "Força A — Inferior",
      strength_day_number: 1,
      duration_estimate_min: 60,
      intensity: "moderate",
      is_optional: false,
      sort_priority: 1,
    },
    {
      training_program_id: programId,
      session_key: "strength_b",
      session_type: "strength",
      session_label: "Força B — Superior + Core",
      strength_day_number: 2,
      duration_estimate_min: 55,
      intensity: "moderate",
      is_optional: false,
      sort_priority: 2,
    },
    {
      training_program_id: programId,
      session_key: "strength_c",
      session_type: "strength",
      session_label: "Força C — Potência",
      strength_day_number: 3,
      duration_estimate_min: 45,
      intensity: "high",
      is_optional: false,
      sort_priority: 3,
    },
  ];
}

// ─── Preset definitions ────────────────────────────────────────────────────────
// day_of_week: 0=Seg … 6=Dom  |  time_slot: 1=primary 2=secondary
function buildPresets(programId, sessionMap) {
  const S = (key) => {
    const id = sessionMap[key];
    if (!id) throw new Error(`Session key not found: ${key}`);
    return id;
  };

  return [
    // ── 4 dias — mínimo viável (2 corrida + 2 força) ──────────────────────────
    {
      meta: {
        training_program_id: programId,
        preset_name: "4 dias",
        description: "2 sessões de força + 2 corridas. Ideal para iniciar o programa com pouco tempo disponível.",
        total_training_days: 4,
        is_default: false,
        sort_order: 10,
      },
      slots: [
        { day_of_week: 0, time_slot: 1, session_key: "strength_a",  sort_order: 1  }, // Seg
        { day_of_week: 1, time_slot: 1, session_key: "easy_run",    sort_order: 2  }, // Ter
        { day_of_week: 3, time_slot: 1, session_key: "strength_b",  sort_order: 3  }, // Qui
        { day_of_week: 5, time_slot: 1, session_key: "long_run",    sort_order: 4  }, // Sáb
      ],
    },

    // ── 5 dias — padrão corrida (3 corrida + 2 força)  [DEFAULT] ──────────────
    {
      meta: {
        training_program_id: programId,
        preset_name: "5 dias — corrida",
        description: "2 sessões de força + 3 corridas incluindo uma sessão de qualidade. Equilíbrio ideal para a maioria dos atletas.",
        total_training_days: 5,
        is_default: true,
        sort_order: 20,
      },
      slots: [
        { day_of_week: 0, time_slot: 1, session_key: "strength_a",    sort_order: 1  }, // Seg
        { day_of_week: 1, time_slot: 1, session_key: "easy_run",      sort_order: 2  }, // Ter
        { day_of_week: 2, time_slot: 1, session_key: "strength_b",    sort_order: 3  }, // Qua
        { day_of_week: 3, time_slot: 1, session_key: "threshold_run", sort_order: 4  }, // Qui
        { day_of_week: 5, time_slot: 1, session_key: "long_run",      sort_order: 5  }, // Sáb
      ],
    },

    // ── 5 dias — força (2 corrida + 3 força) ──────────────────────────────────
    {
      meta: {
        training_program_id: programId,
        preset_name: "5 dias — força",
        description: "3 sessões de força + 2 corridas. Ideal para atletas que querem priorizar ganhos de força.",
        total_training_days: 5,
        is_default: false,
        sort_order: 30,
      },
      slots: [
        { day_of_week: 0, time_slot: 1, session_key: "strength_a", sort_order: 1  }, // Seg
        { day_of_week: 1, time_slot: 1, session_key: "easy_run",   sort_order: 2  }, // Ter
        { day_of_week: 2, time_slot: 1, session_key: "strength_b", sort_order: 3  }, // Qua
        { day_of_week: 4, time_slot: 1, session_key: "strength_c", sort_order: 4  }, // Sex
        { day_of_week: 6, time_slot: 1, session_key: "long_run",   sort_order: 5  }, // Dom
      ],
    },

    // ── 6 dias — completo (3 corrida + 3 força) ───────────────────────────────
    {
      meta: {
        training_program_id: programId,
        preset_name: "6 dias",
        description: "3 sessões de força + 3 corridas com sessão de qualidade. Programa completo recomendado.",
        total_training_days: 6,
        is_default: false,
        sort_order: 40,
      },
      slots: [
        { day_of_week: 0, time_slot: 1, session_key: "strength_a",    sort_order: 1  }, // Seg
        { day_of_week: 1, time_slot: 1, session_key: "easy_run",      sort_order: 2  }, // Ter
        { day_of_week: 2, time_slot: 1, session_key: "strength_b",    sort_order: 3  }, // Qua
        { day_of_week: 3, time_slot: 1, session_key: "threshold_run", sort_order: 4  }, // Qui
        { day_of_week: 4, time_slot: 1, session_key: "strength_c",    sort_order: 5  }, // Sex
        { day_of_week: 5, time_slot: 1, session_key: "long_run",      sort_order: 6  }, // Sáb
      ],
    },

    // ── 7 dias — alto volume (4 corrida + 3 força) ────────────────────────────
    {
      meta: {
        training_program_id: programId,
        preset_name: "7 dias",
        description: "3 sessões de força + 4 corridas incluindo intervalos. Para atletas experientes com alto volume de treino.",
        total_training_days: 7,
        is_default: false,
        sort_order: 50,
      },
      slots: [
        { day_of_week: 0, time_slot: 1, session_key: "strength_a",    sort_order: 1  }, // Seg
        { day_of_week: 1, time_slot: 1, session_key: "easy_run",      sort_order: 2  }, // Ter
        { day_of_week: 2, time_slot: 1, session_key: "strength_b",    sort_order: 3  }, // Qua
        { day_of_week: 3, time_slot: 1, session_key: "interval_run",  sort_order: 4  }, // Qui
        { day_of_week: 4, time_slot: 1, session_key: "strength_c",    sort_order: 5  }, // Sex
        { day_of_week: 5, time_slot: 1, session_key: "long_run",      sort_order: 6  }, // Sáb
        { day_of_week: 6, time_slot: 1, session_key: "recovery_run",  sort_order: 7  }, // Dom
      ],
    },
  ].map((p) => ({
    meta: p.meta,
    slots: p.slots.map((slot) => ({ ...slot, session_id: S(slot.session_key) })),
  }));
}

// ─── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log("🔍  Finding AER program…");
  const program = await findAerProgram();
  console.log(`✅  Found: "${program.name}" (${program.id})`);

  // 1. Upsert sessions
  console.log("\n📝  Upserting sessions…");
  const sessions = buildSessions(program.id).map(normalizeSession);
  const upserted = await sb(
    "program_weekly_sessions?on_conflict=training_program_id,session_key",
    {
      method: "POST",
      prefer: "return=representation,resolution=merge-duplicates",
      body: sessions,
    }
  );

  const sessionMap = {};
  (Array.isArray(upserted) ? upserted : []).forEach((s) => {
    sessionMap[s.session_key] = s.id;
  });
  console.log(`   ${Object.keys(sessionMap).length} sessions upserted.`);

  if (Object.keys(sessionMap).length === 0) {
    // Fallback: fetch existing
    console.log("   Fetching existing sessions…");
    const existing = await sb(
      `program_weekly_sessions?training_program_id=eq.${program.id}&order=sort_priority.asc`
    );
    (Array.isArray(existing) ? existing : []).forEach((s) => {
      sessionMap[s.session_key] = s.id;
    });
    console.log(`   ${Object.keys(sessionMap).length} sessions loaded.`);
  }

  // 2. Build and seed presets
  console.log("\n📅  Seeding presets…");
  const presets = buildPresets(program.id, sessionMap);

  for (const p of presets) {
    const { meta, slots } = p;

    // Find existing preset by name to allow idempotent runs
    const existingRows = await sb(
      `program_schedule_presets?training_program_id=eq.${program.id}&preset_name=eq.${encodeURIComponent(meta.preset_name)}&select=id`
    );
    let presetId;

    if (Array.isArray(existingRows) && existingRows.length) {
      presetId = existingRows[0].id;
      // Update metadata
      await sb(`program_schedule_presets?id=eq.${presetId}`, {
        method: "PATCH",
        prefer: "return=representation",
        body: {
          description:       meta.description,
          total_training_days: meta.total_training_days,
          is_default:        meta.is_default,
          sort_order:        meta.sort_order,
        },
      });
      console.log(`   ↩  Updated preset "${meta.preset_name}" (${presetId})`);
    } else {
      const created = await sb("program_schedule_presets", {
        method: "POST",
        prefer: "return=representation",
        body: [meta],
      });
      presetId = Array.isArray(created) ? created[0].id : created.id;
      console.log(`   ✚  Created preset "${meta.preset_name}" (${presetId})`);
    }

    // Delete existing slots for this preset, then re-insert
    await sb(`program_schedule_slots?preset_id=eq.${presetId}`, { method: "DELETE" });

    const slotsWithPreset = slots.map(({ session_key: _sk, ...slot }) => ({ ...slot, preset_id: presetId }));
    await sb("program_schedule_slots?on_conflict=preset_id,day_of_week,time_slot", {
      method: "POST",
      prefer: "return=representation,resolution=merge-duplicates",
      body: slotsWithPreset,
    });
    console.log(`      ${slots.length} slots written.`);
  }

  console.log("\n🎉  Done! AER program schedule is ready.");
  console.log("\nSummary:");
  console.log(`   Program  : ${program.name} (${program.id})`);
  console.log(`   Sessions : ${Object.keys(sessionMap).length}`);
  console.log(`   Presets  : ${presets.length} (4 dias / 5 dias corrida / 5 dias força / 6 dias / 7 dias)`);
}

main().catch((err) => {
  console.error("❌  Error:", err.message);
  process.exit(1);
});
